import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../supabase/functions/community/handler.js';
import {communityHarness} from './community-harness.js';
import {newBattleProgress,advanceBattle,continueBattleProgress,battleRandom,CHECKPOINT_TICKS} from '../functions/battle-progress.js';
import {step,jump} from '../functions/battle-engine.js';
import {TICK} from '../functions/battle-validation.js';
const a={uid:'alice',name:'Alice'},b={uid:'bob',name:'Bob'},c={uid:'charlie',name:'Charlie'};

test('private friend chat requires mutual follows, persists, paginates and deduplicates sends',async()=>{
 const {pg,db}=await communityHarness();try{
  await assert.rejects(dispatch(db,null,'messages',{friendId:'bob'}),/로그인/);
  await dispatch(db,a,'ensureProfile');await dispatch(db,b,'ensureProfile');
  assert.deepEqual(await dispatch(db,a,'friends'),[]);
  await dispatch(db,a,'follow',{id:'bob',enabled:true});
  await assert.rejects(dispatch(db,a,'sendMessage',{friendId:'bob',content:'hi',requestId:'one'}),/친구/);
  await dispatch(db,b,'follow',{id:'alice',enabled:true});
  assert.equal((await dispatch(db,a,'friends'))[0].id,'bob');
  const message={friendId:'bob',content:'hello',requestId:'one'};
  const sent=await dispatch(db,a,'sendMessage',message);
  assert.deepEqual(await dispatch(db,a,'sendMessage',message),sent);
  assert.equal((await dispatch(db,b,'messages',{friendId:'alice'}))[0].content,'hello');
  await assert.rejects(dispatch(db,c,'messages',{friendId:'alice'}),/친구/);
  await assert.rejects(dispatch(db,a,'sendMessage',{...message,content:'changed'}),/ID/);
  for(let i=0;i<101;i++)await dispatch(db,b,'sendMessage',{friendId:'alice',content:'message '+i,requestId:'m'+i});
  const recent=await dispatch(db,a,'messages',{friendId:'bob'});assert.equal(recent.length,100);
  const previous=await dispatch(db,a,'messages',{friendId:'bob',before:recent[0].createdAt});assert.equal(previous.length,2);assert.equal(previous[0].id,'one');
  await dispatch(db,b,'follow',{id:'alice',enabled:false});
  await assert.rejects(dispatch(db,a,'messages',{friendId:'bob'}),/친구/);
  await assert.rejects(dispatch(db,a,'sendMessage',{friendId:'bob',content:'blocked',requestId:'blocked'}),/친구/);
  for(const role of ['anon','authenticated']){await pg.exec(`set role ${role}`);await assert.rejects(pg.query("select * from korae_documents where kind='messages'"),/permission denied/);await assert.rejects(pg.query("select korae_mutate('applyBattle','alice','x')"),/permission denied/);await pg.exec('reset role');}
 }finally{await pg.close();}
});

test('profile edits update historic posts, pins, comments and friend identities',async()=>{
 const {pg,db}=await communityHarness();try{
  await dispatch(db,a,'ensureProfile');await dispatch(db,b,'ensureProfile');
  const pin=await dispatch(db,a,'savePin',{value:{title:'Test',description:'Description',coin:'PI',category:'상점 등록',tradeCoins:[],image:'',link:'',lat:0,lng:0}});
  await dispatch(db,a,'publish',{value:{content:'old post',coin:'PI'}});const post=(await dispatch(db,null,'posts'))[0];
  await dispatch(db,a,'comment',{postId:post.id,content:'old comment',side:'support'});
  const photo='data:image/png;base64,AAAA';await dispatch(db,a,'saveProfile',{value:{username:'Updated',bio:'new',profileImage:photo}});
  assert.equal((await dispatch(db,null,'posts'))[0].author,'Updated');
  assert.equal((await dispatch(db,null,'getPin',{id:pin.id})).creator,'Updated');
  assert.equal((await dispatch(db,null,'profile',{id:'alice'})).profileImage,photo);
  assert.equal((await dispatch(db,null,'comments',{postId:post.id}))[0].author,'Updated');
  await dispatch(db,b,'follow',{id:'alice',enabled:true});await dispatch(db,a,'follow',{id:'bob',enabled:true});
  assert.equal((await dispatch(db,b,'friends'))[0].username,'Updated');
 }finally{await pg.close();}
});

