// Ranking/feed membership can change, so collections refresh conservatively.
// Detail queries and unrelated map/feed screens can be matched more narrowly.
export function queryAffected(action,args={},events=[]) {
 if(!events.length)return true;
 return events.some(event=>{
  if(action==='page'){
   const mode=args.options?.mode||'posts';
   if(event.kind==='pins')return mode==='pins';
   if(mode==='pins')return event.kind==='profiles';
  }
  if(event.kind==='pins' && action==='getPin')return !event.id||args.id===event.id;
  if(event.kind==='profiles' && action==='profile')return !event.id||args.id===event.id;
  if(event.kind==='profiles' && action==='profiles')return !event.id||!args.ids||args.ids.includes(event.id);
  if(event.kind==='comments' && ['comments','commentCount','battleRankings'].includes(action))return !event.parent||args.postId===event.parent;
  if(event.kind==='posts' && action==='postsById')return !event.id||!args.ids||args.ids.includes(event.id);
  return true;
 });
}
