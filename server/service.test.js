import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService } from './service.js';
import { scoreTrace, statistics, inPeriod } from './domain.js';
import { createHttpServer } from './http.js';

async function fixture(options = {}) {
  let now = Date.parse('2026-09-15T10:00:00Z');
  const service = createService({ clock: () => now, challengeFactory: () => ({ game: 'speed', duration: 10000, targets: [] }), ...options });
  const a = await service.register({ username: 'alice', password: 'correct-horse-123', timezone: 'Asia/Seoul' });
  const b = await service.register({ username: 'bob', password: 'correct-horse-456', timezone: 'Asia/Seoul' });
  const alice = service.authenticate(a.token), bob = service.authenticate(b.token);
  const post = service.createPost(alice, { coin: 'BTC', content: 'Original post' });
  return { service, alice, bob, post, token: a.token, advance: ms => { now += ms; } };
}
const battle = (f, user, extra = {}) => {
  const session = f.service.startBattle(user, { postId: f.post.id, side: 'support', requestKey: crypto.randomUUID(), ...extra });
  f.advance(10100);
  return f.service.finishBattle(user, { sessionId: session.id, trace: [{ t: 100, lane: 0 }, { t: 300, lane: 0 }] });
};

test('auth hashes passwords, preserves sessions, rejects incorrect credentials', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  assert.equal(f.service.me(f.alice).current_bp, 0);
  assert.equal(f.service.me(f.alice).password_hash, undefined);
  await assert.rejects(f.service.login({ username: 'alice', password: 'wrong' }), /로그인/);
  await assert.rejects(f.service.register({ username: 'ALICE', password: 'correct-horse', timezone: 'UTC' }), /이미/);
  f.service.logout(f.token);
  assert.equal(f.service.authenticate(f.token), null);
});

test('check-in is idempotent and awards both balances across local midnight', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  f.service.checkin(f.alice); f.service.checkin(f.alice);
  assert.equal(f.service.me(f.alice).current_bp, 10);
  f.advance(5 * 3600000);
  f.service.checkin(f.alice);
  assert.equal(f.service.me(f.alice).lifetime_bp, 20);
});

test('battle deducts once on start and server computes result exactly once', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  assert.throws(() => f.service.startBattle(f.alice, { postId: f.post.id, side: 'support', requestKey: 'one' }), /BP/);
  f.service.checkin(f.alice);
  const body = { postId: f.post.id, side: 'support', requestKey: 'one' };
  const first = f.service.startBattle(f.alice, body);
  assert.equal(first.id, f.service.startBattle(f.alice, body).id);
  assert.equal(f.service.me(f.alice).current_bp, 9);
  assert.throws(() => f.service.finishBattle(f.bob, { sessionId: first.id, trace: [] }), /본인/);
  f.advance(10100);
  const submitted = { sessionId: first.id, score: 999999, trace: [{ t: 100, lane: 0 }] };
  assert.equal(f.service.finishBattle(f.alice, submitted).score, 2);
  assert.equal(f.service.finishBattle(f.alice, submitted).score, 2);
  assert.equal(f.service.getPost(f.alice, f.post.id).support, 2);
  assert.equal(f.service.me(f.alice).lifetime_bp, 10);
});

test('impossible input is rejected and recorded, without a score update', async t => {
  const f = await fixture(); t.after(() => f.service.db.close()); f.service.checkin(f.alice);
  const session = f.service.startBattle(f.alice, { postId: f.post.id, side: 'oppose', requestKey: 'bad' }); f.advance(10100);
  assert.throws(() => f.service.finishBattle(f.alice, { sessionId: session.id, trace: [{ t: 100, lane: 0 }, { t: 101, lane: 0 }] }), /간격/);
  assert.equal(f.service.db.prepare('SELECT COUNT(*) n FROM abuse_flags').get().n, 1);
  assert.equal(f.service.getPost(f.alice, f.post.id).oppose, 0);
});

test('repost is profile-only; battle updates repost and original once', async t => {
  const f = await fixture(); t.after(() => f.service.db.close()); f.service.checkin(f.bob);
  f.service.repost(f.bob, f.post.id); f.service.repost(f.bob, f.post.id);
  const profile = f.service.profile(f.bob, 'bob');
  assert.equal(profile.reposts.length, 1);
  battle(f, f.bob, { repostId: profile.reposts[0].repostId });
  assert.equal(f.service.profile(f.bob, 'bob').reposts[0].support, 4);
  assert.equal(f.service.getPost(f.bob, f.post.id).support, 4);
  assert.equal(f.service.posts(f.bob).posts.length, 1);
});

