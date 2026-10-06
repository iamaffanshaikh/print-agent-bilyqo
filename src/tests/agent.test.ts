import { test } from 'node:test';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../store';
import { receiptSchema,settingsSchema,example } from '../model';
import { receiptText,receiptBytes } from '../receipt';
import { createApi, PORT } from '../api';
import { Queue } from '../queue';
import { Printer } from '../printer';
test('receipt wraps long items, calculates integer money, and cuts only at end',()=>{
 const bill=example();bill.items=[{name:'A very long dish description with additional modifiers and toppings',quantity:3,unitPricePaise:1999}];bill.taxPaise=0;
 const profile=settingsSchema.parse({columns:32,cut:'partial'});const text=receiptText(bill,profile);
 assert.ok(text.includes('59.97'));assert.ok(text.split('\n').every(line=>line.length<=32));
 const bytes=receiptBytes(bill,profile);assert.deepEqual([...bytes.subarray(-3)],[29,86,1]);
 assert.equal(receiptBytes(bill,{...profile,cut:'none'}).includes(Buffer.from([29,86])),false);
});
test('rejects command injection, unsupported text, excessive discount and extra fields',()=>{
 assert.equal(receiptSchema.safeParse({...example(),businessName:'Bad\x1b@'}).success,false);
 assert.equal(receiptSchema.safeParse({...example(),businessName:'नमस्ते'}).success,false);
 assert.equal(receiptSchema.safeParse({...example(),discountPaise:10000000}).success,false);
 assert.equal(receiptSchema.safeParse({...example(),raw:'command'}).success,false);
});
test('deduplication preserves original settings and never reprints an existing ID',()=>{
 const store=new Store(':memory:');const bill=example();const profile=settingsSchema.parse({printer:'Test'});
 assert.equal(store.enqueue(bill,profile).duplicate,false);assert.equal(store.enqueue(bill,{...profile,columns:32}).duplicate,true);
 assert.throws(()=>store.enqueue({...bill,businessName:'Changed'},profile),/different receipt/);
 assert.equal(store.next()?.profile,JSON.stringify(profile));store.close();
});
test('authenticated API rejects wrong origins, hosts, and conflicting jobs',async()=>{
 const store=new Store(':memory:');store.saveSettings(settingsSchema.parse({printer:'Preview'}));
 const api=createApi(store,new Queue(store,new Printer('',true)));const bill=example();
 const headers={host:`127.0.0.1:${PORT}`,authorization:`Bearer ${store.token()}`,origin:'https://bilyqo.usmaniyaz.com'};
 assert.equal((await api.inject({method:'GET',url:'/v1/health',headers:{host:headers.host}})).statusCode,401);
 assert.equal((await api.inject({method:'GET',url:'/v1/health',headers:{...headers,origin:'https://evil.example'}})).statusCode,403);
 assert.equal((await api.inject({method:'GET',url:'/v1/health',headers:{...headers,host:'evil.example'}})).statusCode,403);
 assert.equal((await api.inject({method:'POST',url:'/v1/jobs',headers,payload:bill})).statusCode,202);
 assert.equal((await api.inject({method:'POST',url:'/v1/jobs',headers,payload:bill})).statusCode,200);
 assert.equal((await api.inject({method:'POST',url:'/v1/jobs',headers,payload:{...bill,businessName:'Different'}})).statusCode,409);
 await api.close();store.close();
});

test('queue serializes receipts and never automatically retries uncertain output',async()=>{
 const store=new Store(':memory:');let count=0;let active=0;let maxActive=0;
 const printer={send:async()=>{count++;active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setTimeout(r,5));active--;if(count===1)throw new Error('Disconnected after write');return 42;}} as unknown as Printer;
 const queue=new Queue(store,printer);const profile=settingsSchema.parse({printer:'Test'});
 const first=example(),second=example();store.enqueue(first,profile);store.enqueue(second,profile);
 await Promise.all([queue.drain(),queue.drain()]);
 assert.equal(store.publicJob(first.jobId)?.state,'uncertain');assert.equal(store.publicJob(second.jobId)?.state,'submitted');assert.equal(maxActive,1);
 store.enqueue(first,profile);await queue.drain();assert.equal(count,2);store.close();
});


test('restart persists queue and marks interrupted sends uncertain',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bilyqo-recovery-'));const path=join(dir,'queue.sqlite');
 try {
  let store=new Store(path);const token=store.token();const first=example(),second=example();const profile=settingsSchema.parse({printer:'Test'});
  store.enqueue(first,profile);store.enqueue(second,profile);store.update(first.jobId,'sending');store.close();
  store=new Store(path);assert.equal(store.token(),token);assert.equal(store.publicJob(first.jobId)?.state,'uncertain');assert.equal(store.next()?.id,second.jobId);store.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});


test('restaurant context survives formatting without dropping payment or customer details',()=>{
 const receipt=receiptSchema.parse({...example(),orderType:'Take Away - Shop',customerPhone:'9876543210',paymentMode:'online'});
 const output=receiptText(receipt,settingsSchema.parse({columns:32}));
 assert.ok(output.includes('Take Away - Shop'));assert.ok(output.includes('9876543210'));assert.ok(output.includes('Payment: Online'));
});


test('default receipt includes one full cut after the content and trailing feed',()=>{
 const profile=settingsSchema.parse({});assert.equal(profile.cut,'full');
 const data=receiptBytes(example(),profile);
 assert.deepEqual([...data.subarray(-3)],[29,86,0]);
 assert.equal(data.indexOf(Buffer.from([29,86,0])),data.length-3);
});
test('upgrade enables cutting once and preserves later explicit disabling',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bilyqo-cut-upgrade-'));const path=join(dir,'queue.sqlite');
 try {
  let store=new Store(path);store.saveSettings(settingsSchema.parse({printer:'Test',cut:'none'}));
  store.db.prepare("DELETE FROM config WHERE key='cut-default-v2'").run();store.close();
  store=new Store(path);assert.equal(store.settings().cut,'full');assert.equal(store.settings().printer,'Test');
  store.saveSettings({...store.settings(),cut:'none'});store.close();
  store=new Store(path);assert.equal(store.settings().cut,'none');store.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
