-- One-off, 2026-10-17: items a shop removes from its price list. Run once against the live database,
-- before deploying the code that reads it:
--   npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-hidden.sql
CREATE TABLE IF NOT EXISTS hidden (shop TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, id));
