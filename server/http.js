import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fail } from './domain.js';

export function createHttpServer(service, { origin = 'http://localhost:5173', production = false, staticDir = null, allowBearer = false } = {}) {
  const allowedOrigins = new Set(origin.split(',').map(value => value.trim()));
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    const reply = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname.replace(/^\/api(?=\/)/, '');
      const method = req.method;
      if (req.headers.origin) {
        if (!allowedOrigins.has(req.headers.origin)) fail('허용되지 않은 요청 출처입니다.', 403);
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      if (method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-BattleFeed-Request,X-BattleFeed-Auth,Authorization' }); res.end(); return;
      }
      const mutating = !['GET', 'HEAD'].includes(method);
      if (mutating && path !== '/ads/callback') {
        if (req.headers['x-battlefeed-request'] !== '1') fail('요청 검증 실패', 403);
        if (!req.headers['content-type']?.startsWith('application/json')) fail('JSON 요청이 필요합니다.', 415);
      }
      const ip = req.socket.remoteAddress || 'unknown';
      // A proxy must apply its own per-client limits; forwarded addresses are not trusted here.
      service.rateLimit(`ip:${ip}`, 600);
      let raw = Buffer.alloc(0), body = {};
      if (mutating) {
        const parts = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 3000000) fail('파일 또는 요청이 너무 큽니다.', 413); parts.push(chunk); }
        raw = Buffer.concat(parts);
        if (path !== '/ads/callback') { try { body = JSON.parse(raw.toString() || '{}'); } catch { fail('올바른 JSON이 아닙니다.'); } if (!body || typeof body !== 'object' || Array.isArray(body)) fail('잘못된 요청입니다.'); }
      }
      const bearerMode = req.headers['x-battlefeed-auth'] === 'bearer';
      if (bearerMode && !allowBearer) fail('이 서버에서는 외부 앱 로그인을 지원하지 않습니다.', 403);
      const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
      const token = bearerMode ? bearer : req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('battlefeed_session='))?.slice('battlefeed_session='.length);
      const user = service.authenticate(token);
      const cookie = (value, maxAge) => res.setHeader('Set-Cookie', `battlefeed_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${production ? '; Secure' : ''}`);
      if (method === 'GET' && path === '/health') return reply({ ok: true });
      if (method === 'POST' && ['/auth/register', '/auth/login'].includes(path)) {
        service.rateLimit(`auth:${ip}`, 20, 900000);
        const result = await (path.endsWith('register') ? service.register(body) : service.login(body));
        if (bearerMode) return reply({ user: result.user, sessionToken: result.token });
        cookie(result.token, 604800); return reply(result.user);
      }
      if (method === 'POST' && path === '/auth/logout') { if (!bearerMode) cookie('', 0); return reply(service.logout(token)); }
      if (method === 'GET' && path === '/me') return reply(service.me(user));
      if (method === 'GET' && path === '/config') return reply(service.config());
      if (method === 'GET' && path === '/coins') return reply(service.coins());
      if (method === 'GET' && path === '/posts') return reply(service.posts(user, Object.fromEntries(url.searchParams)));
      if (method === 'POST' && path === '/posts') return reply(service.createPost(user, body), 201);
      let match = path.match(/^\/posts\/([^/]+)(?:\/(comments|reposts))?$/);
      if (match) {
        const [, id, action] = match;
        if (method === 'GET' && !action) return reply(service.getPost(user, id));
        if (method === 'DELETE' && !action) return reply(service.deletePost(user, id));
        if (method === 'GET' && action === 'comments') return reply(service.comments(user, id));
        if (method === 'POST' && action === 'comments') return reply(service.comment(user, id, body), 201);
        if (method === 'POST' && action === 'reposts') return reply(service.repost(user, id), 201);
      }
      match = path.match(/^\/coins\/([^/]+)\/posts$/);
      if (method === 'GET' && match) return reply(service.posts(user, { ...Object.fromEntries(url.searchParams), symbol: match[1] }));
      match = path.match(/^\/profiles\/([^/]+)(?:\/(follow))?$/);
      if (match) {
        const username = decodeURIComponent(match[1]);
        if (method === 'GET' && !match[2]) return reply(service.profile(user, username));
        if (['POST', 'DELETE'].includes(method) && match[2]) return reply(service.follow(user, username, method === 'POST'));
      }
      if (method === 'PATCH' && path === '/me') return reply(service.updateProfile(user, body));
      if (method === 'POST' && path === '/checkin') return reply(service.checkin(user));
      if (method === 'GET' && path === '/pins') return reply(service.pins(user));
      if (method === 'POST' && path === '/pins') return reply(service.savePin(user, body), 201);
      match = path.match(/^\/pins\/([^/]+)$/);
      if (method === 'PATCH' && match) return reply(service.savePin(user, body, match[1]));
      if (method === 'DELETE' && match) return reply(service.deletePin(user, match[1]));
      if (method === 'POST' && path === '/battle/start') return reply(service.startBattle(user, body));
      if (method === 'POST' && path === '/battle/finish') return reply(service.finishBattle(user, body));
      if (method === 'POST' && path === '/battle/cancel') return reply(service.cancelBattle(user, body));
      if (method === 'POST' && path === '/ads/start') return reply(await service.startAd(user));
      if (method === 'POST' && path === '/ads/callback') return reply(await service.adCallback(raw, req.headers));
      if (method === 'GET' && staticDir && !url.pathname.startsWith('/api/')) {
        const root = resolve(staticDir);
        let file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(root + sep)) fail('잘못된 경로입니다.', 403);
        let data;
        try { data = await readFile(file); } catch { if (extname(file)) fail('파일이 없습니다.', 404); file = resolve(root, 'index.html'); data = await readFile(file); }
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(data); return;
      }
      fail('경로를 찾을 수 없습니다.', 404);
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.message);
      reply({ error: error.status ? error.message : '서버 오류가 발생했습니다.' }, error.status || 500);
    }
  });
}
