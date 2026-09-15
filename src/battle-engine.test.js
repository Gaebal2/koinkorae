import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseGame,newGame,jump,step,GROUND} from './battle-engine.js';
test('random selection includes both games',()=>{assert.equal(chooseGame(0),'flappy');assert.equal(chooseGame(.499),'flappy');assert.equal(chooseGame(.5),'runner');assert.equal(chooseGame(.999),'runner')});
test('runner jumps only from ground and lands',()=>{const g=newGame('runner');jump(g);step(g,.05);const v=g.velocity;jump(g);assert.equal(g.velocity,v);for(let i=0;i<90;i++)step(g,1/120);assert.equal(g.y,GROUND-34)});
test('bird flap and ground collision stop game',()=>{const g=newGame('flappy');jump(g);step(g,.01);assert.ok(g.y<190);for(let i=0;i<240;i++)step(g,1/120);assert.equal(g.reason,'collision');const t=g.time;step(g,1);assert.equal(g.time,t)});
test('pipe scores once and pipe collision ends game',()=>{const g=newGame('flappy');g.obstacles=[{x:24,w:50,gap:190,passed:false}];step(g,.01);assert.equal(g.score,1);step(g,.01);assert.equal(g.score,1);g.obstacles=[{x:80,w:50,gap:300,passed:false}];step(g,.01);assert.equal(g.reason,'collision')});
test('cactus collision and 60 second finish',()=>{const g=newGame('runner');g.obstacles=[{x:66,w:30,h:40}];step(g,.01);assert.equal(g.reason,'collision');const h=newGame('runner');h.time=59.99;h.nextObstacle=100;step(h,.02);assert.equal(h.reason,'complete');assert.equal(h.score,600)});
