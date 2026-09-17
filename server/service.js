import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { defaults, categories, fail, text, timezone, localDate, inPeriod, tier, makeChallenge, scoreTrace, statistics } from './domain.js';
const scrypt = promisify(scryptCallback);
const hash = value => createHash('sha256').update(value).digest('hex');

export function createService({ filename = ':memory:', config = {}, clock = Date.now, challengeFactory = makeChallenge, ads = null } = {}) {
  const db = new DatabaseSync(filename);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const settings = { ...defaults, ...config };
  for (const [key, value] of Object.entries(settings)) if (!Number.isSafeInteger(value) || value < 1) throw Error(`Invalid config: ${key}`);
  if (settings.gold <= settings.silver) throw Error('Gold threshold must exceed Silver.');
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const coinData = JSON.parse(readFileSync(new URL('../src/cmc-top100.json', import.meta.url), 'utf8'));
  coinData.push({ symbol: 'SL', name: 'SASEUL' });
  for (const coin of coinData) run('INSERT OR IGNORE INTO coins VALUES (?,?,?,?)', coin.symbol, coin.symbol, coin.name, `coin-icons/${coin.symbol.toLowerCase()}.svg`);
  const userById = id => one('SELECT * FROM users WHERE id=?', id) || fail('회원이 없습니다.', 404);
  const need = user => user || fail('로그인이 필요합니다.', 401);
  const safeUser = user => {
    const { password_hash, ...safe } = user;
    return { ...safe, tier: tier(user.lifetime_bp, settings), checked: !!one('SELECT id FROM checkins WHERE user_id=? AND local_day=?', user.id, localDate(clock(), user.timezone)), adCount: one('SELECT COUNT(*) AS n FROM ad_sessions WHERE user_id=? AND local_day=? AND rewarded_at IS NOT NULL', user.id, localDate(clock(), user.timezone)).n };
  };
  const coin = symbol => one('SELECT * FROM coins WHERE symbol=?', text(symbol, '코인', 40)) || fail('지원하지 않는 코인입니다.');
  const post = id => one('SELECT * FROM posts WHERE id=? AND deleted_at IS NULL', text(id, '게시물 ID', 100)) || fail('게시물이 없습니다.', 404);
  const imageValue = value => {
    if (!value) return '';
    if (typeof value !== 'string' || value.length > 2800000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) fail('사진은 2MB 이하 PNG, JPEG, WebP 형식으로 첨부하세요.');
    return value;
  };
  const ledger = (id, amount, reason, reference) => {
    if (amount < 0 && userById(id).current_bp < -amount) fail('BP가 부족합니다.', 409);
    run('INSERT INTO bp_ledger VALUES (?,?,?,?,?,?)', randomUUID(), id, amount, reason, reference, clock());
    run('UPDATE users SET current_bp=current_bp+?, lifetime_bp=lifetime_bp+? WHERE id=?', amount, Math.max(0, amount), id);
  };
  const issueSession = id => {
    const token = randomBytes(32).toString('hex');
    run('DELETE FROM sessions WHERE expires_at<?', clock());
    run('INSERT INTO sessions VALUES (?,?,?)', hash(token), id, clock() + 7 * 86400000);
    return { token, user: safeUser(userById(id)) };
  };
  const flag = (user, session, reason, detail) => run('INSERT INTO abuse_flags VALUES (?,?,?,?,?,?)', randomUUID(), user, session, reason, JSON.stringify(detail), clock());
  function serializedPost(p, events, viewer, ranking = false) {
    const support = events.filter(e => e.battle_type === 'support').reduce((sum, e) => sum + e.score, 0);
    const oppose = events.filter(e => e.battle_type === 'oppose').reduce((sum, e) => sum + e.score, 0);
    const author = userById(p.user_id).username;
    return { id: p.id, author, userId: p.user_id, coin: p.coin_id, content: p.content, image: p.image, createdAt: p.created_at, support, oppose,
      rising: events.reduce((sum, e) => sum + (e.battle_type === 'support' ? e.score : -e.score) / (1 + (clock() - e.created_at) / 3600000), 0),
      comments: one('SELECT COUNT(*) AS n FROM comments WHERE post_id=?', p.id).n,
      reposts: one('SELECT COUNT(*) AS n FROM reposts WHERE post_id=?', p.id).n,
      reposted: viewer ? !!one('SELECT id FROM reposts WHERE user_id=? AND post_id=?', viewer.id, p.id) : false,
      owner: viewer?.id === p.user_id, ranking };
  }
  const scoreEvents = id => all('SELECT * FROM battle_events WHERE post_id=?', id);
  const api = {
    db, settings,
    authenticate(token) {
      if (!token) return null;
      const session = one('SELECT user_id FROM sessions WHERE token=? AND expires_at>?', hash(token), clock());
      return session ? userById(session.user_id) : null;
    },
    rateLimit(key, maximum = 120, window = 60000) {
      const row = one('SELECT * FROM request_limits WHERE key=?', key);
      if (!row || row.resets_at <= clock()) run('INSERT OR REPLACE INTO request_limits VALUES (?,?,?)', key, 1, clock() + window);
      else { if (row.hits >= maximum) fail('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', 429); run('UPDATE request_limits SET hits=hits+1 WHERE key=?', key); }
      run('DELETE FROM request_limits WHERE resets_at<?', clock() - 86400000);
    },
    async register(body) {
      const username = text(body.username, '사용자 이름', 24, 3);
      if (!/^[a-zA-Z0-9_]+$/.test(username)) fail('사용자 이름은 영문·숫자·밑줄만 가능합니다.');
      if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) fail('비밀번호는 10~128자로 입력하세요.');
      const zone = timezone(body.timezone);
      if (one('SELECT id FROM users WHERE username=?', username)) fail('이미 사용 중인 이름입니다.', 409);
      const salt = randomBytes(16).toString('hex');
      const key = await scrypt(body.password, salt, 64);
      return tx(() => {
        if (one('SELECT id FROM users WHERE username=?', username)) fail('이미 사용 중인 이름입니다.', 409);
        const id = randomUUID();
        run('INSERT INTO users (id,username,password_hash,timezone,created_at) VALUES (?,?,?,?,?)', id, username, `${salt}:${key.toString('hex')}`, zone, clock());
        return issueSession(id);
      });
    },
    async login(body) {
      const username = text(body.username, '사용자 이름', 24, 3);
      if (typeof body.password !== 'string' || body.password.length > 128) fail('로그인 정보를 확인하세요.', 401);
      const user = one('SELECT * FROM users WHERE username=?', username);
      const [salt, expected] = (user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
      const actual = await scrypt(body.password, salt, 64);
      if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !user) fail('로그인 정보를 확인하세요.', 401);
      return issueSession(user.id);
    },
    logout(token) { if (token) run('DELETE FROM sessions WHERE token=?', hash(token)); return { ok: true }; },
    me(user) { return user ? safeUser(userById(user.id)) : null; },
    config() { return { ...settings, adsEnabled: !!ads, pinCategories: categories }; },
    coins() { return all('SELECT * FROM coins'); },
    posts(user, { period = '전체', category = '노출', zone = user?.timezone || 'UTC', symbol } = {}) {
      timezone(zone);
      if (!['노출', '최신', '팔로잉', '급상승', '논쟁'].includes(category)) fail('잘못된 정렬입니다.');
      inPeriod(clock(), clock(), zone, period);
      const posts = all('SELECT * FROM posts WHERE deleted_at IS NULL');
      const follows = user ? new Set(all('SELECT target_id FROM follows WHERE user_id=?', user.id).map(row => row.target_id)) : new Set();
      const result = posts.filter(p => (!symbol || p.coin_id === symbol) && (category !== '팔로잉' || follows.has(p.user_id))).map(p => {
        const events = scoreEvents(p.id).filter(e => inPeriod(e.created_at, clock(), zone, period));
        const include = category === '최신' ? inPeriod(p.created_at, clock(), zone, period) : events.length > 0 || inPeriod(p.created_at, clock(), zone, period);
        return include ? serializedPost(p, events, user, true) : null;
      }).filter(Boolean);
      const metric = p => category === '최신' ? p.createdAt : category === '논쟁' ? p.support + p.oppose : category === '급상승' ? p.rising : p.support - p.oppose;
      result.sort((a, b) => metric(b) - metric(a) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
      const groups = Object.entries(Object.groupBy(result, p => p.coin)).map(([coin, items]) => ({ coin, items, score: category === '최신' ? Math.max(...items.map(metric)) : items.reduce((sum, p) => sum + metric(p), 0) })).sort((a, b) => b.score - a.score || a.coin.localeCompare(b.coin));
      groups.forEach((group, i) => { group.rank = i + 1; });
      return { posts: result, groups };
    },
    getPost(user, id) { return serializedPost(post(id), scoreEvents(id), user); },
    createPost(user, body) {
      need(user); const id = randomUUID();
      run('INSERT INTO posts (id,user_id,coin_id,content,image,created_at) VALUES (?,?,?,?,?,?)', id, user.id, coin(body.coin).id, text(body.content, '본문', 200), imageValue(body.image), clock());
      return api.getPost(user, id);
    },
    deletePost(user, id) { need(user); if (post(id).user_id !== user.id) fail('본인 글만 삭제할 수 있습니다.', 403); run('UPDATE posts SET deleted_at=? WHERE id=?', clock(), id); return { ok: true }; },
    comments(user, id) { post(id); return all('SELECT c.id,c.content,c.created_at,u.username AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at', id); },
    comment(user, id, body) { need(user); post(id); run('INSERT INTO comments VALUES (?,?,?,?,?)', randomUUID(), user.id, id, text(body.content, '댓글', 1000), clock()); return api.comments(user, id); },
    repost(user, id) { need(user); post(id); run('INSERT OR IGNORE INTO reposts VALUES (?,?,?,?)', randomUUID(), user.id, id, clock()); return { ok: true }; },
    removeRepost(user, id) { need(user); const row = one('SELECT * FROM reposts WHERE id=?', id) || fail('리포스트가 없습니다.', 404); if (row.user_id !== user.id) fail('본인 리포스트만 삭제할 수 있습니다.', 403); if (one('SELECT id FROM battle_sessions WHERE repost_id=?', id)) fail('배틀 기록이 있는 리포스트는 삭제할 수 없습니다.', 409); run('DELETE FROM reposts WHERE id=?', id); return { ok: true }; },
    follow(user, username, active) { need(user); const target = one('SELECT id FROM users WHERE username=?', username) || fail('회원이 없습니다.', 404); if (target.id === user.id) fail('자신을 팔로우할 수 없습니다.'); if (active) run('INSERT OR IGNORE INTO follows VALUES (?,?,?)', user.id, target.id, clock()); else run('DELETE FROM follows WHERE user_id=? AND target_id=?', user.id, target.id); return { ok: true }; },
    profile(viewer, username) {
      const user = one('SELECT * FROM users WHERE username=?', username) || fail('회원이 없습니다.', 404);
      const posts = all('SELECT * FROM posts WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC', user.id).map(p => serializedPost(p, scoreEvents(p.id), viewer));
      const reposts = all('SELECT r.* FROM reposts r JOIN posts p ON p.id=r.post_id WHERE r.user_id=? AND p.deleted_at IS NULL ORDER BY r.created_at DESC', user.id).map(r => ({ ...serializedPost(post(r.post_id), all('SELECT * FROM battle_events WHERE repost_id=?', r.id), viewer), repostId: r.id, repostedAt: r.created_at, repostAuthor: user.username }));
      const following = all('SELECT u.username FROM follows f JOIN users u ON u.id=f.target_id WHERE f.user_id=?', user.id).map(u => u.username);
      const followers = all('SELECT u.username FROM follows f JOIN users u ON u.id=f.user_id WHERE f.target_id=?', user.id).map(u => u.username);
      const events = all('SELECT score,battle_type,created_at FROM battle_events WHERE user_id=?', user.id);
      return { username: user.username, bio: user.bio, profileImage: user.profile_image, lifetime: user.lifetime_bp, tier: tier(user.lifetime_bp, settings), isMe: viewer?.id === user.id, following, followers, isFollowing: viewer ? followers.includes(viewer.username) : false, posts, reposts, pins: api.pins(viewer).filter(p => p.userId === user.id), comments: all('SELECT c.*,p.content AS postContent FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.user_id=? AND p.deleted_at IS NULL ORDER BY c.created_at DESC', user.id), activity: { battles: events.length, support: events.filter(e => e.battle_type === 'support').length, oppose: events.filter(e => e.battle_type === 'oppose').length, checkins: one('SELECT COUNT(*) AS n FROM checkins WHERE user_id=?', user.id).n } };
    },
    updateProfile(user, body) { need(user); run('UPDATE users SET bio=?,profile_image=? WHERE id=?', text(body.bio || '', '소개', 200, 0), imageValue(body.profileImage), user.id); return api.profile(user, user.username); },
    checkin(user) {
      need(user);
      return tx(() => {
        const day = localDate(clock(), userById(user.id).timezone);
        if (one('SELECT id FROM checkins WHERE user_id=? AND local_day=?', user.id, day)) return safeUser(userById(user.id));
        const latest = one('SELECT created_at FROM checkins WHERE user_id=? ORDER BY created_at DESC LIMIT 1', user.id);
        if (latest && clock() - latest.created_at < 1000) fail('잠시 후 다시 시도하세요.', 429);
        const id = randomUUID(); run('INSERT INTO checkins VALUES (?,?,?,?,?)', id, user.id, day, settings.checkinReward, clock());
        ledger(user.id, settings.checkinReward, 'checkin', id);
        return safeUser(userById(user.id));
      });
    },
    pins(user) { return all('SELECT p.*,u.username AS creator FROM map_pins p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC').map(p => ({ id: p.id, userId: p.user_id, creator: p.creator, owner: user?.id === p.user_id, coin: p.coin_id, title: p.title, description: p.description, lat: p.latitude, lng: p.longitude, category: p.category, image: p.image, link: p.link, tradeCoins: JSON.parse(p.trade_coins) })); },
    savePin(user, body, id) {
      need(user); const existing = id ? one('SELECT * FROM map_pins WHERE id=?', id) : null;
      if (id && !existing) fail('핀이 없습니다.', 404);
      if (existing && existing.user_id !== user.id) fail('본인 핀만 수정할 수 있습니다.', 403);
      const title = text(body.title, '제목', 100), description = text(body.description, '설명', 200), symbol = coin(body.coin).id;
      if (!categories.includes(body.category)) fail('핀 종류를 선택하세요.');
      if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng) || Math.abs(body.lat) > 90 || Math.abs(body.lng) > 180) fail('유효한 위도·경도가 필요합니다.');
      const image = imageValue(body.image), link = body.link ? text(body.link, '링크', 2048) : '';
      if (link) { let url; try { url = new URL(link); } catch { fail('올바른 링크를 입력하세요.'); } if (!['https:', 'http:'].includes(url.protocol)) fail('HTTP/HTTPS 링크만 허용됩니다.'); }
      if (body.tradeCoins && (!Array.isArray(body.tradeCoins) || body.tradeCoins.length > 20)) fail('거래 코인 목록이 올바르지 않습니다.');
      const trades = JSON.stringify((body.tradeCoins || []).map(c => coin(c).symbol));
      return tx(() => {
        if (existing) run('UPDATE map_pins SET coin_id=?,title=?,description=?,latitude=?,longitude=?,category=?,image=?,link=?,trade_coins=?,updated_at=? WHERE id=?', symbol, title, description, body.lat, body.lng, body.category, image, link, trades, clock(), id);
        else {
          const freshUser = userById(user.id);
          if (one('SELECT COUNT(*) AS n FROM map_pins WHERE user_id=?', user.id).n >= tier(freshUser.lifetime_bp, settings).limit) fail('현재 등급의 핀 개수 제한에 도달했습니다.', 409);
          id = randomUUID(); ledger(user.id, -settings.pinCost, 'pin', id);
          run('INSERT INTO map_pins VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, user.id, symbol, title, description, body.lat, body.lng, body.category, image, link, trades, clock(), clock());
        }
        return api.pins(user).find(p => p.id === id);
      });
    },
    deletePin(user, id) { need(user); const pin = one('SELECT * FROM map_pins WHERE id=?', id) || fail('핀이 없습니다.', 404); if (pin.user_id !== user.id) fail('본인 핀만 삭제할 수 있습니다.', 403); run('DELETE FROM map_pins WHERE id=?', id); return { ok: true }; },
    startBattle(user, body) {
      need(user); const key = text(body.requestKey, '요청 ID', 100);
      return tx(() => {
        const existing = one('SELECT * FROM battle_sessions WHERE user_id=? AND request_key=?', user.id, key);
        if (existing) return api.battleView(existing);
        const original = post(body.postId);
        if (!['support', 'oppose'].includes(body.side)) fail('지지 또는 반대를 선택하세요.');
        const repostId = body.repostId ? text(body.repostId, '리포스트 ID', 100) : null;
        if (repostId && !one('SELECT id FROM reposts WHERE id=? AND post_id=?', repostId, original.id)) fail('리포스트가 없습니다.', 404);
        if (one('SELECT id FROM battle_sessions WHERE user_id=? AND finished_at IS NULL AND expires_at>?', user.id, clock())) fail('진행 중인 게임을 마치거나 만료 후 시도하세요.', 409);
        const id = randomUUID(), challenge = challengeFactory(settings), now = clock();
        ledger(user.id, -settings.battleCost, 'battle', id);
        run('INSERT INTO battle_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, user.id, original.id, repostId, challenge.game, body.side, JSON.stringify(challenge), now, now + challenge.duration + 120000, null, key);
        return api.battleView(one('SELECT * FROM battle_sessions WHERE id=?', id));
      });
    },
    battleView(row) { return { id: row.id, side: row.battle_type, challenge: JSON.parse(row.challenge), finished: !!row.finished_at, expiresAt: row.expires_at }; },
    cancelBattle(user, body) {
      need(user);
      const session = one('SELECT * FROM battle_sessions WHERE id=?', text(body.sessionId, '게임 ID', 100)) || fail('게임이 없습니다.', 404);
      if (session.user_id !== user.id) fail('본인의 게임만 종료할 수 있습니다.', 403);
      run('UPDATE battle_sessions SET finished_at=COALESCE(finished_at,?) WHERE id=?', clock(), session.id);
      return { ok: true };
    },
    finishBattle(user, body) {
      need(user);
      const session = one('SELECT * FROM battle_sessions WHERE id=?', text(body.sessionId, '게임 ID', 100)) || fail('게임이 없습니다.', 404);
      if (session.user_id !== user.id) fail('본인의 게임만 제출할 수 있습니다.', 403);
      const existing = one('SELECT score FROM battle_events WHERE session_id=?', session.id);
      if (existing) return { score: existing.score, user: safeUser(userById(user.id)) };
      if (session.finished_at || clock() > session.expires_at) fail('종료되거나 만료된 게임입니다.', 409);
      let score;
      try { score = scoreTrace(JSON.parse(session.challenge), body.trace, clock() - session.created_at); }
      catch (error) { flag(user.id, session.id, 'invalid-input', { message: error.message }); run('UPDATE battle_sessions SET finished_at=? WHERE id=?', clock(), session.id); throw error; }
      return tx(() => {
        run('INSERT INTO battle_events VALUES (?,?,?,?,?,?,?,?,?,?)', randomUUID(), session.id, user.id, session.post_id, session.repost_id, session.game_id, session.battle_type, score, JSON.stringify(body.trace), clock());
        run('UPDATE battle_sessions SET finished_at=? WHERE id=?', clock(), session.id);
        const recent = all('SELECT score,input_trace,created_at FROM battle_events WHERE user_id=? AND game_id=? ORDER BY created_at DESC LIMIT 100', user.id, session.game_id);
        const stats = statistics(recent.slice(1).map(e => e.score));
        if (stats.count >= 10 && score > stats.mean + 4 * Math.sqrt(stats.variance)) flag(user.id, session.id, 'score-outlier', stats);
        if (recent.length >= 10 && recent.slice(0, 10).every(e => e.score === score)) flag(user.id, session.id, 'identical-scores', { score });
        if (body.trace.length && recent.slice(1).some(e => e.input_trace === JSON.stringify(body.trace))) flag(user.id, session.id, 'repeated-input', {});
        const dayEvents = all('SELECT created_at FROM battle_events WHERE user_id=? AND created_at>?', user.id, clock() - 86400000);
        const hours = new Set(dayEvents.map(e => Math.floor(e.created_at / 3600000)));
        if (hours.size >= 24) flag(user.id, session.id, 'continuous-activity', { activeHours: hours.size });
        return { score, user: safeUser(userById(user.id)) };
      });
    },
    async startAd(user) {
      need(user); if (!ads) fail('광고 보상은 준비 중입니다.', 503);
      const day = localDate(clock(), user.timezone);
      if (one('SELECT COUNT(*) AS n FROM ad_sessions WHERE user_id=? AND local_day=? AND rewarded_at IS NOT NULL', user.id, day).n >= settings.adDailyLimit) fail('오늘의 광고 보상을 모두 받았습니다.', 409);
      const id = randomUUID(); run('INSERT INTO ad_sessions (id,user_id,local_day,created_at) VALUES (?,?,?,?)', id, user.id, day, clock());
      return { id, ...(await ads.start({ id, userId: user.id })) };
    },
    async adCallback(raw, headers) {
      if (!ads) fail('광고가 연결되지 않았습니다.', 503);
      const verified = await ads.verify(raw, headers);
      if (!verified?.sessionId || !verified.transactionId) fail('광고 검증 실패', 403);
      return tx(() => {
        const session = one('SELECT * FROM ad_sessions WHERE id=?', verified.sessionId) || fail('광고 세션이 없습니다.', 404);
        if (session.rewarded_at) return { ok: true };
        if (clock() - session.created_at > 3600000 || one('SELECT id FROM ad_sessions WHERE provider_transaction=?', verified.transactionId)) fail('만료되거나 중복된 광고입니다.', 409);
        if (one('SELECT COUNT(*) AS n FROM ad_sessions WHERE user_id=? AND local_day=? AND rewarded_at IS NOT NULL', session.user_id, session.local_day).n >= settings.adDailyLimit) fail('일일 광고 보상 한도입니다.', 409);
        ledger(session.user_id, settings.adReward, 'ad', session.id);
        run('UPDATE ad_sessions SET rewarded_at=?,provider_transaction=? WHERE id=?', clock(), verified.transactionId, session.id);
        return { ok: true };
      });
    },
  };
  return api;
}
