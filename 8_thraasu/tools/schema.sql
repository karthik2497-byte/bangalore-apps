-- D1 schema for Thraasu shop sync (functions/api/thraasu). Apply with:
--   npx wrangler d1 execute thraasu --remote --file 8_thraasu/tools/schema.sql
-- Times are epoch milliseconds. Every table but shops is keyed by shop code.
CREATE TABLE IF NOT EXISTS shops (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL,
  failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
  catalog_at INTEGER, created INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', mobile TEXT,  -- 'pending' from an app sign-up until approved; created = request time
  items_at INTEGER                                     -- last change to the shop's added items
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, shop TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS prices (shop TEXT NOT NULL, id TEXT NOT NULL, paise INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, id));
CREATE TABLE IF NOT EXISTS photos (shop TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, id));
CREATE TABLE IF NOT EXISTS catalog_parts (shop TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (shop, part));
-- Stock on hand in the unit it is billed in (g, ml or pieces), set by shop-admin's stock command
-- and lowered by bills. A product with no row is not counted.
CREATE TABLE IF NOT EXISTS stock (shop TEXT NOT NULL, id TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY (shop, id));
-- Each sold bill's items ({id: qty} JSON) under the phone's id for that bill. A bill sent again
-- replaces itself, so stock moves by the difference and a retry moves it by nothing.
CREATE TABLE IF NOT EXISTS sales (shop TEXT NOT NULL, bill TEXT NOT NULL, items TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, bill));
CREATE INDEX IF NOT EXISTS sales_at ON sales (shop, at);
-- Items a shop added on a phone, merged over its list by the app. key: the phone's nameKey of the
-- name, unique per shop so two phones adding the same name end with one item.
CREATE TABLE IF NOT EXISTS items (shop TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (shop, id), UNIQUE (shop, key));
