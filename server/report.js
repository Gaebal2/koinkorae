import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { statistics } from './domain.js';
const db = new DatabaseSync(resolve(process.env.DATABASE_PATH || 'data/battlefeed.sqlite'), { readOnly: true });
const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const games = db.prepare('SELECT DISTINCT game_id FROM battle_events').all().map(({ game_id }) => ({
  game: game_id,
  ...statistics(db.prepare('SELECT score FROM battle_events WHERE game_id=?').all(game_id).map(row => row.score)),
}));
console.log(JSON.stringify({
  members: count('users'), posts: count('posts'), battles: count('battle_events'), checkins: count('checkins'),
  rewardedAds: db.prepare('SELECT COUNT(*) AS n FROM ad_sessions WHERE rewarded_at IS NOT NULL').get().n,
  bpEarned: db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM bp_ledger WHERE amount>0').get().n,
  bpSpent: db.prepare('SELECT COALESCE(-SUM(amount),0) AS n FROM bp_ledger WHERE amount<0').get().n,
  flags: db.prepare('SELECT reason,COUNT(*) AS count FROM abuse_flags GROUP BY reason').all(),
  games,
}, null, 2));
db.close();
