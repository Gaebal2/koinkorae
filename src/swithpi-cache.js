const reads=new Set(['events','status']);
const validValue=(action,value)=>!!value && (action==='events'?Array.isArray(value.events)&&Array.isArray(value.entries):Object.hasOwn(value,'identity'));
export function createSwithpiCache({request,storage,getScope,getScopeVersion=()=>0,ttl=60000,now=Date.now}) {
 const entries=new Map();let epoch=0;
 function entry(action){
  const scope=getScope(),version=getScopeVersion(),key=scope+':swithpi:'+action;
  if(!entries.has(key))entries.set(key,{key,scope,version,epoch,action,value:null,time:0,revision:0,pending:null,listeners:new Set()});
  return entries.get(key);
 }
 const active=e=>e.epoch===epoch&&e.scope===getScope()&&e.version===getScopeVersion();
 const emit=e=>{if(active(e))for(const listener of e.listeners)listener.value(e.value);};
 async function save(e,value){
  e.value=value;e.time=now();emit(e);
  try{await storage?.set({key:e.key,scope:e.scope,action:'swithpi:'+e.action,value,time:e.time});}catch{}
 }
 async function hydrate(e){
  if(e.value)return;
  const revision=e.revision;
  let row;try{row=await storage?.get(e.key);}catch{}
  if(active(e)&&revision===e.revision&&!e.value&&row?.scope===e.scope&&Number.isFinite(row.time)&&now()-row.time>=0&&now()-row.time<86400000&&validValue(e.action,row.value)){
   e.value=row.value;e.time=row.time;emit(e);
  }
 }
 function read(action,force=false){
  const e=entry(action);
  if(!force&&e.value&&now()-e.time>=0&&now()-e.time<ttl)return Promise.resolve(e.value);
  if(e.pending)return e.pending;
  const revision=e.revision;
  const pending=(async()=>{
   if(!force)await hydrate(e);
   if(!active(e)||revision!==e.revision)throw Error('Session changed');
   if(!force&&e.value&&now()-e.time>=0&&now()-e.time<ttl)return e.value;
   const value=await request(action,{});
   if(!active(e)||revision!==e.revision)throw Error('Session changed');
   if(!validValue(action,value))throw Error('Invalid SwithPi response');
   await save(e,value);return value;
  })().finally(()=>{if(e.pending===pending)e.pending=null;});
  e.pending=pending;return pending;
 }
 async function invalidate(){
  for(const action of reads){const e=entry(action);e.revision++;e.time=-Infinity;e.pending=null;}
  const scope=getScope();try{await storage?.remove(row=>row.scope===scope&&row.action?.startsWith('swithpi:'));}catch{}
 }
 return {
  peek:action=>entry(action).value,
  watch(action,value,error=()=>{}){
   const e=entry(action),revision=e.revision,listener={value,error};e.listeners.add(listener);if(e.value)value(e.value);
   void read(action).catch(reason=>{if(active(e)&&revision===e.revision&&e.listeners.has(listener))error(reason);});
   return()=>e.listeners.delete(listener);
  },
  async call(action,value={},force=false){
   if(reads.has(action))return read(action,force);
   const scope=getScope(),version=getScopeVersion(),generation=epoch;
   const result=await request(action,value);
   if(scope!==getScope()||version!==getScopeVersion()||generation!==epoch)throw Error('Session changed');
   if(['verify','importPsl','savePsl','apply'].includes(action)){
    await invalidate();
    if(scope!==getScope()||version!==getScopeVersion()||generation!==epoch)throw Error('Session changed');
    const events=entry('events'),status=entry('status');
    // Persist the server-confirmed mutation before background revalidation.
    if(action==='apply'&&result?.event_id&&events.value)await save(events,{...events.value,entries:[...events.value.entries.filter(item=>item.event_id!==result.event_id),result]});
    if(action==='importPsl'&&result?.identity&&status.value)await save(status,{...status.value,identity:result.identity});
    if(action==='savePsl'&&result?.address&&status.value)await save(status,{...status.value,pslAddress:result.address});
    for(const name of reads){const e=entry(name);if(e.listeners.size)void read(name,true).catch(error=>{if(active(e))for(const listener of e.listeners)listener.error(error);});}
   }
   return result;
  },
  clear(){epoch++;entries.clear();},
 };
}
