import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {POINTS_POLICY as P,POINT_ROWS,levelFor} from '../supabase/functions/_shared/points-policy.js';
import {newBattleProgress} from '../functions/battle-progress.js';
const identity={uid:'alice',name:'Alice'};
const today=()=>Math.floor((Date.now()+32400000)/86400000);
const writeBalance=async(db,b)=>db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:b});
const publish=(db,content='A useful original post')=>dispatch(db,identity,'publish',{value:{content,coin:'BTC'}});
const balance=db=>db.pointsBalance('alice');

test('workbook rows are all represented, adjusted policy matches SQL, and levels require every condition',async()=>{
 const source=JSON.parse(await readFile(new URL('./fixtures/points-policy-source.json',import.meta.url),'utf8'));
 assert.equal(POINT_ROWS.length,source.points.length);assert.deepEqual(P.levels.map(l=>l.name),source.levels.map(r=>r[0]));
 const {pg}=await communityHarness({pointsPolicy:true});try{assert.deepEqual((await pg.query('select body from korae_points_policy')).rows[0].body,P);}finally{await pg.close();}
 for(let i=0;i<P.levels.length;i++){
  const l=P.levels[i],stats={days:l.days,posts:l.posts,reposts:l.reposts,games:l.games,likes:l.likes};
  assert.equal(levelFor({lifetime:l.bp,current:0,stats}).index,i);
  if(i){for(const key of Object.keys(stats)){assert.ok(levelFor({lifetime:l.bp,stats:{...stats,[key]:stats[key]-1}}).index<i);}}
 }
 assert.equal(levelFor({level:6,current:0,lifetime:100000}).current.name,'고래');
 // Before extras, the requested mission has a positive but bounded daily budget.
 assert.equal(P.attendance+P.missionReward-P.mission.posts*P.costs.posts-P.mission.comments*P.costs.comments,80);
});

test('welcome is once per account, existing KK is preserved, service role can execute and anon cannot',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});try{
  await pg.exec('alter role service_role bypassrls; set role service_role');
  const first=await balance(db);assert.equal(first.current,100);assert.equal(first.lifetime,100);
  assert.deepEqual(await balance(db),first);
  await db.put({kind:'profiles',id:'alice',parent:'',owner:'alice',body:{username:'Alice'}});assert.equal((await balance(db)).current,100);
  await assert.rejects(dispatch(db,identity,'balance',{uid:'someone-else'}));
  await pg.exec('set role anon');await assert.rejects(pg.query("select korae_mutate('pointsBalance','alice')"));
 }finally{await pg.close();}
});

test('attendance awards milestones exactly once, resets on gaps and after 365 days, and uses earned level bonus',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});try{
  let b=await balance(db);
  for(const [streak,extra] of [[9,100],[29,500],[99,3000],[364,10000]]){
   // Each scenario starts from a clean claim ledger and a prior-day check-in.
   await pg.query("delete from korae_point_events where uid='alice' and action='checkin'");
   b={...b,day:today()-1,streak,current:100,lifetime:100,level:0,stats:{days:streak,posts:0,reposts:0,games:0,likes:0}};await writeBalance(db,b);
   const checked=await dispatch(db,identity,'checkin');assert.equal(checked.current,120+extra);assert.equal(checked.lastCheckinReward,20+extra);assert.equal(checked.streak,streak+1);
   assert.deepEqual(await dispatch(db,identity,'checkin'),checked);
  }
  await pg.query("delete from korae_point_events where uid='alice' and action='checkin'");
  b=await balance(db);await writeBalance(db,{...b,day:today()-1,streak:365,level:1});
  let checked=await dispatch(db,identity,'checkin');assert.equal(checked.streak,1);assert.equal(checked.lastCheckinReward,25);
  await pg.query("delete from korae_point_events where uid='alice' and action='checkin'");
  await writeBalance(db,{...checked,day:today()-3,streak:9});checked=await dispatch(db,identity,'checkin');assert.equal(checked.streak,1);assert.equal(checked.lastStreakReward,0);
 }finally{await pg.close();}
});

test('activity charges are atomic, spend does not lower lifetime, repost retries and edits do not charge twice',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});try{
  await publish(db);let b=await balance(db);assert.equal(b.current,90);assert.equal(b.lifetime,100);assert.equal(b.stats.posts,1);
  const post=(await db.list('posts'))[0];
  await dispatch(db,identity,'comment',{postId:post.id,content:'First comment',side:'support'});assert.equal((await balance(db)).current,88);
  await dispatch(db,identity,'repost',{postId:post.id,enabled:true});await dispatch(db,identity,'repost',{postId:post.id,enabled:true});assert.equal((await balance(db)).current,78);assert.equal((await balance(db)).stats.reposts,1);
  await dispatch(db,identity,'repost',{postId:post.id,enabled:false});await dispatch(db,identity,'repost',{postId:post.id,enabled:true});assert.equal((await balance(db)).current,78);
  b=await balance(db);await writeBalance(db,{...b,current:1});const count=(await db.list('posts')).length;
  await assert.rejects(publish(db,'Not enough points to publish'),/KK가 부족/);assert.equal((await db.list('posts')).length,count);assert.equal((await balance(db)).current,1);
 }finally{await pg.close();}
});

