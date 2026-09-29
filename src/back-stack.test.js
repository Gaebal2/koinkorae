import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackStack} from './back-stack.js';
test('back closes one top layer, then conversation, then page without cleanup navigation',()=>{
  let pop,pushes=0;const calls=[],history={state:null,pushState(value){this.state=value;pushes++;}};
  const stack=createBackStack(history,{addEventListener(event,fn){assert.equal(event,'popstate');pop=fn;}});
  stack.add(()=>calls.push('page'),0);
  const chat=stack.add(()=>calls.push('chat'),40),modal=stack.add(()=>calls.push('modal'));
  const alert=stack.add(()=>calls.push('alert'),200);
  pop();assert.deepEqual(calls,['alert']);alert();pop();assert.deepEqual(calls,['alert','modal']);
  modal();pop();chat();pop();pop();assert.deepEqual(calls,['alert','modal','chat','page','page']);assert.equal(pushes,6);
});
test('strict remount and close-button cleanup do not consume browser history',()=>{
  let pushes=0,pop;const history={state:null,pushState(value){this.state=value;pushes++;}},stack=createBackStack(history,{addEventListener(_,fn){pop=fn;}});
  const remove=stack.add(()=>assert.fail('stale callback'));remove();const removeAgain=stack.add(()=>{});removeAgain();stack.start();
  assert.equal(pushes,1);pop();assert.equal(pushes,2);
});