function packet(progress,autoplay=false){
 const game=structuredClone(progress.game),random=battleRandom(progress.randomState),inputs=[];let ticks=0;
 while(!game.ended && ticks<CHECKPOINT_TICKS){
  const obstacle=game.obstacles.find(o=>o.x+o.w>63);
  if(autoplay && game.kind==='runner' && obstacle && obstacle.x<170 && game.velocity===0){inputs.push(ticks);jump(game);}
  step(game,TICK,random);ticks++;
 }
 return {inputs,ticks,game};
}
test('checkpoint replay supports long play and rejects forged, out-of-order and post-death input',()=>{
 let progress=newBattleProgress('runner',1234);
 for(let i=0;i<8;i++){const p=packet(progress,true);assert.equal(p.game.ended,false);progress=advanceBattle(progress,p.inputs,p.ticks,100000);assert.deepEqual(progress.game,p.game);}
 assert.ok(progress.game.time>60);assert.ok(progress.game.score>600);
 assert.throws(()=>advanceBattle(progress,[],1201,100000));assert.throws(()=>advanceBattle(progress,[2,1],3,100000));assert.throws(()=>advanceBattle(progress,[],1,0));
 const p=packet(newBattleProgress('runner',5));const ended=advanceBattle(newBattleProgress('runner',5),p.inputs,p.ticks,10000);
 assert.ok(ended.game.ended);assert.throws(()=>advanceBattle(ended,[],1,10000));
 const next=continueBattleProgress(ended);assert.equal(next.bankedScore,ended.game.score);assert.equal(next.game.score,0);assert.equal(next.game.ended,false);
});

test('battle continuation retains points, never applies automatically, and applies exactly once',async()=>{
 const {pg,db}=await communityHarness();try{
  await dispatch(db,a,'publish',{value:{content:'battle',coin:'PI'}});const post=(await dispatch(db,null,'posts'))[0];
  const session=await dispatch(db,a,'startBattle',{postId:post.id,side:'oppose',requestId:'session',protocol:2});
  await pg.query(`update korae_documents set body=body||$1::jsonb where kind='battleSessions' and id='alice'`,[JSON.stringify({kind:'runner',seed:5,startedAt:Date.now()-120000,progress:newBattleProgress('runner',5)})]);
  await assert.rejects(dispatch(db,b,'checkpointBattle',{sessionId:session.id,revision:0,inputs:[],ticks:1}));
  await assert.rejects(dispatch(db,a,'applyBattle',{sessionId:session.id}),/종료/);
  let progress=newBattleProgress('runner',5);const first=packet(progress);progress=await dispatch(db,a,'checkpointBattle',{sessionId:session.id,revision:0,inputs:first.inputs,ticks:first.ticks});
  assert.deepEqual(await dispatch(db,a,'checkpointBattle',{sessionId:session.id,revision:0,inputs:first.inputs,ticks:first.ticks}),progress);
  assert.equal((await db.one('posts',post.id)).body.oppose,0);
  const firstScore=progress.game.score;progress=await dispatch(db,a,'continueBattle',{sessionId:session.id,revision:progress.revision});assert.equal(progress.bankedScore,firstScore);
  const second=packet(progress);progress=await dispatch(db,a,'checkpointBattle',{sessionId:session.id,revision:progress.revision,inputs:second.inputs,ticks:second.ticks});
  assert.equal((await db.one('posts',post.id)).body.oppose,0);
  const results=await Promise.all([dispatch(db,a,'applyBattle',{sessionId:session.id}),dispatch(db,a,'applyBattle',{sessionId:session.id})]);
  assert.deepEqual(results[0],results[1]);assert.equal(results[0].score,firstScore+progress.game.score);assert.equal((await db.one('posts',post.id)).body.oppose,results[0].score);
  await assert.rejects(dispatch(db,a,'continueBattle',{sessionId:session.id,revision:progress.revision}));
 }finally{await pg.close();}
});
