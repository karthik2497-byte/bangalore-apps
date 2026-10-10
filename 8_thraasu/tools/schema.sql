-- D1 schema for Thraasu shop sync (functions/api/thraasu). Apply with:
--   npx wrangler d1 execute thraasu --remote --file 8_thraasu/tools/schema.sql
-- Times are epoch milliseconds. Every table but shops is keyed by shop code.
CREATE TABLE IF NOT EXISTS shops (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL,
  failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
  catalog_at INTEGER, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, shop TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS prices (shop TEXT NOT NULL, id TEXT NOT NULL, paise INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, id));
CREATE TABLE IF NOT EXISTS photos (shop TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, id));
CREATE TABLE IF NOT EXISTS catalog_parts (shop TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (shop, part));
