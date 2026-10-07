import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRealtimeHub } from './realtime-hub.js';

const hub=createRealtimeHub(async()=>{
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  await client.realtime.setAuth(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return client;
});
// Firebase JWT verification happens before this function; only public signals
// and the verified user's private topic are forwarded to each browser.
export async function changeStream(request: Request, uid: string|null, cors: Record<string,string>) {
  const encoder=new TextEncoder();
  let closed=false, heartbeat:ReturnType<typeof setInterval>, expiry:ReturnType<typeof setTimeout>;
  let controller:ReadableStreamDefaultController<Uint8Array>;
  const stops:Array<()=>void>=[];
  const cleanup=()=>{
    if(closed)return;closed=true;clearInterval(heartbeat);clearTimeout(expiry);
    request.signal.removeEventListener('abort',cleanup);for(const stop of stops)stop();
    try{controller.close();}catch{/* Reader already cancelled. */}
  };
  const body=new ReadableStream<Uint8Array>({
    start(c){
      controller=c;if(request.signal.aborted){cleanup();return;}
      const send=(event:string,data:unknown)=>{if(!closed)c.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
      const topics=['korae:public',...(uid?['korae:user:'+uid]:[])],ready=new Set<string>();
      for(const topic of topics)stops.push(hub.subscribe(topic,()=>{
        ready.add(topic);if(ready.size===topics.length)send('ready',{});
      },payload=>send('change',payload),status=>{send('unavailable',{status});cleanup();}));
      heartbeat=setInterval(()=>{if(!closed)c.enqueue(encoder.encode(': heartbeat\n\n'));},20000);
      // Free Edge workers have a finite lifetime; retain bounded reconnects.
      expiry=setTimeout(cleanup,120000);request.signal.addEventListener('abort',cleanup,{once:true});
      if(request.signal.aborted)cleanup();
    },cancel:cleanup,
  });
  return new Response(body,{headers:{...cors,'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