test('today ranks battle activity on old posts, latest uses creation time', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  f.advance(2 * 86400000); f.service.checkin(f.alice); battle(f, f.alice);
  assert.equal(f.service.posts(f.alice, { period: '오늘' }).posts[0].support, 4);
  assert.equal(f.service.posts(f.alice, { period: '오늘', category: '최신' }).posts.length, 0);
  f.advance(86400000);
  assert.equal(f.service.posts(f.alice, { period: '오늘' }).posts.length, 0);
  assert.equal(f.service.posts(f.alice).posts[0].support, 4);
});

test('real following controls filtering and coin aggregation', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  assert.equal(f.service.posts(f.bob, { category: '팔로잉' }).posts.length, 0);
  f.service.follow(f.bob, 'alice', true);
  assert.equal(f.service.posts(f.bob, { category: '팔로잉' }).groups[0].coin, 'BTC');
  f.service.follow(f.bob, 'alice', false);
  assert.equal(f.service.posts(f.bob, { category: '팔로잉' }).posts.length, 0);
});

test('pins enforce limits, ownership, coordinates and charge only on creation', async t => {
  const f = await fixture(); t.after(() => f.service.db.close()); f.service.checkin(f.alice);
  const body = { title: 'Cafe', description: 'Coffee', coin: 'SL', lat: 37, lng: 127, category: '사업장' };
  const pin = f.service.savePin(f.alice, body);
  assert.equal(f.service.me(f.alice).current_bp, 9);
  assert.throws(() => f.service.savePin(f.alice, body), /제한/);
  assert.throws(() => f.service.savePin(f.bob, body, pin.id), /본인/);
  assert.throws(() => f.service.deletePin(f.bob, pin.id), /본인/);
  f.service.savePin(f.alice, { ...body, title: 'Updated' }, pin.id);
  assert.equal(f.service.me(f.alice).current_bp, 9);
  assert.throws(() => f.service.savePin(f.alice, { ...body, lat: 91 }, pin.id), /위도/);
  f.service.deletePin(f.alice, pin.id);
  assert.equal(f.service.pins(f.alice).length, 0);
});

test('comments are saved, deletes require owner and hide original plus repost', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  f.service.comment(f.bob, f.post.id, { content: 'hello' }); f.service.repost(f.bob, f.post.id);
  assert.equal(f.service.comments(f.alice, f.post.id)[0].author, 'bob');
  assert.throws(() => f.service.deletePost(f.bob, f.post.id), /본인/);
  f.service.deletePost(f.alice, f.post.id);
  assert.equal(f.service.posts(f.bob).posts.length, 0);
  assert.equal(f.service.profile(f.bob, 'bob').reposts.length, 0);
});

test('unconfigured ads cannot grant BP; verified callback grants once', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  await assert.rejects(f.service.startAd(f.alice), /준비/);
  const g = await fixture({ ads: { start: async () => ({}), verify: async value => JSON.parse(value) } }); t.after(() => g.service.db.close());
  const ad = await g.service.startAd(g.alice);
  const callback = JSON.stringify({ sessionId: ad.id, transactionId: 'provider-1' });
  await g.service.adCallback(callback, {}); await g.service.adCallback(callback, {});
  assert.equal(g.service.me(g.alice).current_bp, 20);
});

test('all games score deterministically and stats handle even medians', () => {
  const targets = [{ at: 1000, lane: 2 }];
  assert.equal(scoreTrace({ game: 'timing', targets, duration: 10000 }, [{ t: 1000, lane: 0 }], 10000), 20);
  assert.equal(scoreTrace({ game: 'reaction', targets, duration: 10000 }, [{ t: 1100, lane: 2 }], 10000), 20);
  assert.equal(scoreTrace({ game: 'reaction', targets, duration: 10000 }, [{ t: 1050, lane: 2 }], 10000), 0);
  assert.equal(statistics([1, 2, 3, 4]).median, 2.5);
  const now = Date.parse('2026-01-01T00:30:00Z');
  assert.equal(inPeriod(Date.parse('2025-12-31T23:30:00Z'), now, 'America/New_York', '오늘'), true);
  assert.equal(inPeriod(Date.parse('2025-12-31T23:30:00Z'), now, 'UTC', '오늘'), false);
});