test('mission rewards only unique qualifying activities and verified rounds, once per Korea day',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});try{
  await balance(db);await writeBalance(db,{...await balance(db),current:1000});
  for(let i=0;i<5;i++)await publish(db,'Distinct original content '+i);
  await publish(db,'Distinct original content 0');
  const posts=await db.list('posts');let b=await balance(db);assert.equal(b.mission.posts,3);
  for(let i=0;i<5;i++)await dispatch(db,identity,'comment',{postId:posts[i].id,content:'Useful comment',side:'support'});
  await dispatch(db,identity,'comment',{postId:posts[0].id,content:'Another comment same feed',side:'support'});assert.equal((await balance(db)).mission.comments,5);
  const progress=newBattleProgress('runner',1),session={id:'session',postId:posts[0].id,side:'support',protocol:2,gameVersion:4,status:'playing',startedAt:Date.now()-120000,progress};
  await db.put({kind:'battleSessions',id:'alice',parent:'',owner:'alice',body:session});
  // Model the already verified checkpoint state written by the production transaction.
  for(let round=0;round<5;round++){
   const p={...progress,round,game:{...progress.game,ended:true,time:10,score:1}};
   await db.put({kind:'battleSessions',id:'alice',parent:'',owner:'alice',body:{...session,progress:p}});
   await db.put({kind:'battleSessions',id:'alice',parent:'',owner:'alice',body:{...session,progress:p}});
  }
  b=await balance(db);assert.equal(b.mission.games,5);assert.equal(b.stats.games,5);assert.equal(b.mission.claimed,true);assert.equal(b.lifetime,200);assert.equal(b.current,1028);
  assert.equal(+(await pg.query("select count(*) n from korae_point_events where action='mission-reward'")).rows[0].n,1);
  await db.put({kind:'battleSessions',id:'alice',parent:'',owner:'alice',body:{...session,progress:{...progress,round:5,game:{...progress.game,ended:true,time:1,score:0}}}});
  assert.equal((await balance(db)).stats.games,5);
  await writeBalance(db,{...b,mission:{...b.mission,day:today()-1}});await publish(db,'New day unique content');b=await balance(db);assert.equal(b.mission.posts,1);assert.equal(b.mission.games,0);assert.equal(b.mission.claimed,false);
 }finally{await pg.close();}
});

test('like toggles and self likes cannot inflate ranks; earned ranks are permanent',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});try{
  await publish(db);const post=(await db.list('posts'))[0];
  await dispatch(db,identity,'like',{postId:post.id,enabled:true});assert.equal((await balance(db)).stats.likes,0);
  for(let i=0;i<3;i++){await dispatch(db,{uid:'bob'},'like',{postId:post.id,enabled:true});await dispatch(db,{uid:'bob'},'like',{postId:post.id,enabled:false});}
  assert.equal((await balance(db)).stats.likes,1);
 }finally{await pg.close();}
});

test('markers charge on creation, edits are free, and earned whale rank allows five slots',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});try{
  await balance(db);const value={title:'Marker',description:'Description',coin:'BTC',tradeCoins:['BTC'],lat:37, lng:127,category:'P2P 판매',image:'',link:''};
  const pins=[];for(let i=0;i<3;i++)pins.push(await dispatch(db,identity,'savePin',{value}));
  assert.equal((await balance(db)).current,70);await assert.rejects(dispatch(db,identity,'savePin',{value}),/한도/);
  await dispatch(db,identity,'savePin',{id:pins[0].id,value:{...value,title:'Changed'}});assert.equal((await balance(db)).current,70);
  await writeBalance(db,{...await balance(db),level:6});
  for(let i=0;i<2;i++)await dispatch(db,identity,'savePin',{value});assert.equal((await balance(db)).current,50);
  await assert.rejects(dispatch(db,identity,'savePin',{value}),/한도/);
 }finally{await pg.close();}
});

test('rollout preserves existing balances, known attendance and content without retroactive charges',async()=>{
 const {pg,db}=await communityHarness();try{
  await db.put({kind:'profiles',id:'alice',parent:'',owner:'alice',body:{username:'Alice'}});
  await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:40,lifetime:300,day:today()-1,checkinDays:[today()-2,today()-1]}});
  // History is held by the existing trigger; save both known days through it.
  await pg.query("update korae_documents set body=jsonb_set(body,'{day}',to_jsonb($1::integer)) where kind='balances' and id='alice'",[today()-2]);
  await pg.query("update korae_documents set body=jsonb_set(body,'{day}',to_jsonb($1::integer)) where kind='balances' and id='alice'",[today()-1]);
  await publish(db);
  await pg.exec(await readFile(new URL('../supabase/migrations/202610070002_trial_members.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../supabase/migrations/202610120001_points_policy.sql',import.meta.url),'utf8'));
  let b=(await db.one('balances','alice')).body;
  assert.equal(b.current,140);assert.equal(b.lifetime,400);assert.equal(b.stats.posts,1);assert.equal(b.stats.days,2);assert.equal(b.streak,2);
  await pg.query("select korae_mutate('pointsBalance','alice')");assert.deepEqual((await db.one('balances','alice')).body,b);
  const checked=await dispatch(db,identity,'checkin');assert.equal(checked.current,160);assert.equal(checked.stats.days,3);assert.equal(checked.streak,3);
 }finally{await pg.close();}
});
