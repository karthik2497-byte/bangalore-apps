-- One-off, 2026-10-24: a shop account runs until paid_until (30 days from approval, then paid). Run once against
-- the live database, before deploying the code that reads it:
--   npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-paid.sql
ALTER TABLE shops ADD COLUMN paid_until INTEGER NOT NULL DEFAULT 0;
-- The shops already approved (NANMA, the pilot) run through 31 Mar 2027: until 1 Apr 2027 00:00 IST.
UPDATE shops SET paid_until = 1806517800000 WHERE status = 'active';
