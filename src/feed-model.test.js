import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterFeed } from './feed-model.js';
const now = Date.parse('2026-09-15T12:00:00Z');
const posts = [
  { id: 'a', coin: 'BTC', authorId: 'alice', createdAt: now - 3000, support: 50, oppose: 0 },
  { id: 'b', coin: 'ETH', authorId: 'bob', createdAt: now - 2000, support: 40, oppose: 40 },
  { id: 'c', coin: 'BTC', authorId: 'bob', createdAt: now - 1000, support: 1, oppose: 0 },
];
test('switching user/coin views preserves filters and resulting membership', () => {
  for (const category of ['노출', '최신', '팔로잉', '급상승', '논쟁']) {
    const options = { category, period: '오늘' };
    const a = filterFeed(posts, { ...options, feed: '유저 피드' }, ['bob'], now);
    const b = filterFeed(posts, { ...options, feed: '코인 피드' }, ['bob'], now);
    assert.deepEqual(a, b);
    assert.deepEqual(a.posts.map(p => p.id).sort(), a.groups.flatMap(g => g.items.map(p => p.id)).sort());
  }
});
test('ranking metrics, following and Korean date boundaries', () => {
  const run = category => filterFeed(posts, { category, period: '전체' }, ['alice'], now);
  assert.equal(run('노출').posts[0].id, 'a');
  assert.equal(run('최신').posts[0].id, 'c');
  assert.equal(run('급상승').posts[0].id, 'b');
  assert.equal(run('논쟁').posts[0].id, 'b');
  assert.deepEqual(run('팔로잉').posts.map(p => p.id), ['a']);
  const prior = { ...posts[0], createdAt: Date.parse('2026-09-14T14:59:59Z') };
  assert.equal(filterFeed([prior], { category: '최신', period: '오늘' }, [], now).posts.length, 0);
});
