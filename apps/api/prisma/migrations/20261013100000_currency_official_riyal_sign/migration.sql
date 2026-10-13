-- The riyal's symbol is the central bank's official sign, U+20C1 (owner's ruling on the 289 report).
-- Riyal rows still holding the old default abbreviation (U+0631 . U+0633) take the official sign.
-- A symbol the merchant typed (anything else) is left as it is, and other currencies are not touched.
--
-- currencies is under FORCE row level security and migrations run as the table owner, so FORCE is
-- lifted for the update to see every company's rows, then restored. The count is announced with
-- WARNING (NOTICE does not reach the logs), and zero is announced like any other count.

ALTER TABLE "currencies" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_old     integer;
  n_updated integer := 0;
BEGIN
  SELECT count(*) INTO n_old FROM "currencies" WHERE "code" = 'SAR' AND "symbol" = U&'\0631.\0633';

  IF n_old > 0 THEN
    UPDATE "currencies"
       SET "symbol" = U&'\20C1', "updatedAt" = now()
     WHERE "code" = 'SAR'
       AND "symbol" = U&'\0631.\0633';
    GET DIAGNOSTICS n_updated = ROW_COUNT;
  END IF;

  RAISE WARNING 'Official riyal sign: % riyal rows held the old default abbreviation; % now hold U+20C1',
    n_old, n_updated;
END $$;

ALTER TABLE "currencies" FORCE ROW LEVEL SECURITY;