test('database survives restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'battlefeed-'));
  let service;
  try {
    service = createService({ filename: join(dir, 'test.sqlite') });
    const account = await service.register({ username: 'persist', password: 'persistent-secret', timezone: 'UTC' });
    service.checkin(service.authenticate(account.token)); service.db.close();
    service = createService({ filename: join(dir, 'test.sqlite') });
    assert.equal(service.me(service.authenticate(account.token)).current_bp, 10);
  } finally { service?.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP protects mutations and emits secure session attributes', async t => {
  const f = await fixture(); const server = createHttpServer(f.service, { origin: 'http://localhost:5173' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); f.service.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const bad = await fetch(`${base}/checkin`, { method: 'POST' }); assert.equal(bad.status, 403);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BattleFeed-Request': '1' }, body: JSON.stringify({ username: 'alice', password: 'correct-horse-123' }) });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const rejected = await fetch(`${base}/posts`, { headers: { Origin: 'http://evil.invalid' } }); assert.equal(rejected.status, 403);
});

test('Silver and Gold pin thresholds are enforced on the server', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  const body = { title: 'Pin', description: 'Place', coin: 'BTC', category: '서비스', lat: 0, lng: 0 };
  f.service.db.prepare('UPDATE users SET lifetime_bp=1000,current_bp=20 WHERE id=?').run(f.alice.id);
  f.service.savePin(f.alice, body); f.service.savePin(f.alice, body);
  assert.throws(() => f.service.savePin(f.alice, body), /제한/);
  f.service.db.prepare('UPDATE users SET lifetime_bp=10000 WHERE id=?').run(f.alice.id);
  f.service.savePin(f.alice, body);
  assert.throws(() => f.service.savePin(f.alice, body), /제한/);
  assert.equal(f.service.me(f.alice).tier.name, 'Gold');
});

test('cancelled and expired battles cannot submit scores', async t => {
  const f = await fixture(); t.after(() => f.service.db.close()); f.service.checkin(f.alice);
  const start = () => f.service.startBattle(f.alice, { postId: f.post.id, side: 'support', requestKey: crypto.randomUUID() });
  const a = start(); f.service.cancelBattle(f.alice, { sessionId: a.id }); f.advance(10100);
  assert.throws(() => f.service.finishBattle(f.alice, { sessionId: a.id, trace: [] }), /종료/);
  const b = start(); f.advance(140000);
  assert.throws(() => f.service.finishBattle(f.alice, { sessionId: b.id, trace: [] }), /만료/);
  assert.equal(f.service.me(f.alice).current_bp, 8);
});

test('exposure, controversy, latest and coin group order use their own metric', async t => {
  const f = await fixture(); t.after(() => f.service.db.close()); f.service.checkin(f.alice);
  battle(f, f.alice);
  f.advance(1000);
  const newer = f.service.createPost(f.alice, { coin: 'ETH', content: 'Newest' });
  battle({ ...f, post: newer }, f.alice, { side: 'oppose' });
  assert.equal(f.service.posts(f.alice, { category: '노출' }).groups[0].coin, 'BTC');
  assert.equal(f.service.posts(f.alice, { category: '최신' }).groups[0].coin, 'ETH');
  assert.equal(f.service.posts(f.alice, { category: '논쟁' }).posts[0].id, newer.id);
  assert.equal(f.service.posts(f.alice, { category: '급상승' }).posts[0].id, f.post.id);
});

test('invalid images, links and missing authentication are rejected', async t => {
  const f = await fixture(); t.after(() => f.service.db.close());
  assert.throws(() => f.service.createPost(null, { coin: 'BTC', content: 'x' }), /로그인/);
  assert.throws(() => f.service.createPost(f.alice, { coin: 'BTC', content: 'x', image: 'data:image/svg+xml;base64,PHN2Zz4=' }), /사진/);
  assert.throws(() => f.service.createPost(f.alice, { coin: 'FAKE', content: 'x' }), /코인/);
  f.service.checkin(f.alice);
  assert.throws(() => f.service.savePin(f.alice, { title: 'x', description: 'x', coin: 'BTC', category: '판매', lat: 0, lng: 0, link: 'javascript:alert(1)' }), /HTTP/);
});
