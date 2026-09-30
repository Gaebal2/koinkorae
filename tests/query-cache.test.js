import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityClient} from '../src/supabase-client.js';
import {dispatch} from '../supabase/functions/community/handler.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
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
