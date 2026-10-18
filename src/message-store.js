// Messages are append-only; the server assigns strictly increasing conversation timestamps.
// Only completed delta reads advance the cursor, never an optimistic send acknowledgement.
export function createMessageStore({call,observe,storage,getScope,getScopeVersion=()=>0,visibility=globalThis.document}) {
  const entries=new Map();
  const merge=(a,b)=>[...new Map([...a,...b].map(row=>[row.id,row])).values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  function entryFor(friendId){
    const scope=getScope(),version=getScopeVersion(),key=scope+':chat:'+friendId;
    for(const [id,old] of entries)if(old.version!==version){old.stop?.();entries.delete(id);}
    if(entries.has(key))return entries.get(key);
    const e={key,scope,version,friendId,rows:[],cursor:null,more:false,listeners:new Set(),running:null,again:false,stop:null,queue:Promise.resolve(),sending:new Set()};
    const valid=()=>getScope()===scope && getScopeVersion()===version;
    e.valid=valid;
    e.emit=()=>{if(valid())for(const listener of e.listeners)listener.callback(e.rows,{more:e.more});};
    e.save=async()=>{
      if(!valid())return;
      const confirmed=e.rows.filter(row=>!row.delivery),outbox=e.rows.filter(row=>row.delivery);
      if(confirmed.length>2000)e.more=true;
      await storage?.set({key,scope,action:'chatHistory',time:Date.now(),value:{rows:merge(confirmed.slice(-2000),outbox),cursor:e.cursor,more:e.more}});
    };
    e.ready=Promise.resolve(storage?.get(key)).catch(()=>null).then(saved=>{
      if(!valid())return;
      if(saved?.value){e.rows=merge(saved.value.rows.map(row=>row.delivery?{...row,delivery:'failed'}:row),e.rows);e.cursor=saved.value.cursor;e.more=saved.value.more;e.emit();}
    });
    e.sync=()=>{
      if(e.running){e.again=true;return e.running;}
      e.running=(async()=>{
        await e.ready;
        do {
          e.again=false;if(!valid()||visibility?.hidden)return;
          try {
            let page;
            do {
              const initial=e.cursor===null;
              page=await call('messages',{friendId,...(!initial?{after:e.cursor}:{})},true);
              if(!valid())return;
              if(!initial && page.some(row=>!Number.isSafeInteger(row.createdAt)||row.createdAt<=e.cursor))throw Error('채팅 동기화에 실패했습니다. 앱을 새로고침해 주세요.');
              e.rows=merge(e.rows,page);
              if(initial)e.more=page.length===100;
              if(page.length)e.cursor=page.at(-1).createdAt;
              else if(initial)e.cursor=0;
              e.emit();await e.save();
              if(initial)break;
            }while(page.length===100 && valid());
          }catch(error){
            if(!valid())return;
            if(error.status===403){e.rows=[];e.cursor=null;e.more=false;await storage?.remove(row=>row.key===key);e.emit();}
            for(const listener of e.listeners)listener.error(error);
          }
        }while(e.again && valid());
      })().finally(()=>{e.running=null;});
      return e.running;
    };
    entries.set(key,e);return e;
  }
  function watch(friendId,callback,error=()=>{}){
    const e=entryFor(friendId),listener={callback,error};e.listeners.add(listener);
    if(e.rows.length)callback(e.rows,{more:e.more});
    if(!e.stop)e.stop=observe(actions=>{if(!e.valid()){e.stop?.();e.stop=null;return;}if(!actions||actions.includes('messages'))void e.sync();});
    void e.sync();
    return()=>{e.listeners.delete(listener);if(!e.listeners.size){e.stop?.();e.stop=null;}};
  }
  async function send(friendId,content,requestId){
    const e=entryFor(friendId);await e.ready;
    if(!e.valid())throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    if(e.sending.has(requestId))return;
    e.sending.add(requestId);
    const old=e.rows.find(row=>row.id===requestId);
    e.rows=merge(e.rows,[{id:requestId,senderId:e.scope,recipientId:friendId,content,createdAt:old?.createdAt??Date.now(),delivery:'sending'}]);e.emit();void e.save();
    // Preserve the user's send order while allowing continued typing and multiple pending bubbles.
    const task=e.queue.catch(()=>{}).then(async()=>{
      if(!e.valid())throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      try{
        const saved=await call('sendMessage',{friendId,content,requestId});
        if(e.valid()){e.rows=merge(e.rows,[saved]);e.emit();await e.save();}
        return saved;
      }catch(error){
        if(e.valid()){e.rows=e.rows.map(row=>row.id===requestId&&row.delivery?{...row,delivery:'failed'}:row);e.emit();await e.save();}
        throw error;
      }finally{e.sending.delete(requestId);}
    });
    e.queue=task;return task;
  }
  async function older(friendId,before){
    const e=entryFor(friendId);await e.ready;
    const cached=e.rows.filter(row=>!row.delivery&&row.createdAt<before);
    if(cached.length)return cached.slice(-100);
    const rows=await call('messages',{friendId,before},true);
    if(e.valid()){e.rows=merge(rows,e.rows);e.more=rows.length===100;e.emit();await e.save();}
    return rows;
  }
  function clear(){for(const e of entries.values()){e.stop?.();e.stop=null;e.rows=[];e.listeners.clear();}entries.clear();}
  return {watch,send,older,clear};
}
