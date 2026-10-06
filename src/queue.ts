import { receiptBytes } from './receipt';
import { receiptSchema, settingsSchema } from './model';
import { Store } from './store';
import { Printer } from './printer';
export class Queue {
  private running = false;
  constructor(private store: Store, private printer: Printer) {}
  async drain() {
    if (this.running) {
      while (this.running) await new Promise(resolve => setTimeout(resolve, 50));
      return;
    }
    this.running = true;
    try {
      for (let job = this.store.next(); job; job = this.store.next()) {
        let data:Buffer; let printer:string;
        try {
          const profile = settingsSchema.parse(JSON.parse(job.profile));
          if (!profile.printer) throw new Error('No printer selected');
          printer = profile.printer;
          data = receiptBytes(receiptSchema.parse(JSON.parse(job.payload)),profile);
        } catch (error) { this.store.update(job.id,'failed',error instanceof Error ? error.message : 'Invalid receipt'); continue; }
        this.store.update(job.id,'sending');
        try { const spoolId = await this.printer.send(printer,data); this.store.update(job.id,'submitted',null,spoolId); }
        catch (error) { this.store.update(job.id,'uncertain',error instanceof Error ? error.message : 'Printer submission failed'); }
      }
    } finally { this.running = false; }
  }
}
