-- The employee base salary moves to a column the application encrypts. First of two steps.
--
-- employees.baseSalary was a plain DECIMAL that reached every copy and dump. This step adds baseSalaryCipher, a
-- `f1:<key id>:...` text bound to companyId|employees.baseSalary|employeeId, and lets the plain column be null so the
-- application stops writing it.
--
-- No migration can encrypt: the key lives outside the database (PII_ENCRYPTION_KEYS). Existing rows are encrypted by
-- scripts/backfill-employee-salary-encryption.ts, which clears the plain value in the same update; then the next
-- migration (20261017100000_employee_salary_plaintext_dropped) drops the plain column and refuses loudly while a single
-- plain value remains, so a column is never dropped before its data moved.
--
-- Deploy order (DEPLOY.md section 6, path c): on a database holding salaries the second migration fails and writes
-- nothing, so the script runs, then `migrate resolve --rolled-back 20261017100000_employee_salary_plaintext_dropped`,
-- then the deploy is repeated. On a database without salaries (CI and a clean development database) both pass together.
--
-- No data is written here (no UPDATE); the count of rows waiting for the script is announced with WARNING.

ALTER TABLE "employees" ADD COLUMN "baseSalaryCipher" TEXT;

-- No plain text in the new column, even through a path that skips the application.
ALTER TABLE "employees" ADD CONSTRAINT "employees_base_salary_ciphertext_only" CHECK (
  "baseSalaryCipher" IS NULL OR "baseSalaryCipher" LIKE 'f1:%'
);

-- Between the two steps a row holds the old plain value or the new encrypted one, never both. The plain column loses
-- its NOT NULL and its default so a row the application writes now carries no plain value at all.
ALTER TABLE "employees" ALTER COLUMN "baseSalary" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "baseSalary" DROP DEFAULT;
ALTER TABLE "employees" ADD CONSTRAINT "employees_base_salary_transition" CHECK (
  NOT ("baseSalary" IS NOT NULL AND "baseSalaryCipher" IS NOT NULL)
);

-- The table is under FORCE, which shows the application role nothing without a company context; FORCE is lifted for
-- the count and restored.
ALTER TABLE "employees" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_plain integer;
BEGIN
  SELECT count(*) INTO n_plain FROM "employees" WHERE "baseSalary" IS NOT NULL;
  RAISE WARNING 'employees: % rows hold a plain base salary; encrypt them with scripts/backfill-employee-salary-encryption.ts before the next migration drops the column (it refuses while one remains)',
    n_plain;
END $$;

ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
