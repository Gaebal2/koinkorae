import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityClient} from '../src/supabase-client.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {createSwithpiCache} from '../src/swithpi-cache.js';

function walletFixture(){
 const rows=new Map();let scope='alice',version=0,clock=1000000,calls=0;
 const status={identity:{wallet_address:'verified'},pslAddress:'wallet'},events={events:[{id:'psl'}],entries:[{event_id:'psl'}]};
 let response=async action=>action==='status'?status:events;
 const storage={get:async key=>rows.get(key),set:async row=>rows.set(row.key,row),remove:async fn=>{for(const [key,row] of rows)if(fn(row))rows.delete(key);}};
 const options={storage,getScope:()=>scope,getScopeVersion:()=>version,now:()=>clock,request:action=>{calls++;return response(action);}};
 return {rows,options,status,events,cache:createSwithpiCache(options),calls:()=>calls,respond:fn=>response=fn,advance:()=>clock+=61000,switch:()=>{scope='bob';version++;}};
}
test('wallet reads deduplicate, survive navigation and hydrate after app restart without another request',async()=>{
 const f=walletFixture();let release;f.respond(()=>new Promise(resolve=>release=resolve));
 const a=f.cache.call('events'),b=f.cache.call('events');await tick();assert.equal(f.calls(),1);release(f.events);
 assert.deepEqual(await a,await b);assert.deepEqual(f.cache.peek('events'),f.events);
 const restarted=createSwithpiCache(f.options),seen=[];const stop=restarted.watch('events',value=>seen.push(value));await tick();stop();
 assert.deepEqual(seen,[f.events]);assert.equal(f.calls(),1);
});
test('stale wallet snapshots stay visible when revalidation fails and forced reads bypass freshness',async()=>{
 const f=walletFixture();await f.cache.call('status');await f.cache.call('status',{},true);assert.equal(f.calls(),2);
 f.advance();f.respond(async()=>{throw Error('offline');});const restarted=createSwithpiCache(f.options),seen=[],errors=[];
 const stop=restarted.watch('status',value=>seen.push(value),error=>errors.push(error));await tick();stop();
 assert.deepEqual(seen,[f.status]);assert.equal(errors.length,1);assert.deepEqual(restarted.peek('status'),f.status);
});
test('wallet cache rejects responses after account change and never hydrates another account',async()=>{
 const f=walletFixture();let release;f.respond(()=>new Promise(resolve=>release=resolve));
 const request=f.cache.call('status');await tick();f.switch();f.cache.clear();release(f.status);await assert.rejects(request,/Session changed/);
 assert.equal(f.cache.peek('status'),null);assert.equal(f.rows.size,0);
});
test('confirmed application persists before revalidation and invalidates an older in-flight read',async()=>{
 const f=walletFixture();f.respond(async()=>({...f.events,entries:[]}));await f.cache.call('events');
 let release;f.respond(()=>new Promise(resolve=>release=resolve));const old=f.cache.call('events',{},true);await tick();
 f.respond(async()=>({event_id:'psl',applied_at:'now'}));await f.cache.call('apply');release({...f.events,entries:[]});await assert.rejects(old,/Session changed/);
 assert.equal(f.cache.peek('events').entries[0].applied_at,'now');
 const restarted=createSwithpiCache(f.options);assert.equal((await restarted.call('events')).entries[0].applied_at,'now');
});
test('optional wallet storage failures do not fail successful server reads',async()=>{
 const f=walletFixture();const broken={get:async()=>{throw Error('disk');},set:async()=>{throw Error('quota');}};
 const cache=createSwithpiCache({...f.options,storage:broken});assert.deepEqual(await cache.call('status'),f.status);
});
test('balance subscribers receive a confirmed cached value synchronously while server refresh is pending',async()=>{
 let release;const client=createCommunityClient({url:'https://example.test',token:async()=>null,fetcher:async()=>({ok:true,json:async()=>({data:release?await new Promise(resolve=>release=resolve):{current:42}})})});
 await client.call('balance',{uid:'a'});release=true;const seen=[];const stop=client.watch('balance',{uid:'a'},value=>seen.push(value));
 assert.deepEqual(seen,[{current:42}]);await tick();release({current:43});await tick();assert.deepEqual(seen,[{current:42},{current:43}]);stop();
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('live Pin signals preserve unrelated detail caches and startup admission preserves feeds',async()=>{
 let notify;const calls=[];
 const client=createCommunityClient({url:'https://example.test',token:async()=>null,subscribe:fn=>{notify=fn;return()=>{};},
  fetcher:async(_,request)=>{const {action,args}=JSON.parse(request.body);calls.push({action,args});return {ok:true,json:async()=>({data:{id:args.id}})};}});
 const a=client.watch('getPin',{id:'a'},()=>{}),b=client.watch('getPin',{id:'b'},()=>{}),posts=client.watch('posts',{},()=>{});
 try{
  await tick();await client.call('ensureProfile');await tick();assert.equal(calls.filter(row=>row.action==='posts').length,1);
  notify(['page','getPin','listPins'],false,[{kind:'pins',id:'a'}]);await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(calls.filter(row=>row.action==='getPin'&&row.args.id==='a').length,2);
  assert.equal(calls.filter(row=>row.action==='getPin'&&row.args.id==='b').length,1);
  await client.call('getPin',{id:'b'});assert.equal(calls.filter(row=>row.args.id==='b').length,1);
 }finally{a();b();posts();}
});
function setup(options={}) {
  const calls=[];
  const client=createCommunityClient({url:'https://example.test/',token:async()=>null,
    fetcher:async(url,request)=>{const {action}=JSON.parse(request.body);calls.push(action);return {ok:true,status:200,json:async()=>({data:{action,revision:calls.length}})};},...options});
  return {client,calls};
}
test('concurrent reads and subscriptions share requests; remounts reuse short cache',async()=>{
  const {client,calls}=setup();
  await Promise.all([client.call('profile',{id:'a'}),client.call('profile',{id:'a'})]);
  const values=[];
  const a=client.watch('profile',{id:'a'},v=>values.push(v));
  const b=client.watch('profile',{id:'a'},v=>values.push(v));
  await tick(); a();b();
  assert.equal(calls.length,1);assert.equal(values.length,2);
});
test('writes refresh only affected data and balance never uses TTL cache',async()=>{
  const {client,calls}=setup();
  const stop=client.watch('posts',{},()=>{});
  try {
    await tick();await client.call('profile',{id:'a'});
    await client.call('checkin');await tick();
    assert.equal(calls.filter(a=>a==='posts').length,1);
    await client.call('profile',{id:'a'});assert.equal(calls.filter(a=>a==='profile').length,1);
    await client.call('publish',{value:{}});await tick();assert.equal(calls.filter(a=>a==='posts').length,2);
    await client.call('balance',{uid:'a'});await client.call('balance',{uid:'a'});
    assert.equal(calls.filter(a=>a==='balance').length,2);
  }finally{stop();}
});
test('hidden tabs defer polling and refresh on return; final unsubscribe removes listener',async()=>{
  const visibility=new EventTarget();visibility.hidden=true;
  const {client,calls}=setup({visibility});const stop=client.watch('posts',{},()=>{});
  await tick();assert.equal(calls.length,0);
  visibility.hidden=false;visibility.dispatchEvent(new Event('visibilitychange'));await tick();
  assert.equal(calls.length,1);stop();
  visibility.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(calls.length,1);
});
test('auth invalidation prevents old pending data from populating the shared cache',async()=>{
  const resolvers=[];
  const {client}=setup({fetcher:()=>new Promise(resolve=>resolvers.push(value=>resolve({ok:true,status:200,json:async()=>({data:value})})))});
  const first=client.call('listPins');await tick();client.invalidate();
  const second=client.call('listPins');await tick();
  resolvers[1](['new']);await second;resolvers[0](['old']);await first;
  assert.deepEqual(await client.call('listPins'),['new']);
});
test('read handlers do not fetch the signed-in user profile unnecessarily',async()=>{
  const calls=[];
  const db={one:async(kind,id)=>{calls.push([kind,id]);return {id,body:{current:10}};}};
  assert.equal((await dispatch(db,{uid:'alice'},'balance',{uid:'alice'})).current,10);
  assert.deepEqual(calls,[['balances','alice']]);
});

test('fresh persistent friends hydrate without a repeat read; invalidation still fetches updates',async()=>{
 const values=[];const storage={get:async()=>({time:Date.now(),value:['cached']}),set:async()=>{},remove:async()=>{}};
 const {client,calls}=setup({storage});const stop=client.watch('friends',{},value=>values.push(value));await tick();
 assert.equal(calls.length,0);assert.deepEqual(values,[['cached']]);client.invalidate(['friends']);await tick();assert.equal(calls.length,1);stop();
});
test('changing account while acquiring a token cancels the request before transmission',async()=>{
 let release;const {client,calls}=setup({token:()=>new Promise(resolve=>release=resolve)});
 const read=client.call('friends');client.setScope('new-user');release('token');await assert.rejects(read);assert.equal(calls.length,0);
});

test('direct reads reuse fresh device cache but forced and expired reads reach server',async()=>{
 let row={time:Date.now(),value:{id:'cached'}};
 const storage={get:async()=>row,set:async()=>{},remove:async()=>{row=null;}};
 const {client,calls}=setup({storage});
 assert.deepEqual(await client.call('profile',{id:'a'}),{id:'cached'});assert.equal(calls.length,0);
 await client.call('profile',{id:'a'},true);assert.equal(calls.length,1);
 row={time:Date.now()-600000,value:{id:'old'}};
 await client.call('profile',{id:'b'});assert.equal(calls.length,2);
});
test('pending device hydration cannot cross an account switch',async()=>{
 let release;const storage={get:()=>new Promise(resolve=>release=resolve),remove:async()=>{}};
 const {client,calls}=setup({storage});
 const pending=client.call('profile',{id:'a'});client.setScope('bob');
 release({time:Date.now(),value:{id:'alice'}});
 await assert.rejects(pending);assert.equal(calls.length,0);
});
test('unavailable device storage falls back to the server',async()=>{
 const {client,calls}=setup({storage:{get:async()=>{throw Error('blocked');},set:async()=>{}}});
 await client.call('profile',{id:'a'});assert.equal(calls.length,1);
});
