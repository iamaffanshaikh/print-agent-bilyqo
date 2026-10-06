import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);
export class Printer {
  constructor(private helper: string, readonly preview: boolean) {}
  private async request(payload: object): Promise<unknown> {
    const dir = await mkdtemp(join(tmpdir(),'bilyqo-print-'));
    try {
      const path = join(dir,'request.json'); await writeFile(path,JSON.stringify(payload),{mode:0o600});
      const {stdout} = await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',this.helper,'-RequestPath',path],{windowsHide:true,timeout:30_000,maxBuffer:1024*1024});
      return JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    } finally { await rm(dir,{recursive:true,force:true}); }
  }
  async list(): Promise<string[]> {
    if (this.preview) return ['Preview printer (no paper output)'];
    return await this.request({action:'list'}) as string[];
  }
  private tail: Promise<unknown> = Promise.resolve();
  send(printer: string,data: Buffer): Promise<number> {
    const next = this.tail.then(() => this.sendNow(printer,data));
    this.tail = next.catch(() => {});
    return next;
  }
  private async sendNow(printer: string,data: Buffer): Promise<number> {
    if (this.preview) return 0;
    const result = await this.request({action:'print',printer,data:data.toString('base64')}) as {spoolId:number};
    return result.spoolId;
  }
}
