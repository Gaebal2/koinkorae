import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Run with the Firestore emulator; never use production.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getApps, deleteApp } = require('firebase-admin/app');
const { startBattle, finishBattle } = await import('../functions/index.js');
let db;
before(() => { db = getFirestore(); });
after(async () => { await Promise.all(getApps().map(deleteApp)); });
const request = (data, uid = 'battle-test-user') => ({ data, auth: { uid } });
async function seedSession(id, side = 'support') {
  await db.doc('posts/battle-test-post').set({support:10,oppose:3});
  await db.doc('battleSessions/battle-test-user').set({id,postId:'battle-test-post',side,kind:'runner',seed:1234,startedAt:Timestamp.fromMillis(Date.now()-60000),status:'playing'});
}
test('callables require auth and valid sides, posts and request IDs', async () => {
  await assert.rejects(startBattle.run({data:{}}), {code:'unauthenticated'});
  await assert.rejects(finishBattle.run({data:{}}), {code:'unauthenticated'});
  await assert.rejects(startBattle.run(request({postId:'missing',side:'support',requestId:'a'})), {code:'not-found'});
  await assert.rejects(startBattle.run(request({postId:'p',side:'invalid',requestId:'a'})), {code:'invalid-argument'});
});
test('start retry keeps challenge and side; a new start invalidates abandoned game', async () => {
  await seedSession('old');
  const args=request({postId:'battle-test-post',side:'oppose',requestId:'start-1'});
  const first=await startBattle.run(args), second=await startBattle.run(args);
  assert.deepEqual(first,second); assert.equal(first.side,'oppose');
  await assert.rejects(finishBattle.run(request({sessionId:'old',inputs:[]})), {code:'failed-precondition'});
});
test('concurrent finish and network retry reflect one server-computed score only', async () => {
  await seedSession('finish-support');
  const args=request({sessionId:'finish-support',inputs:[0],score:999999,side:'oppose'});
  const [first,second]=await Promise.all([finishBattle.run(args),finishBattle.run(args)]);
  assert.deepEqual(first,second); assert.ok(first.score>0 && first.score<600); assert.equal(first.delta,first.score);
  const post=(await db.doc('posts/battle-test-post').get()).data();
  assert.equal(post.support,10+first.score); assert.equal(post.oppose,3);
});
test('opposition decreases exposure; invalid records, other users and deleted posts do not score', async () => {
  await seedSession('finish-oppose','oppose');
  await assert.rejects(finishBattle.run(request({sessionId:'finish-oppose',inputs:[-1]})), {code:'invalid-argument'});
  await assert.rejects(finishBattle.run(request({sessionId:'finish-oppose',inputs:[]},'another-user')), {code:'failed-precondition'});
  const result=await finishBattle.run(request({sessionId:'finish-oppose',inputs:[0]}));
  const post=(await db.doc('posts/battle-test-post').get()).data();
  assert.equal(result.delta,-result.score); assert.equal(post.support-post.oppose,7-result.score);
  await seedSession('deleted'); await db.doc('posts/battle-test-post').delete();
  await assert.rejects(finishBattle.run(request({sessionId:'deleted',inputs:[]})), {code:'not-found'});
});
