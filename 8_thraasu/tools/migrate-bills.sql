-- One-off, 2026-10-24: the shop's bills on every phone. Run once against the live database,
-- before deploying the code that reads it:
--   npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-bills.sql
ALTER TABLE shops ADD COLUMN bills_at INTEGER;
CREATE TABLE IF NOT EXISTS bills (shop TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, started INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, id));
CREATE INDEX IF NOT EXISTS bills_at ON bills (shop, at);
