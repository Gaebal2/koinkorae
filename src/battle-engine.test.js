import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseGame,newGame,jump,step,GROUND,GAME_KINDS} from './battle-engine.js';
import {newBattleProgress,advanceBattle,continueBattleProgress,battleRandom} from '../functions/battle-progress.js';
import {TICK} from '../functions/battle-validation.js';
test('new one-touch games score, end and replay identically on the server',()=>{
  for(const kind of ['tower']) {
    const progress=newBattleProgress(kind,42),g=structuredClone(progress.game),rng=battleRandom(42),inputs=[];
    let ticks=0;
    while(!g.ended&&ticks<1200){
      let action=false;
      if(kind==='tower')action=!g.airborne&&((g.score===0&&g.time>1.29)||(g.score>0&&Math.abs(Math.sin((g.time+.8)*(1.5+g.score/20)+g.phase))>.7));
      if(action){inputs.push(ticks);jump(g);}step(g,TICK,rng);ticks++;
    }
    assert.ok(g.score>0,kind+' must score');assert.ok(g.ended,kind+' must end');
    const saved=advanceBattle(progress,inputs,ticks,ticks*TICK*1000);assert.deepEqual(saved.game,g);
    const continued=continueBattleProgress(saved);assert.equal(continued.bankedScore,g.score);assert.equal(continued.game.score,0);assert.ok(GAME_KINDS.includes(continued.game.kind));
  }
});
test('random selection includes all seven supported games',()=>{assert.deepEqual(GAME_KINDS.map((_,i)=>chooseGame(i/GAME_KINDS.length)),GAME_KINDS);assert.equal(chooseGame(.999),'breakout');for(const kind of ['stack','dodge'])assert.throws(()=>newGame(kind));});

test('continuation reselects all seven games including the previous game and banks points exactly once',()=>{
  for (const previous of GAME_KINDS) {
    const selected=new Set();
    for (let seed=0;seed<5000;seed+=100) {
      const progress=newBattleProgress(previous,seed);
      progress.game.ended=true;progress.game.score=7;progress.bankedScore=11;
      const next=continueBattleProgress(progress);
      selected.add(next.game.kind);
      assert.equal(next.bankedScore,18);assert.equal(next.game.score,0);
      assert.equal(next.round,1);assert.equal(next.revision,1);
      assert.deepEqual(continueBattleProgress(progress),next);
      assert.throws(()=>continueBattleProgress(next));
      assert.equal(progress.bankedScore,11);
    }
    assert.deepEqual([...selected].sort(),[...GAME_KINDS].sort());
  }
});
test('runner jumps only from ground and lands',()=>{const g=newGame('runner');jump(g);step(g,.05);const v=g.velocity;jump(g);assert.equal(g.velocity,v);for(let i=0;i<90;i++)step(g,1/120);assert.equal(g.y,GROUND-34)});
test('bird flap and ground collision stop game',()=>{const g=newGame('flappy');jump(g);step(g,.01);assert.ok(g.y<190);for(let i=0;i<240;i++)step(g,1/120);assert.equal(g.reason,'collision');const t=g.time;step(g,1);assert.equal(g.time,t)});
test('pipe scores once and pipe collision ends game',()=>{const g=newGame('flappy');g.obstacles=[{x:24,w:50,gap:190,passed:false}];step(g,.01);assert.equal(g.score,1);step(g,.01);assert.equal(g.score,1);g.obstacles=[{x:80,w:50,gap:300,passed:false}];step(g,.01);assert.equal(g.reason,'collision')});
test('cactus collision ends play but passing 60 seconds does not',()=>{const g=newGame('runner');g.obstacles=[{x:66,w:30,h:40}];step(g,.01);assert.equal(g.reason,'collision');const h=newGame('runner');h.time=59.99;h.nextObstacle=100;step(h,.02);assert.equal(h.ended,false);assert.equal(h.score,0)});

test('every successful obstacle, block or landing awards exactly one point',()=>{
  const tower=newGame('tower');tower.time=Math.PI/1.5-.8;jump(tower);step(tower,.8,()=>0);assert.equal(tower.score,1);
  for(const kind of ['runner','flappy']) {
    const game=newGame(kind);game.nextObstacle=100;
    game.obstacles=[{x:20,w:20,h:30,gap:190,passed:false}];
    step(game,TICK);assert.equal(game.score,1,kind);
    step(game,TICK);assert.equal(game.score,1,kind+' must not count twice');
  }
});

