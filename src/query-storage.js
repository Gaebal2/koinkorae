// IndexedDB is optional: private browsing/quota failures never block online use.
export function createQueryStorage(indexedDB=globalThis.indexedDB) {
  // Retire pre-trial public activity snapshots after the service reset.
  try { indexedDB?.deleteDatabase('korae-public-cache-v1'); } catch {}
  const lifetime=row=>row.action==='chatHistory'?30*86400000:86400000;
  let opening;
  const db=()=>opening??=new Promise(resolve=>{
    if(!indexedDB){resolve(null);return;}
    try {
      const request=indexedDB.open('korae-public-cache-v2-trial-reset',1);
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
    get:key=>transaction('readonly',(store,done)=>{const r=store.get(key);r.onsuccess=()=>done(r.result && Date.now()-r.result.time<lifetime(r.result)?r.result:undefined);}),
    set:entry=>transaction('readwrite',store=>{
      store.put(entry);const r=store.getAll();r.onsuccess=()=>{
        const rows=r.result.sort((a,b)=>b.time-a.time);
        let bytes=0,count=0;
        // Bound device usage even when old snapshots contain inline photos.
        rows.forEach(row=>{
          const size=JSON.stringify(row).length*2;
          if(count>=500||bytes+size>20*1024*1024||Date.now()-row.time>lifetime(row))store.delete(row.key);
          else {bytes+=size;count++;}
        });
      };
    }),
    remove:predicate=>transaction('readwrite',store=>{const r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(predicate(c.value))c.delete();c.continue();}};}),
  };
}
