export function createPagedStore({load,saved,observe},maxEntries=30){
  const entries=new Map();
  let sharedStop,active=0;
  function get(options,scope='guest'){
    const key=scope+':'+JSON.stringify(options);
    if(entries.has(key))return entries.get(key);
    let snapshot={items:[],nextCursor:null,loading:true,error:null},running=false,stale=true,queued=false,hydrated=false,loadedPages=1;
    const listeners=new Set();
    const emit=value=>{snapshot={...snapshot,...value};listeners.forEach(fn=>fn());};
    async function refresh(){
      if(!listeners.size || globalThis.document?.hidden){stale=true;return;}
      if(running){queued=true;return;}
      running=true;stale=false;emit({loading:true,error:null});
      try{
        let cursor=null,items=[],page;
        for(let i=0;i<loadedPages;i++){
          page=await load(options,cursor,true);items.push(...page.items);cursor=page.nextCursor;
          if(!cursor)break;
        }
        emit({items:[...new Map(items.map(item=>[item.id,item])).values()],nextCursor:cursor,totalCount:page.totalCount});
      }catch(error){stale=true;emit({error});}
      finally{running=false;emit({loading:false});if(queued){queued=false;void refresh();}}
    }
    const entry={
      getSnapshot:()=>snapshot,
      subscribe(callback){
        listeners.add(callback);
        if(listeners.size===1){
          active++;
          if(!sharedStop)sharedStop=observe(actions=>{if(!actions||actions.includes('page'))for(const item of entries.values())item.invalidate();});
          if(!hydrated){hydrated=true;void Promise.resolve(saved?.(options)).then(row=>{
            if(row && !snapshot.items.length)emit({items:row.value.items,nextCursor:row.value.nextCursor,totalCount:row.value.totalCount});
            if(stale)void refresh();
          });}else if(stale)void refresh();
        }
        return()=>{listeners.delete(callback);if(!listeners.size){active--;if(!active){sharedStop?.();sharedStop=null;}}};
      },
      async more(){
        if(running||!snapshot.nextCursor)return;
        running=true;emit({loading:true,error:null});
        try{const page=await load(options,snapshot.nextCursor);loadedPages++;emit({items:[...new Map([...snapshot.items,...page.items].map(item=>[item.id,item])).values()],nextCursor:page.nextCursor,totalCount:page.totalCount});}
        catch(error){emit({error});}finally{running=false;emit({loading:false});if(queued){queued=false;void refresh();}}
      },
      refresh,invalidate:()=>{stale=true;if(listeners.size)void refresh();},active:()=>listeners.size,
    };
    entries.set(key,entry);
    for(const [id,candidate] of entries)if(entries.size>maxEntries&&!candidate.active()&&id!==key)entries.delete(id);
    return entry;
  }
  return {get};
}
