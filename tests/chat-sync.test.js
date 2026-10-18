import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageStore} from '../src/message-store.js';
import {dispatch} from '../supabase/functions/community/handler.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(saved){
 let scope='alice',version=0,notify,server=[],requests=[],fail=false,sendResolve;
 const records=new Map(saved?[['alice:chat:bob',{value:saved}]]:[]);
 const storage={get:async key=>records.get(key),set:async row=>records.set(row.key,structuredClone(row)),remove:async predicate=>{for(const [key,row] of records)if(predicate(row))records.delete(key);}};
 const store=createMessageStore({storage,getScope:()=>scope,getScopeVersion:()=>version,observe:fn=>{notify=fn;return()=>{};},call:async(action,args)=>{
  requests.push([action,args]);if(fail)throw Error('offline');
  if(action==='sendMessage')return new Promise(resolve=>{sendResolve=()=>{const row={id:args.requestId,content:args.content,senderId:scope,createdAt:1000+server.length};server.push(row);notify?.(['messages']);resolve(row);};});
  const rows=server.filter(row=>(args.after===undefined||row.createdAt>args.after)&&(args.before===undefined||row.createdAt<args.before));
  return args.after!==undefined?rows.slice(0,100):rows.slice(-100);
 }});
 return {store,records,requests,notify:()=>notify?.(['messages']),resolve:()=>sendResolve(),server:rows=>server=rows,fail:value=>fail=value,switch:()=>{scope='carol';version++;notify?.();}};
}
test('cached history renders offline and reconnect fetches only new messages across multiple pages',async()=>{
 const old={id:'old',createdAt:1,content:'cached'};
 const h=setup({rows:[old],cursor:1,more:false});h.fail(true);
 let rows;const stop=h.store.watch('bob',value=>rows=value,()=>{});await tick();assert.deepEqual(rows,[old]);
 h.fail(false);h.server([old,...Array.from({length:205},(_,i)=>({id:'n'+i,createdAt:i+2}))]);h.notify();await tick();
 assert.equal(rows.length,206);assert.deepEqual(h.requests.map(r=>r[1].after),[1,1,101,201]);
 stop();h.requests.length=0;const stop2=h.store.watch('bob',value=>rows=value);await tick();assert.equal(h.requests[0][1].after,206);stop2();
});
test('optimistic send appears before acknowledgement, preserves peer messages, and deduplicates echoes',async()=>{
 const h=setup({rows:[],cursor:0,more:false});let rows;const stop=h.store.watch('bob',v=>rows=v);await tick();
 h.server([{id:'peer',createdAt:10,content:'peer'}]);const sent=h.store.send('bob','hello','mine');await tick();
 assert.equal(rows.find(r=>r.id==='mine').delivery,'sending');h.resolve();await sent;await tick();
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id==='mine').delivery,undefined);assert.ok(rows.some(r=>r.id==='peer'));
 assert.equal(h.requests.filter(r=>r[0]==='sendMessage').length,1);stop();
});
test('failed sends survive reload and retry keeps the same id',async()=>{
 const h=setup({rows:[],cursor:0,more:false});const stop=h.store.watch('bob',()=>{});await tick();h.fail(true);
 await assert.rejects(h.store.send('bob','hello','same'));assert.equal(h.records.get('alice:chat:bob').value.rows[0].delivery,'failed');
 h.fail(false);const retry=h.store.send('bob','hello','same');await tick();h.resolve();await retry;await tick();
 assert.equal(h.records.get('alice:chat:bob').value.rows.length,1);assert.ok(h.requests.filter(r=>r[0]==='sendMessage').every(r=>r[1].requestId==='same'));stop();
});
test('account switch prevents late acknowledgement from exposing or persisting the old conversation',async()=>{
 const h=setup({rows:[],cursor:0,more:false});let renders=0;const stop=h.store.watch('bob',()=>renders++);await tick();
 const pending=h.store.send('bob','private','old');await tick();const before=renders;h.switch();h.resolve();await pending;await tick();assert.equal(renders,before);stop();
});
test('older pages are persisted and then reused locally',async()=>{
 const h=setup({rows:[{id:'last',createdAt:200}],cursor:200,more:true});h.server([{id:'older',createdAt:100}]);
 await h.store.older('bob',200);const count=h.requests.length;assert.equal((await h.store.older('bob',200))[0].id,'older');assert.equal(h.requests.length,count);
});
test('delta handler validates cursor and friendship and requests oldest-first new messages',async()=>{
 let filter;const db={one:async()=>({}),list:async(kind,f)=>{filter=f;return [{id:'new',body:{createdAt:11}}];}};
 assert.equal((await dispatch(db,{uid:'alice'},'messages',{friendId:'bob',after:10}))[0].id,'new');assert.equal(filter.after,10);assert.equal(filter.oldest,true);
 await assert.rejects(dispatch(db,{uid:'alice'},'messages',{friendId:'bob',after:-1}));
 await assert.rejects(dispatch(db,{uid:'alice'},'messages',{friendId:'bob',after:10,before:20}));
 await assert.rejects(dispatch({...db,one:async()=>null},{uid:'alice'},'messages',{friendId:'bob',after:10}));
});

test('revoked friendship discards locally cached conversation',async()=>{
 const records=new Map([['alice:chat:bob',{value:{rows:[{id:'old',createdAt:1}],cursor:1,more:false}}]]);
 const store=createMessageStore({getScope:()=> 'alice',observe:()=>()=>{},storage:{get:async key=>records.get(key),remove:async predicate=>{for(const [key,row] of records)if(predicate({...row,key}))records.delete(key);}},call:async()=>{throw Object.assign(Error('forbidden'),{status:403});}});
 let rows;const stop=store.watch('bob',value=>rows=value,()=>{});await tick();assert.deepEqual(rows,[]);assert.equal(records.size,0);stop();
});
test('old servers that ignore the delta cursor cannot cause an infinite request loop',async()=>{
 let requests=0;const store=createMessageStore({getScope:()=> 'alice',observe:()=>()=>{},storage:{get:async()=>({value:{rows:[],cursor:100,more:false}})},call:async()=>{requests++;return Array.from({length:100},(_,i)=>({id:String(i),createdAt:i}));}});
 let error;const stop=store.watch('bob',()=>{},value=>error=value);await tick();assert.equal(requests,1);assert.ok(error);stop();
});
