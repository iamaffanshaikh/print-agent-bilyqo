import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { documentSchema } from './model';
import { Store } from './store';
import { Queue } from './queue';
export const PORT = 17891;
export function createApi(store:Store,queue:Queue,preview=false) {
  const api = Fastify({bodyLimit:128*1024,logger:false});
  api.addHook('onRequest',async (req,reply) => {
    if (!['127.0.0.1',`127.0.0.1:${PORT}`].includes(req.headers.host ?? '')) return reply.code(403).send({error:'Invalid host'});
    const origin = req.headers.origin;
    if (origin && !store.settings().allowedOrigins.includes(origin)) return reply.code(403).send({error:'Origin not paired'});
    if (origin) {
      reply.header('Access-Control-Allow-Origin',origin).header('Vary','Origin');
      // Browsers may require a local-network permission in addition to CORS.
      reply.header('Access-Control-Allow-Private-Network','true');
    }
    if (req.method==='OPTIONS') return reply.header('Access-Control-Allow-Methods','GET, POST, OPTIONS').header('Access-Control-Allow-Headers','Content-Type, Authorization').code(204).send();
    const supplied = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /,''));
    const expected = Buffer.from(store.token());
    if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return reply.code(401).send({error:'Pairing token required'});
  });
  api.get('/v1/health',async()=>({name:'Bilyqo Print Agent',version:require('../package.json').version,preview,capabilities:['receipt','sales-report']}));
  api.post('/v1/jobs',async(req,reply)=> {
    const parsed = documentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({error:parsed.error.issues});
    const profile = store.settings();
    if (!profile.printer) return reply.code(409).send({error:'Select a printer in the agent first'});
    try { const result = store.enqueue(parsed.data,profile); void queue.drain(); return reply.code(result.duplicate?200:202).send(result); }
    catch(error) { return reply.code(409).send({error:error instanceof Error ? error.message : 'Job conflict'}); }
  });
  api.get<{Params:{id:string}}>('/v1/jobs/:id',async(req,reply)=> {
    const job = store.publicJob(req.params.id); return job ?? reply.code(404).send({error:'Job not found'});
  });
  return api;
}
