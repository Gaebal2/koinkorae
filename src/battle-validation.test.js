import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, jump, step } from './battle-engine.js';
import { replayBattle, seededRandom, scoreResult, TICK } from '../functions/battle-validation.js';
import { filterFeed } from './feed-model.js';

test('server replay matches both games with the same input and seed', () => {
  for (const kind of ['runner','flappy']) {
    const game = newGame(kind), random = seededRandom(1234), inputs = [];
    let tick = 0;
    while (!game.ended) {
      if (tick % 42 === 0) { inputs.push(tick); jump(game); }
      step(game, TICK, random); tick++;
    }
    const result = replayBattle(kind, 1234, inputs, game.time * 1000);
    assert.equal(result.score, game.score);
    assert.equal(result.reason, game.reason);
    assert.equal(result.duration, game.time);
  }
});
test('malformed, future and post-game inputs cannot claim a score', () => {
  for (const inputs of [[-1], [1.5], [0,0], [3,2], [7201], [0,7200], null]) assert.throws(()=>replayBattle('runner', 1, inputs, 60000));
  assert.throws(()=>replayBattle('runner', 1, [], 0));
  assert.throws(()=>replayBattle('invalid', 1, [], 60000));
});
test('support adds and opposition subtracts from exposure and ranking', () => {
  assert.deepEqual(scoreResult('support', 30), { side:'support', score:30, delta:30 });
  assert.deepEqual(scoreResult('oppose', 40), { side:'oppose', score:40, delta:-40 });
  const posts = [{id:'a',coin:'PI',createdAt:Date.now(),support:30,oppose:40},{id:'b',coin:'BTC',createdAt:Date.now(),support:0,oppose:0}];
  assert.deepEqual(filterFeed(posts, {category:'노출',period:'전체'}).posts.map(p=>p.id), ['b','a']);
});
