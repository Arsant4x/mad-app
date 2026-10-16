-- Second step: the plain employees.baseSalary column is dropped once the script has encrypted it.
--
-- A guard runs first and fails loudly, before anything is written, while one plain value remains: a column is not
-- dropped before its data moved, and a release that no longer knows the plain column does not start on a database that
-- still holds it. The way out is path c in DEPLOY.md section 6:
--   1) docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps api node dist/scripts/backfill-employee-salary-encryption.js
--   2) the same run with: prisma migrate resolve --rolled-back 20261017100000_employee_salary_plaintext_dropped
--   3) ./deploy.sh again.
--
-- The guard is one DO block, first in the file on purpose: test/employee-salary-migration.e2e-spec.ts runs it on a plain
-- row in a rolled back transaction and sees it refuse, then sees it pass once the backfill ran.
-- The table is under FORCE and migrations run as the application role, so FORCE is lifted for the count and restored;
-- the lock ALTER TABLE takes stays to the end of the transaction, so no plain row is written between count and drop.

DO $$
DECLARE
  n_plain integer;
BEGIN
  ALTER TABLE "employees" NO FORCE ROW LEVEL SECURITY;
  SELECT count(*) INTO n_plain FROM "employees" WHERE "baseSalary" IS NOT NULL;
  ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
  IF n_plain > 0 THEN
    RAISE EXCEPTION 'employees: % rows still hold a plain base salary; run scripts/backfill-employee-salary-encryption.ts, then migrate resolve --rolled-back 20261017100000_employee_salary_plaintext_dropped, then deploy again (DEPLOY.md section 6). A column is not dropped before its data moved',
      n_plain;
  END IF;
  RAISE WARNING 'employees: % rows hold a plain base salary; the plain column is dropped and salaries stay in baseSalaryCipher', n_plain;
END $$;

ALTER TABLE "employees" DROP CONSTRAINT "employees_base_salary_transition";
ALTER TABLE "employees" DROP COLUMN "baseSalary";
