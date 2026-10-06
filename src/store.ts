import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { settingsSchema, type PrintDocument, type Settings, type JobState } from './model';
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, profile TEXT NOT NULL, state TEXT NOT NULL, createdAt TEXT NOT NULL, error TEXT, spoolId INTEGER);`);
    // Upgrade the original no-cut default once. Later explicit choices remain intact.
    if (!this.read('cut-default-v2')) {
      const profile = this.settings();
      if (profile.cut === 'none') this.saveSettings({...profile,cut:'full'});
      this.write('cut-default-v2','1');
    }
    if (!this.read('token')) this.write('token',randomBytes(32).toString('hex'));
    this.db.prepare("UPDATE jobs SET state='uncertain',error='Agent stopped during submission. Check printer before reprinting.' WHERE state='sending'").run();
  }
  read(key: string): string | undefined { return (this.db.prepare('SELECT value FROM config WHERE key=?').get(key) as {value:string}|undefined)?.value; }
  write(key: string,value: string) { this.db.prepare('INSERT INTO config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value); }
  settings(): Settings { return settingsSchema.parse(JSON.parse(this.read('settings') ?? '{}')); }
  saveSettings(settings: Settings) { this.write('settings',JSON.stringify(settings)); }
  token() { return this.read('token')!; }
  rotateToken() { this.write('token',randomBytes(32).toString('hex')); return this.token(); }
  enqueue(bill: PrintDocument, profile: Settings) {
    const payload = JSON.stringify(bill); const fingerprint = createHash('sha256').update(payload).digest('hex');
    const existing = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(bill.jobId);
    if (existing) { if (existing.fingerprint !== fingerprint) throw new Error('Job ID already belongs to a different receipt'); return {duplicate:true, job:this.publicJob(bill.jobId)}; }
    this.db.prepare("INSERT INTO jobs(id,fingerprint,payload,profile,state,createdAt) VALUES(?,?,?,?,'queued',?)").run(bill.jobId,fingerprint,payload,JSON.stringify(profile),new Date().toISOString());
    return {duplicate:false,job:this.publicJob(bill.jobId)};
  }
  next() { return this.db.prepare("SELECT * FROM jobs WHERE state='queued' ORDER BY createdAt,rowid LIMIT 1").get() as {id:string,payload:string,profile:string}|undefined; }
  hasPendingJobs() { return !!this.db.prepare("SELECT 1 FROM jobs WHERE state IN ('queued','sending') LIMIT 1").get(); }
  update(id:string,state:JobState,error:string|null=null,spoolId:number|null=null) { this.db.prepare('UPDATE jobs SET state=?,error=?,spoolId=? WHERE id=?').run(state,error,spoolId,id); }
  publicJob(id:string) { return this.db.prepare('SELECT id,state,createdAt,error,spoolId FROM jobs WHERE id=?').get(id); }
  list() { return this.db.prepare('SELECT id,state,createdAt,error,spoolId FROM jobs ORDER BY createdAt DESC,rowid DESC LIMIT 50').all(); }
  close() { this.db.close(); }
}
