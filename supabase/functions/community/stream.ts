import { createClient } from 'npm:@supabase/supabase-js@2';

// The browser never receives a service key or permission to subscribe to arbitrary
// private topics. uid is taken exclusively from the verified Firebase JWT.
export async function changeStream(request: Request, uid: string|null, cors: Record<string,string>) {
  const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  await supabase.realtime.setAuth(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const encoder=new TextEncoder();
  let closed=false, heartbeat:ReturnType<typeof setInterval>, expiry:ReturnType<typeof setTimeout>;
  let controller:ReadableStreamDefaultController<Uint8Array>;
  const cleanup=()=>{
    if(closed)return;closed=true;clearInterval(heartbeat);clearTimeout(expiry);
    request.signal.removeEventListener('abort',cleanup);void supabase.removeAllChannels();
    try{controller.close();}catch{/* Reader already cancelled. */}
  };
  const body=new ReadableStream<Uint8Array>({
    start(c){
      controller=c;
      const send=(event:string,data:unknown)=>{if(!closed)c.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
      const topics=['korae:public',...(uid?['korae:user:'+uid]:[])];let ready=0;
      for(const topic of topics){
        supabase.channel(topic,{config:{private:true}}).on('broadcast',{event:'change'},({payload})=>send('change',payload))
          .subscribe(status=>{
            if(status==='SUBSCRIBED' && ++ready===topics.length)send('ready',{});
            if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){send('unavailable',{status});cleanup();}
          });
      }
      heartbeat=setInterval(()=>{if(!closed)c.enqueue(encoder.encode(': heartbeat\n\n'));},20000);
      // Reconnect before Edge lifetime and token expiration; heartbeat never queries DB.
      expiry=setTimeout(cleanup,120000);request.signal.addEventListener('abort',cleanup,{once:true});
      if(request.signal.aborted)cleanup();
    },cancel:cleanup,
  });
  return new Response(body,{headers:{...cors,'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
