// IndexedDB is optional: private browsing/quota failures never block online use.
export function createQueryStorage(indexedDB=globalThis.indexedDB) {
  let opening;
  const db=()=>opening??=new Promise(resolve=>{
    if(!indexedDB){resolve(null);return;}
    try {
      const request=indexedDB.open('korae-public-cache-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('queries',{keyPath:'key'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
    }catch{resolve(null);}
  });
  async function transaction(mode,run){
    try{const database=await db();if(!database)return;return await new Promise(resolve=>{
      const tx=database.transaction('queries',mode);let value;
      run(tx.objectStore('queries'),v=>{value=v;});tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>resolve(undefined);
    });}catch{return undefined;}
  }
  return {
    get:key=>transaction('readonly',(store,done)=>{const r=store.get(key);r.onsuccess=()=>done(r.result && Date.now()-r.result.time<86400000?r.result:undefined);}),
    set:entry=>transaction('readwrite',store=>{
      store.put(entry);const r=store.getAll();r.onsuccess=()=>{
        const rows=r.result.sort((a,b)=>b.time-a.time);
        rows.forEach((row,i)=>{if(i>=100||Date.now()-row.time>86400000)store.delete(row.key);});
      };
    }),
    remove:predicate=>transaction('readwrite',store=>{const r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(predicate(c.value))c.delete();c.continue();}};}),
  };
}