test('tower landing preserves world position and scrolls the camera without moving landed platforms',()=>{
 const g=newGame('tower');g.time=Math.PI/1.5-.8;jump(g);step(g,.79,()=>0);step(g,.01,()=>0);
 assert.equal(g.score,1);assert.equal(g.platforms.at(-1).y,245);
 const landed=structuredClone(g.platforms.at(-1)),camera=g.cameraY;
 for(let i=0;i<120;i++)step(g,TICK,()=>0);
 assert.deepEqual(g.platforms.at(-1),landed);assert.ok(g.cameraY>camera);assert.ok(g.cameraY<120);
 assert.equal(g.airborne,false);assert.equal(g.score,1);
 const before=g.platforms.at(-1).y;jump(g);step(g,TICK,()=>0);assert.equal(g.platforms.at(-1).y,before);assert.ok(g.airborne);
});

test('speed grows without a cap while survival scores use real seconds',async()=>{
 const {gameSpeed}=await import('./battle-engine.js');
 assert.equal(gameSpeed(0),1);assert.equal(gameSpeed(10),1.1);assert.equal(gameSpeed(100),2);assert.equal(gameSpeed(1000),11);
 for(const kind of ['bounce','rain','traffic']) {
  const g=newGame(kind);g.time=99;g.simulationTime=0;g.nextBall=1e9;g.nextObstacle=1e9;
  step(g,3,()=>0);assert.ok(Math.abs(g.time-102)<1e-8);assert.equal(g.score,34);assert.ok(Math.abs(g.simulationTime-5.9)<1e-7);
 }
});
test('new games replay gestures exactly through server checkpoints',async()=>{
 const {moveBouncePlayer}=await import('./battle-engine.js');
 for(const kind of ['rain','traffic','breakout']) {
  let p=newBattleProgress(kind,42);const g=structuredClone(p.game),rng=battleRandom(42);
  for(let packet=0;packet<4&&!g.ended;packet++) {
   let ticks=0;const inputs=[];
   while(ticks<360&&!g.ended){if(ticks%60===0){const dx=ticks%120===0?10:-10;inputs.push([ticks,dx*16,0]);moveBouncePlayer(g,dx,0);}step(g,TICK,rng);ticks++;}
   p=advanceBattle(p,inputs,ticks,20000);assert.deepEqual(p.game,g);assert.equal(p.randomState,rng.state());
  }
  assert.throws(()=>advanceBattle(newBattleProgress(kind,1),[[0,0.5,0]],1,1000));
 }
});
test('rain and traffic collide; traffic uses eight lanes and both vehicle types',()=>{
 for(const kind of ['rain','traffic']){const g=newGame(kind);g.obstacles=[{x:170,y:375,w:25,h:30}];step(g,TICK,()=>0);assert.equal(g.reason,'collision');const score=g.score;step(g,3);assert.equal(g.score,score);}
 const lanes=new Set(),types=new Set();for(let i=0;i<8;i++)for(const type of [0,.9]){const g=newGame('traffic');g.nextObstacle=0;let n=0;step(g,TICK,()=>n++===0?type:(i+.5)/8);const b=g.obstacles[0];lanes.add(Math.floor(b.x/45));types.add(b.motorcycle);}assert.equal(lanes.size,8);assert.equal(types.size,2);
});
test('breakout awards one per brick, bounces on paddle, misses and renews cleared boards',()=>{
 const g=newGame('breakout');g.x=30;g.y=185;g.vx=0;g.vy=-220;step(g,.02);assert.equal(g.score,1);assert.equal(g.bricks.length,39);assert.ok(g.vy>0);
 g.x=g.paddleX;g.y=384;g.vy=220;step(g,.02);assert.ok(g.vy<0);
 g.bricks=[];step(g,TICK);assert.equal(g.bricks.length,40);assert.equal(g.score,1);
 g.x=15;g.y=449;g.vy=220;step(g,.02);assert.equal(g.reason,'miss');
});
test('all shared simulation files match their deployed counterparts',async()=>{
 const {readFile}=await import('node:fs/promises');for(const file of ['battle-engine.js','battle-progress.js','arcade-games.js'])assert.equal(await readFile(new URL('../functions/'+file,import.meta.url),'utf8'),await readFile(new URL('../supabase/functions/_shared/'+file,import.meta.url),'utf8'));
});
