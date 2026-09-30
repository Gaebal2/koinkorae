import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterFeed, recentActivityScore } from './feed-model.js';
import {feedOptions,periodStart} from './feed-period.js';
const now = Date.parse('2026-09-15T12:00:00Z');
const posts = [
  { id: 'a', coin: 'BTC', authorId: 'alice', createdAt: now - 3000, support: 50, oppose: 0 },
  { id: 'b', coin: 'ETH', authorId: 'bob', createdAt: now - 2000, support: 40, oppose: 40, recentActivity:[{createdAt:now-1000,amount:2}] },
  { id: 'c', coin: 'BTC', authorId: 'bob', createdAt: now - 1000, support: 1, oppose: 0 },
];
test('switching user/coin views preserves filters and resulting membership', () => {
  for (const category of ['지지', '최신', '팔로잉', '급상승', '논쟁']) {
    const options = { category, period: '오늘' };
    const a = filterFeed(posts, { ...options, feed: '유저 피드' }, ['bob'], now);
    const b = filterFeed(posts, { ...options, feed: '코인 피드' }, ['bob'], now);
    assert.deepEqual(a, b);
    assert.deepEqual(a.posts.map(p => p.id).sort(), a.groups.flatMap(g => g.items.map(p => p.id)).sort());
  }
});

test('controversy uses absolute totals; trending uses only recent changes with decay', () => {
  const rows=[{...posts[0],support:1000,oppose:-20},{...posts[1],support:2,oppose:1}];
  assert.equal(filterFeed(rows,{category:'논쟁',period:'전체'},[],now).posts[0].id,'a');
  assert.equal(filterFeed(rows,{category:'급상승',period:'전체'},[],now).posts[0].id,'b');
  assert.equal(recentActivityScore([{createdAt:now-86400000,amount:10000},{createdAt:now+1,amount:10000}],now,periodStart('오늘',now)),0);
  assert.ok(recentActivityScore([{createdAt:now-86400000,amount:10000}],now)>0);
  assert.ok(recentActivityScore([{createdAt:now,amount:2}],now)>recentActivityScore([{createdAt:now-43200000,amount:2}],now));
});

test('trending periods use KST calendar activity boundaries and include older posts',()=>{
  const time=Date.parse('2026-09-15T12:00:00Z');
  for(const [period,start] of [['오늘','2026-09-14T15:00:00Z'],['이번 달','2026-08-31T15:00:00Z'],['올해','2025-12-31T15:00:00Z']]){
    const expected=Date.parse(start), options=feedOptions({feed:'코인 피드',category:'급상승',period},time);
    assert.equal(options.activitySince,expected);assert.equal(options.since,undefined);
    assert.equal(feedOptions({category:'최신',period},time).since,expected);
    const activity=[{createdAt:expected-1,amount:1000},{createdAt:expected,amount:1}];
    assert.equal(recentActivityScore(activity,time,expected),recentActivityScore(activity.slice(1),time,expected));
  }
  assert.equal(feedOptions({category:'급상승',period:'전체'},time).activitySince,0);
  const old={...posts[0],createdAt:time-86400000*400,recentActivity:[{createdAt:time,amount:5}]};
  assert.equal(filterFeed([old],{category:'급상승',period:'오늘'},[],time).posts[0].id,old.id);
  assert.equal(filterFeed([old],{category:'최신',period:'오늘'},[],time).posts.length,0);
});
test('ranking metrics, following and Korean date boundaries', () => {
  const run = category => filterFeed(posts, { category, period: '전체' }, ['alice'], now);
  assert.equal(run('노출').posts[0].id, 'a');
  assert.deepEqual(run('지지'), run('노출'));
  assert.equal(run('최신').posts[0].id, 'c');
  assert.equal(run('급상승').posts[0].id, 'b');
  assert.equal(run('논쟁').posts[0].id, 'b');
  assert.deepEqual(run('팔로잉').posts.map(p => p.id), ['a']);
  const prior = { ...posts[0], createdAt: Date.parse('2026-09-14T14:59:59Z') };
  assert.equal(filterFeed([prior], { category: '최신', period: '오늘' }, [], now).posts.length, 0);
});
