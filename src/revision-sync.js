import {changedActions} from './change-stream.js';

// Clear persisted results before advancing the checkpoint: a closed app must
// never retain an old result paired with a newer revision.
export function createRevisionSync({storage,scope,notify,isActive=()=>true}) {
 let queue=Promise.resolve();
 return snapshot=>queue=queue.catch(()=>{}).then(async()=>{
  if(!isActive())return;
  if(!snapshot || snapshot.version!==1 || !snapshot.revisions){notify(null);return;}
  const key=scope+':revisions';
  const previous=await storage.get(key);
  if(!isActive())return;
  const before=previous?.value;
  const changed=before ? [...new Set([...Object.keys(before),...Object.keys(snapshot.revisions)])]
   .filter(key=>before[key]!==snapshot.revisions[key]).map(key=>key.slice(key.lastIndexOf(':')+1)) : Object.keys(changedActions);
  const actions=[...new Set(changed.flatMap(kind=>changedActions[kind]||[]))];
  if(actions.length){
   await storage.remove(row=>row.scope===scope && actions.includes(row.action));
   if(!isActive())return;
   await notify(actions,true);
  }
  await storage.set({key,scope,action:'revisions',value:snapshot.revisions,time:Date.now()});
 });
}
