PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, profile_image TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
 timezone TEXT NOT NULL, current_bp INTEGER NOT NULL DEFAULT 0 CHECK(current_bp >= 0),
 lifetime_bp INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_bp >= 0), created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS coins (id TEXT PRIMARY KEY, symbol TEXT UNIQUE NOT NULL, name TEXT NOT NULL, icon_url TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), coin_id TEXT NOT NULL REFERENCES coins(id), content TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, deleted_at INTEGER);
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES posts(id), content TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS follows (user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, PRIMARY KEY(user_id,target_id), CHECK(user_id <> target_id));
CREATE TABLE IF NOT EXISTS reposts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES posts(id), created_at INTEGER NOT NULL, UNIQUE(user_id, post_id));
CREATE TABLE IF NOT EXISTS map_pins (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), coin_id TEXT NOT NULL REFERENCES coins(id), title TEXT NOT NULL, description TEXT NOT NULL, latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180), category TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', trade_coins TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS battle_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES posts(id), repost_id TEXT REFERENCES reposts(id), game_id TEXT NOT NULL, battle_type TEXT NOT NULL CHECK(battle_type IN ('support','oppose')), challenge TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, finished_at INTEGER, request_key TEXT NOT NULL, UNIQUE(user_id,request_key));
CREATE TABLE IF NOT EXISTS battle_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES battle_sessions(id), user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES posts(id), repost_id TEXT REFERENCES reposts(id), game_id TEXT NOT NULL, battle_type TEXT NOT NULL, score INTEGER NOT NULL CHECK(score >= 0), input_trace TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS battle_post_time ON battle_events(post_id,created_at);
CREATE INDEX IF NOT EXISTS battle_user_time ON battle_events(user_id,created_at);
CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), local_day TEXT NOT NULL, reward_bp INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id,local_day));
CREATE TABLE IF NOT EXISTS bp_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL, reason TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS abuse_flags (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ad_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), local_day TEXT NOT NULL, created_at INTEGER NOT NULL, rewarded_at INTEGER, provider_transaction TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, resets_at INTEGER NOT NULL);
