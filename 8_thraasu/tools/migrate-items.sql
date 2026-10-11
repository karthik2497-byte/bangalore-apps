-- One-off, 2026-10-11: items a shop adds on a phone. Run once against the live database:
--   npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-items.sql
ALTER TABLE shops ADD COLUMN items_at INTEGER;
CREATE TABLE IF NOT EXISTS items (shop TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (shop, id), UNIQUE (shop, key));
