import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createService } from './service.js';
import { createHttpServer } from './http.js';
const filename = resolve(process.env.DATABASE_PATH || 'data/battlefeed.sqlite');
mkdirSync(dirname(filename), { recursive: true });
const config = JSON.parse(process.env.BATTLEFEED_CONFIG || '{}');
const service = createService({ filename, config });
const server = createHttpServer(service, {
  origin: process.env.APP_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001',
  production: process.env.NODE_ENV === 'production',
  staticDir: process.env.SERVE_STATIC === 'false' ? null : resolve('dist'),
  allowBearer: process.env.ALLOW_BEARER_AUTH === 'true',
});
const port = Number(process.env.PORT || 3001);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`BattleFeed server: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { service.db.close(); process.exit(0); }));
