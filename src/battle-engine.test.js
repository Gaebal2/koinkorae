import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseGame,newGame,jump,step,GROUND} from './battle-engine.js';
import {newBattleProgress,advanceBattle,continueBattleProgress,battleRandom} from '../functions/battle-progress.js';
import {TICK} from '../functions/battle-validation.js';
test('new one-touch games score, end and replay identically on the server',()=>{
  for(const kind of ['stack','tower','dodge']) {
    const progress=newBattleProgress(kind,42),g=structuredClone(progress.game),rng=battleRandom(42),inputs=[];
    let ticks=0;
    while(!g.ended&&ticks<1200){
      let action=false;
      if(kind==='stack')action=(g.score===0&&Math.abs(g.x-g.baseX)<2)||(g.score>0&&(g.x<2||g.x>360-g.width-2));
      if(kind==='tower')action=!g.airborne&&((g.score===0&&g.time>1.29)||(g.score>0&&Math.abs(Math.sin((g.time+.8)*(1.5+g.score/20)+g.phase))>.7));
      if(kind==='dodge')action=g.score===0&&g.obstacles.some(o=>o.lane===g.lane&&o.y>250);
      if(action){inputs.push(ticks);jump(g);}step(g,TICK,rng);ticks++;
    }
    assert.ok(g.score>0,kind+' must score');assert.ok(g.ended,kind+' must end');
    const saved=advanceBattle(progress,inputs,ticks,ticks*TICK*1000);assert.deepEqual(saved.game,g);
    const continued=continueBattleProgress(saved);assert.equal(continued.bankedScore,g.score);assert.equal(continued.game.score,0);assert.equal(continued.game.kind,kind);
  }
});
test('random selection includes all five games',()=>{assert.deepEqual([0,.2,.4,.6,.8].map(chooseGame),['flappy','runner','stack','tower','dodge']);assert.equal(chooseGame(.999),'dodge')});
test('runner jumps only from ground and lands',()=>{const g=newGame('runner');jump(g);step(g,.05);const v=g.velocity;jump(g);assert.equal(g.velocity,v);for(let i=0;i<90;i++)step(g,1/120);assert.equal(g.y,GROUND-34)});
test('bird flap and ground collision stop game',()=>{const g=newGame('flappy');jump(g);step(g,.01);assert.ok(g.y<190);for(let i=0;i<240;i++)step(g,1/120);assert.equal(g.reason,'collision');const t=g.time;step(g,1);assert.equal(g.time,t)});
test('pipe scores once and pipe collision ends game',()=>{const g=newGame('flappy');g.obstacles=[{x:24,w:50,gap:190,passed:false}];step(g,.01);assert.equal(g.score,1);step(g,.01);assert.equal(g.score,1);g.obstacles=[{x:80,w:50,gap:300,passed:false}];step(g,.01);assert.equal(g.reason,'collision')});
test('cactus collision ends play but passing 60 seconds does not',()=>{const g=newGame('runner');g.obstacles=[{x:66,w:30,h:40}];step(g,.01);assert.equal(g.reason,'collision');const h=newGame('runner');h.time=59.99;h.nextObstacle=100;step(h,.02);assert.equal(h.ended,false);assert.equal(h.score,0)});

test('every successful obstacle, block or landing awards exactly one point',()=>{
  const stack=newGame('stack');stack.x=stack.baseX;jump(stack);assert.equal(stack.score,1);
  const tower=newGame('tower');tower.time=Math.PI/1.5-.8;jump(tower);step(tower,.8,()=>0);assert.equal(tower.score,1);
  for(const kind of ['runner','flappy','dodge']) {
    const game=newGame(kind);game.nextObstacle=100;
    game.obstacles=kind==='dodge'?[{lane:1,y:359,passed:false}]:[{x:20,w:20,h:30,gap:190,passed:false}];
    step(game,TICK);assert.equal(game.score,1,kind);
    step(game,TICK);assert.equal(game.score,1,kind+' must not count twice');
  }
});

test('dodge speed rises gradually and stays capped with time to change lanes',()=>{
  const measure=time=>{const game=newGame('dodge');game.time=time;game.nextObstacle=Infinity;game.obstacles=[{lane:1,y:0,passed:false}];step(game,TICK);return game.obstacles[0].y/TICK;};
  assert.ok(measure(0)>=220);assert.ok(measure(30)>measure(0));assert.ok(measure(120)<=340);
  for(const time of [0,30,120]){const game=newGame('dodge');game.time=time;step(game,TICK,()=>1);const interval=game.nextObstacle-game.time;assert.ok(interval>=.8-1e-9);assert.ok(interval*measure(time)>58,'opposite obstacles must not block both lanes');}
});
