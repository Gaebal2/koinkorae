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
import {createRevisionSync} from '../src/revision-sync.js';
import {createPublicReadCache} from '../supabase/functions/community/public-cache.js';
import {queryAffected} from '../src/query-impact.js';
import {readFile} from 'node:fs/promises';

test('revision checkpoints skip unchanged reconnects and clear stale disk rows before advancing',async()=>{
 const rows=new Map(),events=[];
 const storage={get:async key=>rows.get(key),set:async row=>rows.set(row.key,row),remove:async predicate=>{for(const [key,row] of rows)if(predicate(row))rows.delete(key);}};
 const sync=createRevisionSync({storage,scope:'alice',notify:async actions=>events.push(actions)});
 const first={version:1,revisions:{'public:posts':'1','user:alice:balances':'2'}};
 await sync(first);assert.equal(events.length,1);events.length=0;
 rows.set('feed',{scope:'alice',action:'page'});rows.set('bob',{scope:'bob',action:'page'});
 await sync(first);assert.equal(events.length,0);assert.ok(rows.has('feed'));
 await sync({...first,revisions:{...first.revisions,'public:posts':'2'}});
 assert.equal(events.length,1);assert.ok(events[0].includes('page'));assert.ok(!rows.has('feed'));assert.ok(rows.has('bob'));
 await sync({});assert.equal(events.at(-1),null);
 let active=false;const cancelled=createRevisionSync({storage,scope:'alice',notify:()=>assert.fail(),isActive:()=>active});await cancelled(first);
});

test('public shared reads deduplicate, respect revisions and TTL, and retry failures',async()=>{
 let time=0,calls=0;const cache=createPublicReadCache({now:()=>time,ttl:10,maxEntries:2});
 const load=async()=>++calls;
 assert.deepEqual(await Promise.all([cache('page','v1',load),cache('page','v1',load)]),[1,1]);
 assert.equal(await cache('page','v2',load),2);time=11;assert.equal(await cache('page','v2',load),3);
 await assert.rejects(cache('bad','v1',async()=>{throw Error('offline');}));assert.equal(await cache('bad','v1',load),4);
});

test('change impact isolates detail IDs and separates map pages from feed changes',()=>{
 assert.equal(queryAffected('getPin',{id:'a'},[{kind:'pins',id:'b'}]),false);
 assert.equal(queryAffected('getPin',{id:'a'},[{kind:'pins',id:'a'}]),true);
 assert.equal(queryAffected('page',{options:{mode:'pins'}},[{kind:'posts',id:'p'}]),false);
 assert.equal(queryAffected('page',{options:{mode:'posts'}},[{kind:'pins',id:'p'}]),false);
 assert.equal(queryAffected('page',{options:{mode:'posts'}},[{kind:'comments',parent:'p'}]),true);
});

