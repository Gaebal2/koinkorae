export const changedActions={
  profiles:['profile','profiles','page','posts','authorPosts','postsById','getPin','listPins','comments','friends','ownComments'],
  posts:['page','posts','authorPosts','postsById','comments','commentCount','commentCounts','ownComments','reposts'],
  pins:['page','getPin','listPins'], comments:['page','comments','commentCount','commentCounts','ownComments'],
  following:['page','following','relationships','friends','messages'], reposts:['page','reposts'],
  balances:['balance'],messages:['messages'],
};
export function parseEvents(buffer,onEvent){
  let end;
  while((end=buffer.indexOf('\n\n'))>=0){
    const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
    const event=frame.split('\n').find(line=>line.startsWith('event:'))?.slice(6).trim();
    const raw=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
    if(event && raw)onEvent(event,JSON.parse(raw));
  }
  return buffer;
}
// Reconnects the push transport, never polls application queries on a timer.
export function connectChanges({url,key,token,onChange,onReady,onStatus=()=>{},fetcher=fetch}) {
  let stopped=false,controller,timer,attempt=0;
  async function connect(){
    controller=new AbortController();onStatus('connecting');
    try{
      const accessToken=await token(attempt>0);if(stopped)return;
      const response=await fetcher(url.replace(/\/$/,'')+'/functions/v1/community',{
        method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(key?{apikey:key}:{}),...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify({action:'subscribe'}),
      });
      if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('Realtime unavailable');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(!stopped){const {done,value}=await reader.read();if(done)break;
        buffer=parseEvents(buffer+decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n'),(event,data)=>{
          if(event==='ready'){attempt=0;onStatus('connected');onReady();}
          else if(event==='change')onChange(data);
        });
        if(buffer.length>65536)throw Error('Invalid stream');
      }
      await reader.cancel();
    }catch{/* Offline/auth/network failures use bounded reconnect backoff. */}
    finally{controller?.abort();if(!stopped){onStatus('reconnecting');timer=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*500);}}
  }
  void connect();return()=>{stopped=true;clearTimeout(timer);controller?.abort();};
}
