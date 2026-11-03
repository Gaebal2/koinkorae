// Anonymous results only. Durable revisions are checked before every lookup;
// TTL also bounds time-dependent rankings when content has not changed.
export function createPublicReadCache({maxEntries=100,maxBytes=8*1024*1024,ttl=10000,now=Date.now}={}) {
 const entries=new Map();let bytes=0;
 return async (key,version,load)=>{
  const id=JSON.stringify([key,version]),saved=entries.get(id);
  if(saved && now()-saved.time<ttl)return saved.value;
  if(saved){entries.delete(id);bytes-=saved.bytes;}
  const entry={time:now(),bytes:0,value:Promise.resolve().then(load)};
  entries.set(id,entry);
  while(entries.size>maxEntries){const first=entries.keys().next().value;bytes-=entries.get(first).bytes;entries.delete(first);}
  try{
   const value=await entry.value;
   if(entries.get(id)!==entry)return value;
   entry.bytes=JSON.stringify(value).length*2;bytes+=entry.bytes;
   while(entries.size>maxEntries || bytes>maxBytes){const first=entries.keys().next().value;bytes-=entries.get(first).bytes;entries.delete(first);}
   return value;
  }catch(error){if(entries.get(id)===entry){entries.delete(id);bytes-=entry.bytes;}throw error;}
 };
}
