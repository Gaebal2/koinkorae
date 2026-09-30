import test from 'node:test';
import assert from 'node:assert/strict';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {createReadBatcher} from '../src/read-batcher.js';
import {createPagedStore} from '../src/paged-store.js';
import {createQueryStorage} from '../src/query-storage.js';
import {createCommunityClient} from '../src/supabase-client.js';
import {parseEvents} from '../src/change-stream.js';
import {debounce} from '../src/query-timing.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const user={uid:'alice',name:'Alice'};
test('SQL cursor pages preserve tied records, global ranking, coin totals, profiles and counts',async()=>{
  const {pg,db}=await communityHarness();
  try{
    await dispatch(db,user,'ensureProfile');
    for(let i=0;i<45;i++)await db.put({kind:'posts',id:'p'+String(i).padStart(2,'0'),parent:'',owner:'alice',body:{authorId:'alice',author:'old',coin:i<30?'BTC':'ETH',content:'Post '+i,createdAt:1000,support:i,oppose:0}});
    await dispatch(db,user,'comment',{postId:'p44',content:'hi',side:'support'});
    await dispatch(db,user,'repost',{postId:'p44',enabled:true});
    const top=await dispatch(db,user,'page',{options:{category:'지지'},limit:20});
    assert.equal(top.items[0].id,'p44');assert.equal(top.items[0].author,'Alice');assert.equal(top.items[0].commentCount,1);assert.equal(top.items[0].repostCount,1);assert.equal(top.items[0].reposted,true);
    let cursor=null,all=[];
    do{const page=await dispatch(db,user,'page',{options:{category:'최신'},cursor,limit:20});all.push(...page.items);cursor=page.nextCursor;}while(cursor);
    assert.equal(all.length,45);assert.equal(new Set(all.map(p=>p.id)).size,45);assert.equal(all[0].id,'p00');
    const coins=await dispatch(db,null,'page',{options:{mode:'coins',category:'지지'},limit:1});
    assert.equal(coins.items[0].coin,'ETH');assert.equal(coins.items[0].count,15);assert.equal(coins.items[0].score,555);
    const next=await dispatch(db,null,'page',{options:{mode:'coins',category:'지지'},cursor:coins.nextCursor,limit:1});
    assert.equal(next.items[0].coin,'BTC');assert.equal(next.items[0].count,30);assert.equal(next.nextCursor,null);
    assert.equal((await dispatch(db,user,'page',{options:{category:'최신',since:1001}})).items.length,0);
    assert.equal((await dispatch(db,user,'page',{options:{category:'팔로잉'}})).items.length,0);
    await dispatch(db,{uid:'bob',name:'Bob'},'follow',{id:'alice',enabled:true});
    assert.equal((await dispatch(db,{uid:'bob'},'page',{options:{category:'팔로잉'}})).items.length,20);
    assert.equal((await dispatch(db,user,'page',{options:{category:'최신',repostedBy:'alice'}})).items[0].id,'p44');
  }finally{await pg.close();}
});
test('map pages project marker fields, respect owner/bounds and handle the date line',async()=>{
  const {pg,db}=await communityHarness();try{
    for(const [id,lat,lng] of [['a',1,179],['b',1,-179],['c',1,0]])await db.put({kind:'pins',id,parent:'',owner:'alice',body:{ownerId:'alice',lat,lng,coin:'PSL',image:'large image',title:id,description:'detail'}});
    const page=await dispatch(db,user,'page',{options:{mode:'pins',bounds:[0,170,2,-170]},limit:1});
    assert.equal(page.items[0].id,'a');assert.equal(page.items[0].image,undefined);
    const second=await dispatch(db,user,'page',{options:{mode:'pins',bounds:[0,170,2,-170]},cursor:page.nextCursor,limit:1});assert.equal(second.items[0].id,'b');assert.equal(second.nextCursor,null);
    assert.equal((await dispatch(db,user,'page',{options:{mode:'pins',owner:'alice',detail:true}})).items[0].image,'large image');
    await assert.rejects(dispatch(db,user,'page',{options:{mode:'pins',bounds:[0,0,91,1]}}));
    await assert.rejects(dispatch(db,user,'page',{cursor:[1,1,'a,or.secret']}));
    await assert.rejects(dispatch(db,user,'page',{limit:101}));
  }finally{await pg.close();}
});
test('broadcast trigger keeps private payloads private and read RPCs deny browser DB access',async()=>{
  const {pg,db}=await communityHarness();try{
    await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:123}});
    await db.put({kind:'messages',id:'message',parent:JSON.stringify(['alice','bob']),owner:'alice',body:{content:'secret'}});
    await db.put({kind:'battleSessions',id:'session',parent:'',owner:'alice',body:{secret:'seed'}});
    const events=(await pg.query('select payload,topic,private from realtime.test_events')).rows;
    assert.deepEqual(events.map(e=>e.topic),['korae:user:alice','korae:user:alice','korae:user:bob']);
    assert.ok(events.every(e=>e.private && Object.keys(e.payload).length===1));
    await pg.exec('set role anon');await assert.rejects(pg.query("select korae_page(null,'{}',null,20)"),/permission denied/);await pg.exec('reset role');
  }finally{await pg.close();}
});
test('profile and count reads are batched instead of one HTTP call per card',async()=>{
  const calls=[];const read=createReadBatcher(async(action,args)=>{calls.push({action,args});return action==='profiles'?args.ids.map(id=>({id,username:id})):Object.fromEntries(args.ids.map(id=>[id,2]));});
  const values=await Promise.all(Array.from({length:50},(_,i)=>read('profile',{id:'u'+i})));
  assert.equal(values.length,50);assert.equal(calls.length,1);
  const counts=await Promise.all([read('commentCount',{postId:'p1'}),read('commentCount',{postId:'p2'})]);assert.deepEqual(counts,[2,2]);assert.equal(calls.length,2);
});
test('paged screen retains loaded pages on remount and refreshes invalidated inactive screens',async()=>{
  let calls=0,notify;const store=createPagedStore({load:async(_,cursor)=>{calls++;return {items:[{id:cursor?'two':'one'}],nextCursor:cursor?null:['cursor']};},observe:fn=>{notify=fn;return()=>{};}});
  const one=store.get({mode:'posts'}),two=store.get({mode:'coins'});
  let stop=one.subscribe(()=>{});await tick();await one.more();assert.equal(calls,2);stop();
  stop=one.subscribe(()=>{});await tick();assert.equal(calls,2);assert.equal(one.getSnapshot().items.length,2);
  const stopOther=two.subscribe(()=>{});await tick();stop();notify(['page']);await tick();
  const before=calls;stop=one.subscribe(()=>{});await tick();assert.equal(calls,before+2);stop();stopOther();
});
test('SSE parser handles chunk boundaries and heartbeats without queries',()=>{
  const events=[];let buffer=parseEvents('event: change\ndata: {"kind":"po',(event,data)=>events.push([event,data]));
  buffer=parseEvents(buffer+'sts"}\n\n: heartbeat\n\nevent: ready\ndata: {}\n\n',(event,data)=>events.push([event,data]));
  assert.equal(buffer,'');assert.deepEqual(events,[['change',{kind:'posts'}],['ready',{}]]);
});
test('watchers fetch on push but never poll, and cancel the push connection when unsubscribed',async()=>{
  let calls=0,notify,stops=0;const client=createCommunityClient({url:'https://example.test',token:async()=>null,interval:5,
    subscribe:fn=>{notify=fn;return()=>stops++;},fetcher:async()=>{calls++;return {ok:true,json:async()=>({data:calls})};}});
  const stop=client.watch('posts',{},()=>{});await new Promise(r=>setTimeout(r,30));assert.equal(calls,1);
  notify(['posts']);await new Promise(r=>setTimeout(r,180));assert.equal(calls,2);stop();assert.equal(stops,1);
});
test('persistent cache failure is optional and debounce sends only the final value',async()=>{
  const storage=createQueryStorage(null);assert.equal(await storage.get('x'),undefined);await storage.set({key:'x'});
  const seen=[];const update=debounce(v=>seen.push(v),5);update('a');update('ab');update('abc');await new Promise(r=>setTimeout(r,20));assert.deepEqual(seen,['abc']);update('discard');update.cancel();await new Promise(r=>setTimeout(r,10));assert.equal(seen.length,1);
});
test('offline profile hydration works, and sensitive balance/message responses are never persisted',async()=>{
  const writes=[],values=[];const storage={get:async()=>({value:{id:'alice',username:'cached'}}),set:async row=>writes.push(row),remove:async()=>{}};
  let offline=true;
  const client=createCommunityClient({url:'https://example.test',token:async()=>null,storage,fetcher:async()=>{
    if(offline)throw Error('offline');return {ok:true,json:async()=>({data:{current:42}})};
  }});
  const stop=client.watch('profile',{id:'alice'},value=>values.push(value),()=>{});await tick();
  assert.equal(values[0].username,'cached');stop();offline=false;
  await client.call('balance',{uid:'alice'});await client.call('messages',{friendId:'bob'});
  await client.call('page',{options:{mode:'ownComments'}});
  assert.equal(writes.length,0);
});
test('account switch clears the previous account without deleting startup cache for the new account',async()=>{
  const rows=[{scope:'guest'},{scope:'alice'}];
  const storage={remove:async predicate=>{for(let i=rows.length-1;i>=0;i--)if(predicate(rows[i]))rows.splice(i,1);}};
  const client=createCommunityClient({url:'https://example.test',token:async()=>null,storage});
  client.setScope('alice');assert.deepEqual(rows,[{scope:'alice'}]);
  client.setScope('bob');assert.deepEqual(rows,[]);
});
test('comment cursors handle tied timestamps and own-comment history cannot be read anonymously',async()=>{
  const {pg,db}=await communityHarness();try{
    await dispatch(db,user,'ensureProfile');
    await db.put({kind:'posts',id:'post',parent:'',owner:'alice',body:{authorId:'alice',author:'old',createdAt:100,coin:'PSL'}});
    for(let i=0;i<23;i++)await db.put({kind:'comments',id:'c'+String(i).padStart(2,'0'),parent:'post',owner:'alice',body:{authorId:'alice',author:'old',createdAt:100,content:'Comment '+i}});
    const first=await dispatch(db,null,'page',{options:{mode:'comments',postId:'post'}});
    const second=await dispatch(db,null,'page',{options:{mode:'comments',postId:'post'},cursor:first.nextCursor});
    assert.equal(first.items.length,20);assert.equal(second.items.length,3);assert.equal(new Set([...first.items,...second.items].map(c=>c.id)).size,23);
    assert.equal(first.items[0].authorProfile.username,'Alice');
    await assert.rejects(dispatch(db,null,'page',{options:{mode:'ownComments'}}),/로그인/);
    assert.equal((await dispatch(db,{uid:'bob'},'page',{options:{mode:'ownComments'}})).items.length,0);
    assert.equal((await dispatch(db,user,'page',{options:{mode:'ownComments'}})).items[0].post.author,'Alice');
  }finally{await pg.close();}
});