test('durable revisions include deletions and moderation but isolate private users',async()=>{
 const {pg,db}=await communityHarness();try{
  await pg.exec('create table korae_content_moderation(kind text,target text,hidden boolean);');
  await pg.exec(await readFile(new URL('../supabase/migrations/202611030001_cache_revisions.sql',import.meta.url),'utf8'));
  const snapshot=async uid=>(await pg.query('select korae_cache_snapshot($1) as value',[uid])).rows[0].value;
  await db.put({kind:'posts',id:'p',parent:'',owner:'alice',body:{content:'one'}});
  await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:1}});
  assert.deepEqual(await snapshot(null),{'public:posts':'1'});
  assert.equal((await snapshot('alice'))['user:alice:balances'],'1');assert.equal((await snapshot('bob'))['user:alice:balances'],undefined);
  await db.put({kind:'posts',id:'p',parent:'',owner:'alice',body:{content:'one'}});assert.equal((await snapshot(null))['public:posts'],'1');
  await pg.exec("insert into korae_content_moderation values('posts','p',true)");assert.equal((await snapshot(null))['public:posts'],'2');
  await db.remove('posts','p','','alice');assert.equal((await snapshot(null))['public:posts'],'3');
  await pg.exec('set role anon');await assert.rejects(snapshot('alice'),/permission denied/);
 }finally{await pg.close();}
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const user={uid:'alice',name:'Alice'};
test('SQL cursor pages preserve tied records, global ranking, coin totals, profiles and counts',async()=>{
  const {pg,db}=await communityHarness();
  try{
    await dispatch(db,user,'ensureProfile');
    for(let i=0;i<45;i++)await db.put({kind:'posts',id:'p'+String(i).padStart(2,'0'),parent:'',owner:'alice',body:{authorId:'alice',author:'old',coin:i<30?'BTC':'ETH',content:'Post '+i,createdAt:1000,support:i,oppose:0}});
    await dispatch(db,user,'comment',{postId:'p44',content:'hi',side:'support'});
    const repost=await dispatch(db,user,'repost',{postId:'p44',enabled:true});
    const top=await dispatch(db,user,'page',{options:{category:'지지'},limit:20});
    assert.equal(top.items[0].id,'p44');assert.equal(top.items[0].author,'Alice');assert.equal(top.items[0].commentCount,1);assert.equal(top.items[0].repostCount,1);assert.equal(top.items[0].reposted,true);
    let cursor=null,all=[];
    do{const page=await dispatch(db,user,'page',{options:{category:'최신'},cursor,limit:20});all.push(...page.items);cursor=page.nextCursor;}while(cursor);
    assert.equal(all.length,46);assert.equal(new Set(all.map(p=>p.id)).size,46);assert.equal(all[0].id,repost.id);
    const coins=await dispatch(db,null,'page',{options:{mode:'coins',category:'지지'},limit:1});
    assert.equal(coins.items[0].coin,'ETH');assert.equal(coins.items[0].count,16);assert.equal(coins.items[0].score,555);
    const next=await dispatch(db,null,'page',{options:{mode:'coins',category:'지지'},cursor:coins.nextCursor,limit:1});
    assert.equal(next.items[0].coin,'BTC');assert.equal(next.items[0].count,30);assert.equal(next.nextCursor,null);
    assert.equal((await dispatch(db,user,'page',{options:{category:'최신',since:1001}})).items.length,1);
    assert.equal((await dispatch(db,user,'page',{options:{category:'팔로잉'}})).items.length,0);
    await dispatch(db,{uid:'bob',name:'Bob'},'follow',{id:'alice',enabled:true});
    assert.equal((await dispatch(db,{uid:'bob'},'page',{options:{category:'팔로잉'}})).items.length,20);
    assert.equal((await dispatch(db,user,'page',{options:{category:'최신',repostedBy:'alice'}})).items[0].id,repost.id);
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
test('offline profiles hydrate; balance snapshots are account scoped while messages and own comments stay out of query storage',async()=>{
  const writes=[],values=[];const storage={get:async()=>({time:Date.now(),value:{id:'alice',username:'cached'}}),set:async row=>writes.push(row),remove:async()=>{}};
  let offline=true;
  const client=createCommunityClient({url:'https://example.test',token:async()=>null,storage,fetcher:async()=>{
    if(offline)throw Error('offline');return {ok:true,json:async()=>({data:{current:42}})};
  }});
  client.setScope('alice');
  const stop=client.watch('profile',{id:'alice'},value=>values.push(value),()=>{});await tick();
  assert.equal(values[0].username,'cached');stop();offline=false;
  await client.call('balance',{uid:'alice'});await client.call('messages',{friendId:'bob'});
  await client.call('page',{options:{mode:'ownComments'}});
  assert.equal(writes.length,1);assert.equal(writes[0].action,'balance');assert.equal(writes[0].scope,'alice');assert.ok(writes[0].key.startsWith('alice:'));
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

test('initial page restoration allows device cache while explicit refresh bypasses it',async()=>{
 const forces=[];
 const store=createPagedStore({saved:async()=>({value:{items:[],nextCursor:null}}),load:async(_,cursor,force)=>{forces.push(force);return {items:[{id:'one'}],nextCursor:null};},observe:()=>()=>{}});
 const page=store.get({mode:'posts'});const stop=page.subscribe(()=>{});await tick();
 assert.deepEqual(forces,[false]);await page.refresh();assert.deepEqual(forces,[false,true]);stop();
});
