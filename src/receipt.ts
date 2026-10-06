import type { Receipt, Settings, SalesReport, PrintDocument } from './model';
export function wrap(text: string, width: number): string[] {
  const result: string[] = []; let line = '';
  for (let word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) { result.push(line); line = ''; }
    while (word.length > width) { result.push(word.slice(0,width)); word = word.slice(width); }
    if (word) line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result;
}
const money = (paise: number) => (paise / 100).toFixed(2);
function pair(left: string, right: string, width: number): string[] {
  const parts = wrap(left, Math.max(1,width-right.length-1));
  const last = parts.pop() ?? '';
  return [...parts, last.padEnd(width-right.length) + right];
}
export function receiptText(bill: Receipt, settings: Settings): string {
  const width = settings.columns;
  const center = (s: string) => wrap(s,width).map(v => ' '.repeat(Math.floor((width-v.length)/2))+v);
  const rule = '-'.repeat(width);
  const lines = [...center(bill.businessName), ...bill.address.flatMap(center), ...(bill.phone ? center(bill.phone) : []), rule,
    ...wrap(`Bill: ${bill.billNumber}`,width), ...(bill.orderType ? wrap(bill.orderType,width) : []), ...(bill.customerPhone ? wrap(`Customer phone: ${bill.customerPhone}`,width) : []), ...wrap(new Date(bill.issuedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:true}),width), rule];
  let subtotal = 0;
  for (const item of bill.items) {
    const amount = item.quantity * item.unitPricePaise; subtotal += amount;
    lines.push(...wrap(item.name,width), ...pair(`  ${item.quantity} x ${money(item.unitPricePaise)}`,money(amount),width));
  }
  lines.push(rule,...pair('Subtotal',money(subtotal),width));
  if (bill.taxPaise) lines.push(...pair('Tax',money(bill.taxPaise),width));
  if (bill.discountPaise) lines.push(...pair('Discount',`-${money(bill.discountPaise)}`,width));
  lines.push(...pair('TOTAL INR',money(subtotal+bill.taxPaise-bill.discountPaise),width), ...(bill.paymentMode ? wrap(`Payment: ${bill.paymentMode === 'cash' ? 'Cash' : 'Online'}`,width) : []),rule,...center(bill.footer));
  return lines.join('\n')+'\n';
}
export function cutBytes(mode: Settings['cut']): Buffer {
  return mode === 'none' ? Buffer.alloc(0) : Buffer.from([0x1d,0x56,mode==='full'?0:1]);
}
export function receiptBytes(bill: Receipt, settings: Settings): Buffer {
  return Buffer.concat([Buffer.from([0x1b,0x40,0x1b,0x61,0]),Buffer.from(receiptText(bill,settings),'ascii'),Buffer.from('\n'.repeat(settings.feedLines)),cutBytes(settings.cut)]);
}

export function reportText(report:SalesReport,settings:Settings):string {
 const width=settings.columns;const rule='-'.repeat(width);
 const lines=[...wrap(report.businessName,width),...wrap(report.title,width),...wrap(report.periodLabel+' - Local time',width),rule,
  ...pair('Total sales INR',money(report.totalPaise),width),...wrap(`${report.billCount} confirmed bills`,width)];
 for(const section of report.sections){
  lines.push(rule,...wrap(section.heading,width));
  if(!section.rows.length)lines.push('No sales in this period');
  for(const row of section.rows)lines.push(...pair(' '.repeat(row.indent*2)+row.label,money(row.amountPaise),width));
 }
 lines.push(rule,...report.notes.flatMap(note=>wrap(note,width)));
 return lines.join('\n')+'\n';
}
export function documentBytes(document:PrintDocument,settings:Settings):Buffer {
 if('kind' in document && document.kind==='sales-report')return Buffer.concat([Buffer.from([0x1b,0x40,0x1b,0x61,0]),Buffer.from(reportText(document,settings),'ascii'),Buffer.from('\n'.repeat(settings.feedLines)),cutBytes(settings.cut)]);
 return receiptBytes(document as Receipt,settings);
}
