import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newGame,step,moveBouncePlayer,ARENA,MOVE_SCALE} from '../functions/battle-engine.js';
import {newBattleProgress,advanceBattle,battleRandom,continueBattleProgress} from '../functions/battle-progress.js';
import {TICK} from '../functions/battle-validation.js';
import {createRelativeDrag} from '../src/relative-drag.js';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';

test('balls spawn every three seconds at fixed speed and each awards one point',()=>{
  const game=newGame('bounce');moveBouncePlayer(game,0,100);
  for(let i=0;i<359;i++)step(game,TICK,()=>0);
  assert.equal(game.score,0);step(game,TICK,()=>0);
  assert.equal(game.score,1);assert.equal(game.balls.length,1);
  for(let i=0;i<360;i++)step(game,TICK,()=>0);
  assert.equal(game.ended,false);assert.equal(game.score,2);assert.equal(game.balls.length,2);
  for(const b of game.balls)assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-ARENA.speed)<1e-9);
});

test('balls turn inward at the wall and exchange directions on collision',()=>{
  const game=newGame('bounce');game.y=320;game.nextBall=100;
  game.balls=[{x:330,y:220,vx:100,vy:0,hue:0}];step(game,.02,()=>0);
  assert.ok(game.balls[0].vx<0);assert.ok(game.balls[0].x<=ARENA.x+ARENA.radius-ARENA.ballRadius);
  game.balls=[{x:100,y:220,vx:100,vy:0},{x:113,y:220,vx:-100,vy:0}];step(game,TICK,()=>0);
  assert.equal(game.balls[0].vx,-100);assert.equal(game.balls[1].vx,100);
});

test('touching the circular boundary or crossing a ball ends play and scoring stops',()=>{
  const border=newGame('bounce');moveBouncePlayer(border,ARENA.radius-ARENA.playerRadius,0);
  assert.equal(border.reason,'border');step(border,3,()=>0);assert.equal(border.score,0);
  const crossing=newGame('bounce');crossing.balls=[{x:220,y:220,vx:0,vy:100}];
  moveBouncePlayer(crossing,90,0);assert.equal(crossing.reason,'collision');
  const stationary=newGame('bounce');stationary.balls=[{x:180,y:240,vx:0,vy:-100}];
  step(stationary,TICK,()=>0);assert.equal(stationary.reason,'collision');
});

test('relative drag anchors anywhere without teleporting, scales deltas, ignores extra fingers and resets',()=>{
  const drag=createRelativeDrag();assert.equal(drag.begin(1,20,400),true);
  assert.deepEqual(drag.take(),[0,0]);drag.move(1,30,380,2,2);
  assert.deepEqual(drag.take(),[20*MOVE_SCALE,-40*MOVE_SCALE]);
  assert.equal(drag.begin(2,100,100),false);drag.move(2,200,200,1,1);assert.deepEqual(drag.take(),[0,0]);
  drag.end(1);drag.begin(2,280,100);assert.deepEqual(drag.take(),[0,0]);
  drag.move(2,285,105,1,1);assert.deepEqual(drag.take(),[5*MOVE_SCALE,5*MOVE_SCALE]);
  drag.move(2,290,110,1,1);drag.reset();assert.deepEqual(drag.take(),[0,0]);
});

test('server replay matches relative movement across checkpoints and rejects malformed or post-death input',()=>{
  let progress=newBattleProgress('bounce',42),game=structuredClone(progress.game),random=battleRandom(42);
  for(let packet=0;packet<3&&!game.ended;packet++){
    const inputs=[];let ticks=0;
    while(ticks<300&&!game.ended){
      if(ticks===0){const dx=(packet===1?-10:10)*MOVE_SCALE,dy=packet===0?60*MOVE_SCALE:0;inputs.push([ticks,dx,dy]);moveBouncePlayer(game,dx/MOVE_SCALE,dy/MOVE_SCALE);}
      step(game,TICK,random);ticks++;
    }
    progress=advanceBattle(progress,inputs,ticks,20000);assert.deepEqual(progress.game,game);assert.equal(progress.randomState,random.state());
  }
  const start=newBattleProgress('bounce',42);
  for(const input of [[0],[0,0],[0,NaN,0],[0,Infinity,0],[0,0.5,0],[0,99999,0],{tick:0,dx:0,dy:0}])assert.throws(()=>advanceBattle(start,[input],1,1000));
  assert.throws(()=>advanceBattle(start,[[0,0,0],[0,1,0]],2,1000));
  assert.throws(()=>advanceBattle(start,[[1,0,0]],1,1000));
  assert.throws(()=>advanceBattle(newBattleProgress('runner',1),[[0,0,0]],1,1000));
  const ended=advanceBattle(start,[[0,300*MOVE_SCALE,0]],1,1000);
  assert.equal(ended.game.ended,true);assert.throws(()=>advanceBattle(ended,[],1,1000));
  assert.throws(()=>advanceBattle(start,[],1200,0));
});

test('bounce score is accumulated and applied once through the production transaction flow',async()=>{
  const {pg,db}=await communityHarness();try{
    await db.put({kind:'posts',id:'post',parent:'',owner:'owner',body:{authorId:'owner',author:'Owner',content:'Game',coin:'PSL',createdAt:1,support:0,oppose:0}});
    let progress=newBattleProgress('bounce',42);
    await db.put({kind:'battleSessions',id:'player',parent:'',owner:'player',body:{id:'bounce-test',postId:'post',side:'support',protocol:2,gameVersion:3,kind:'bounce',seed:42,status:'playing',startedAt:Date.now()-60000,progress}});
    // The first ball appears at tick 360. Moving to the border then ends the round.
    progress=await dispatch(db,{uid:'player'},'checkpointBattle',{sessionId:'bounce-test',revision:0,inputs:[[360,300*MOVE_SCALE,0]],ticks:361});
    assert.equal(progress.game.score,1);assert.equal(progress.game.reason,'border');
    await assert.rejects(dispatch(db,{uid:'other'},'applyBattle',{sessionId:'bounce-test'}));
    const first=await dispatch(db,{uid:'player'},'applyBattle',{sessionId:'bounce-test'});
    assert.equal(first.score,1);assert.deepEqual(await dispatch(db,{uid:'player'},'applyBattle',{sessionId:'bounce-test'}),first);
    assert.equal((await db.one('posts','post')).body.support,1);
    const continued=continueBattleProgress(progress);assert.equal(continued.bankedScore,1);assert.equal(continued.game.score,0);
    for(let seed=0;seed<5000;seed+=100){progress.randomState=seed;assert.notEqual(continueBattleProgress(progress,['flappy','runner','tower']).game.kind,'bounce');}
  }finally{await pg.close();}
});

test('deployed bounce simulation is identical to the browser engine',async()=>{
  assert.equal(await readFile(new URL('../functions/bounce-game.js',import.meta.url),'utf8'),await readFile(new URL('../supabase/functions/_shared/bounce-game.js',import.meta.url),'utf8'));
});
