-- A Nafath approval opens one session on a form link. The pending transaction stays in "identityTxRef" until its
-- decision is read, and the transaction that opened the current session is kept in "sessionIdentityTxRef", which the
-- signature reads.

-- AlterTable
ALTER TABLE "form_signing_links" ADD COLUMN "sessionIdentityTxRef" TEXT;

-- Links whose current session was opened by Nafath record that transaction in the new column, and a transaction
-- already used to open it is spent. Both tables are under FORCE, which shows the migration role nothing without a
-- company context; FORCE is lifted for the backfill and restored.
ALTER TABLE "form_signing_links" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "form_instances" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_sessions integer;
  n_one_step integer;
  n_code_first integer;
BEGIN
  SELECT count(*) INTO n_sessions FROM "form_signing_links" WHERE "sessionMethod" = 'NAFATH';
  IF n_sessions = 0 THEN
    RETURN;
  END IF;

  -- Nafath alone: the session reference is the transaction that opened it. A different transaction on the link was
  -- started later and stays pending.
  UPDATE "form_signing_links" l
  SET "sessionIdentityTxRef" = l."sessionRef",
      "identityTxRef" = CASE WHEN l."identityTxRef" = l."sessionRef" THEN NULL ELSE l."identityTxRef" END
  FROM "form_instances" i
  WHERE i."companyId" = l."companyId"
    AND i."id" = l."instanceId"
    AND l."sessionMethod" = 'NAFATH'
    AND NOT (l."purpose" = 'SIGN' AND l."recipientRole" = 'SUBSTITUTE' AND i."nafathRequired");
  GET DIAGNOSTICS n_one_step = ROW_COUNT;

  -- A substitute on a Nafath form: the session reference is the code, so the link's transaction is the one on record,
  -- and it is spent.
  UPDATE "form_signing_links" l
  SET "sessionIdentityTxRef" = l."identityTxRef",
      "identityTxRef" = NULL
  FROM "form_instances" i
  WHERE i."companyId" = l."companyId"
    AND i."id" = l."instanceId"
    AND l."sessionMethod" = 'NAFATH'
    AND l."purpose" = 'SIGN'
    AND l."recipientRole" = 'SUBSTITUTE'
    AND i."nafathRequired";
  GET DIAGNOSTICS n_code_first = ROW_COUNT;

  RAISE WARNING 'form_signing_links: % Nafath sessions recorded their transaction (% by Nafath alone, % by code then Nafath)',
    n_sessions, n_one_step, n_code_first;
END $$;

ALTER TABLE "form_instances" FORCE ROW LEVEL SECURITY;
ALTER TABLE "form_signing_links" FORCE ROW LEVEL SECURITY;
