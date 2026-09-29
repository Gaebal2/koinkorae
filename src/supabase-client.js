const reads=new Set(['listPins','getPin','profile','posts','authorPosts','postsById','following','relationships','reposts','commentCount','comments','balance','ownComments','friends','messages']);
const silentWrites=new Set(['checkpointBattle','continueBattle']);
export function createCommunityClient({url,key='',token,fetcher=fetch,interval=30000}) {
  const watchers=new Set();
  const invalidate=()=>{for(const refresh of watchers) refresh();};
  async function call(action,args={},retried=false) {
    const accessToken=await token(retried);
    const response=await fetcher(`${url.replace(/\/$/,'')}/functions/v1/community`,{
      method:'POST',headers:{'Content-Type':'application/json',...(key?{apikey:key}:{}),...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify({action,args}),
    });
    if(response.status===401 && accessToken && !retried) return call(action,args,true);
    let result;
    try {result=await response.json();} catch {throw Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
    if(!response.ok || result.error) throw Error(result.error || '요청을 처리하지 못했습니다.');
    if(!reads.has(action) && !silentWrites.has(action)) invalidate();
    return result.data;
  }
  function watch(action,args,callback,onError=()=>{},pollInterval=interval) {
    let stopped=false,running=false,again=false,timer,last;
    const refresh=async()=>{
      if(stopped)return;
      if(running){again=true;return;}
      running=true;clearTimeout(timer);
      try {const value=await call(action,args);const signature=JSON.stringify(value);if(!stopped && signature!==last){last=signature;callback(value);}}
      catch(error){if(!stopped)onError(error);}
      finally {running=false;if(!stopped){if(again){again=false;void refresh();}else timer=setTimeout(refresh,pollInterval);}}
    };
    watchers.add(refresh);void refresh();
    return()=>{stopped=true;clearTimeout(timer);watchers.delete(refresh);};
  }
  return {call,watch,invalidate};
}
