-- One-off, 2026-10-10: app sign-up. Run once on the live database before deploying the sign-up
-- Function (ALTER is not re-runnable; schema.sql has these columns for a fresh database):
--   npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-signup.sql
ALTER TABLE shops ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE shops ADD COLUMN mobile TEXT;
CREATE INDEX IF NOT EXISTS sales_at ON sales (shop, at);
