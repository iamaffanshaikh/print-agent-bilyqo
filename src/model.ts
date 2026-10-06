import { z } from 'zod';
// Restrict controls and encoding: arbitrary printer commands must never enter text fields.
const text = (max: number) => z.string().trim().min(1).max(max).regex(/^[\x20-\x7e]+$/, 'Use printable ASCII characters for this printer profile');
export const receiptSchema = z.object({
  jobId: z.string().uuid(), billNumber: text(48), businessName: text(80),
  address: z.array(text(100)).max(4).default([]), phone: text(40).optional(),
  issuedAt: z.string().datetime({ offset: true }), currency: z.literal('INR').default('INR'),
  items: z.array(z.object({name: text(120), quantity: z.number().int().positive().max(999), unitPricePaise: z.number().int().nonnegative().max(100_000_000)}).strict()).min(1).max(200),
  taxPaise: z.number().int().nonnegative().max(100_000_000).default(0),
  discountPaise: z.number().int().nonnegative().max(100_000_000).default(0),
  orderType: text(60).optional(), customerPhone: text(40).optional(),
  paymentMode: z.enum(['cash','online']).optional(),
  footer: text(120).default('Thank you. Visit again!')
}).strict().superRefine((value, ctx) => {
  const subtotal = value.items.reduce((sum, item) => sum + item.quantity * item.unitPricePaise, 0);
  if (value.discountPaise > subtotal + value.taxPaise) ctx.addIssue({code:'custom', message:'Discount exceeds bill value', path:['discountPaise']});
});
export const settingsSchema = z.object({
  printer: z.string().max(256).default(''), paper: z.enum(['58mm','80mm']).default('80mm'),
  columns: z.number().int().min(24).max(64).default(48), cut: z.enum(['none','partial','full']).default('full'),
  feedLines: z.number().int().min(2).max(8).default(3), autoStart: z.boolean().default(false),
  allowedOrigins: z.array(z.string().url().refine(v => { const u = new URL(v); return u.protocol === 'https:' && u.origin === v; }, 'Enter an HTTPS origin without a trailing slash')).min(1).max(8).default(['https://bilyqo.usmaniyaz.com'])
}).strict();
export type Receipt = z.infer<typeof receiptSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type JobState = 'queued' | 'sending' | 'submitted' | 'uncertain' | 'failed';
export const example = (): Receipt => ({jobId:crypto.randomUUID(), billNumber:'TEST-001', businessName:'Bilyqo Restaurant', address:['Printer setup receipt'], issuedAt:new Date().toISOString(), currency:'INR', items:[{name:'Paneer Butter Masala',quantity:2,unitPricePaise:22000},{name:'Butter Naan',quantity:3,unitPricePaise:4500}],taxPaise:2875,discountPaise:0,footer:'Test receipt - not a customer bill'});
