import {createReadBatcher} from './read-batcher.js';
const reads=new Set(['battleRankings','page','profiles','commentCounts','listPins','getPin','profile','posts','authorPosts','postsById','following','relationships','reposts','commentCount','comments','balance','ownComments','friends','messages']);
const silentWrites=new Set(['notificationInbox','reportContent','adminReports','notificationSettings','saveNotificationSettings','subscribePush','unsubscribePush','recordShare','checkpointBattle','continueBattle']);
const affected={
  dismissReports:['page','getPin','listPins','posts','authorPosts','postsById','comments','ownComments','battleRankings','reposts','commentCount','commentCounts'],
  moderateContent:['profile','profiles','page','getPin','listPins','posts','authorPosts','postsById','comments','ownComments','battleRankings','reposts','commentCount','commentCounts'],
  pinProfilePost:['profile','profiles'],
  ensureProfile:['profile'], saveProfile:['battleRankings','profile','posts','authorPosts','postsById','listPins','getPin','comments','friends','ownComments'],
  setPinMapHidden:['listPins','getPin'],
  savePin:['balance','listPins','getPin'], deletePin:['listPins','getPin'], checkin:['balance'],
  publish:['balance','posts','authorPosts','postsById'], deletePost:['profile','profiles','battleRankings','posts','authorPosts','postsById','comments','commentCount','ownComments','reposts'],
  follow:['following','relationships','friends','messages'], repost:['balance','battleRankings','reposts','posts','authorPosts','postsById'], like:['posts','authorPosts','postsById'],
  comment:['balance','comments','commentCount','ownComments'], deleteComment:['comments','commentCount','ownComments'],
  sendMessage:['messages'], startBattle:['balance'], applyBattle:['battleRankings','balance','posts','authorPosts','postsById'], finishBattle:['battleRankings','balance','posts','authorPosts','postsById'],
};
const canonical=value=>Array.isArray(value)?value.map(canonical):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function createCommunityClient({url,key='',token,fetcher=fetch,interval=300000,visibility=globalThis.document,storage,subscribe,batch=false}) {
  const cache=new Map(), pending=new Map(), watchers=new Map();
  const observers=new Set();let scope='guest',scopeVersion=0,disconnect,changeTimer;
  const queuedChanges=new Set();
  const persistent=(action,args={})=>['profile','profiles','getPin','friends','following','relationships','listPins','reposts','comments'].includes(action) || (action==='page' && args.options?.mode!=='ownComments');
  let generation=0;
  const revisions=new Map();
  const versionOf=action=>generation+':'+(revisions.get(action)||0);
  const visible=()=>!visibility?.hidden;
  function invalidate(actions,clearStored=true) {
    if(actions){actions=[...new Set([...actions,...(actions.includes('profile')?['profiles']:[]),...(actions.includes('commentCount')?['commentCounts']:[]),...(actions.some(action=>['posts','authorPosts','listPins','reposts','following','profile','commentCount'].includes(action))?['page']:[])])];}
    if(actions)for(const action of actions)revisions.set(action,(revisions.get(action)||0)+1);
    else generation++;
    for(const [id,entry] of cache) if(!actions || actions.includes(entry.action)) cache.delete(id);
    for(const id of pending.keys())if(!actions || actions.some(action=>id.startsWith(action+':')))pending.delete(id);
    const invalidatedScope=scope;
    if(clearStored)void storage?.remove(entry=>entry.scope===invalidatedScope && (!actions||actions.includes(entry.action)));
    for(const entry of watchers.values()) if(!actions || actions.includes(entry.action)) {entry.last=undefined;entry.refresh(true);}
    for(const listener of observers)listener(actions);
  }
  function syncTransport(){
    const needed=visible() && (watchers.size||observers.size);
    if(!needed){disconnect?.();disconnect=null;clearTimeout(changeTimer);changeTimer=null;queuedChanges.clear();return;}
    if(!disconnect && subscribe)disconnect=subscribe(actions=>{
      if(actions)actions.forEach(action=>queuedChanges.add(action));
      else reads.forEach(action=>queuedChanges.add(action));
      // Coalesce a burst of battle/comment writes into one refresh per query.
      if(!changeTimer)changeTimer=setTimeout(()=>{changeTimer=null;const changed=[...queuedChanges];queuedChanges.clear();invalidate(changed);},150);
    });
  }
  function observe(callback){observers.add(callback);visibility?.addEventListener('visibilitychange',onVisibility);syncTransport();return()=>{observers.delete(callback);syncTransport();if(!observers.size&&!watchers.size)visibility?.removeEventListener('visibilitychange',onVisibility);};}
  async function request(action,args,retried=false) {
    const session=scopeVersion;
    const accessToken=await token(retried);
    if(session!==scopeVersion)throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    const response=await fetcher((url.endsWith('/')?url.slice(0,-1):url)+'/functions/v1/community',{
      method:'POST',headers:{'Content-Type':'application/json',...(key?{apikey:key}:{}),...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify({action,args}),
    });
    if(response.status===401 && accessToken && !retried) return request(action,args,true);
    let result;
    try {result=await response.json();} catch {throw Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
    if(!response.ok || result.error) throw Object.assign(Error(result.error || '요청을 처리하지 못했습니다.'),{status:response.status});
    return result.data;
  }
  const read=batch?createReadBatcher(request):request;
  function call(action,args={},force=false) {
    if(!reads.has(action)){const session=scopeVersion;return request(action,args).then(value=>{if(session===scopeVersion && !silentWrites.has(action))invalidate(affected[action]);return value;});}
    const id=action+':'+JSON.stringify(canonical(args));
    const ttl=['messages','balance'].includes(action)?0:interval;
    const saved=cache.get(id);
    if(!force && saved && Date.now()-saved.time<ttl) return Promise.resolve(saved.value);
    if(pending.has(id)) return pending.get(id);
    const version=versionOf(action);
    const requestScope=scope;
    const promise=(async()=>{
      if(!force && ttl && storage && persistent(action,args)){
        let row;
        try { row=await storage.get(requestScope+':'+id); } catch {}
        if(requestScope!==scope || version!==versionOf(action))throw Error('데이터가 변경되었습니다. 다시 시도해 주세요.');
        if(row && Number.isFinite(row.time) && Date.now()-row.time>=0 && Date.now()-row.time<ttl){
          cache.set(id,{action,value:row.value,time:row.time});
          if(cache.size>500)cache.delete(cache.keys().next().value);
          return row.value;
        }
      }
      const value=await read(action,args);
      if(version===versionOf(action) && ttl){
        cache.delete(id); cache.set(id,{action,value,time:Date.now()});
        if(cache.size>500)cache.delete(cache.keys().next().value);
        if(persistent(action,args))void storage?.set({key:requestScope+':'+id,scope:requestScope,action,value,time:Date.now()});
      }
      return value;
    })().finally(()=>{if(pending.get(id)===promise)pending.delete(id);});
    pending.set(id,promise);return promise;
  }
  function watch(action,args,callback,onError=()=>{},pollInterval=interval) {
    const id=action+':'+JSON.stringify(canonical(args));
    let entry=watchers.get(id);
    if(!entry){
      entry={action,listeners:new Set(),running:false,again:false,timer:null,last:undefined,value:undefined};
      entry.refresh=async(force=false)=>{
        if(!entry.listeners.size || !visible())return;
        if(entry.running){entry.again=true;return;}
        entry.running=true;clearTimeout(entry.timer);
        const version=versionOf(action);
        try {
          const value=await call(action,args,force), signature=JSON.stringify(value);
          if(version===versionOf(action) && signature!==entry.last){entry.last=signature;entry.value=value;for(const listener of entry.listeners)listener.callback(value);}
        } catch(error){if(version===versionOf(action))for(const listener of entry.listeners)listener.onError(error);}
        finally {
          entry.running=false;
          if(entry.listeners.size){
            if(entry.again){entry.again=false;void entry.refresh(true);}
            // Changes arrive through the shared push connection; no DB polling.
          }
        }
      };
      watchers.set(id,entry);
    }
    const listener={callback,onError,pollInterval};entry.listeners.add(listener);
    if(entry.last!==undefined)callback(entry.value);
    if(entry.listeners.size===1){
      if(storage && persistent(action,args) && !cache.has(id)){
        const version=versionOf(action);
        void storage.get(scope+':'+id).then(saved=>{
          if(version===versionOf(action) && entry.listeners.size && saved){entry.value=saved.value;entry.last=JSON.stringify(saved.value);if(Date.now()-saved.time<interval)cache.set(id,{action,value:saved.value,time:saved.time});for(const item of entry.listeners)item.callback(saved.value);}
          void entry.refresh();
        });
      }else void entry.refresh();
    }
    if(watchers.size===1)visibility?.addEventListener('visibilitychange',onVisibility);
    syncTransport();
    return()=>{
      entry.listeners.delete(listener);
      if(!entry.listeners.size){clearTimeout(entry.timer);watchers.delete(id);}
      syncTransport();
      if(!watchers.size&&!observers.size)visibility?.removeEventListener('visibilitychange',onVisibility);
    };
  }
  function onVisibility(){syncTransport();if(visible()&&!subscribe)invalidate();}
  function setScope(next){
    if(scope===next)return;
    const previous=scope;scope=next;scopeVersion++;disconnect?.();disconnect=null;
    void storage?.remove(entry=>entry.scope===previous);invalidate(undefined,false);syncTransport();
  }
  const saved=(action,args={})=>storage?.get(scope+':'+action+':'+JSON.stringify(canonical(args)));
  return {call,watch,invalidate,observe,setScope,saved,getScope:()=>scope,getScopeVersion:()=>scopeVersion};
}
