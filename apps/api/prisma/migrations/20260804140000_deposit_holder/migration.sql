-- Who is holding the deposit — the company, or the Ejar platform.
--
-- This is an accounting distinction, not a label: a deposit blocked on Ejar
-- never reaches the company's till, so it must not debit cash or raise a
-- liability. Only what Ejar later releases to the company gets posted.
--
-- Default COMPANY, and every existing row keeps it: the deposits recorded
-- before this column existed were all entered as cash received, which is
-- exactly what COMPANY means.
CREATE TYPE "DepositHolder" AS ENUM ('COMPANY', 'EJAR');

ALTER TABLE "contract_deposits"
  ADD COLUMN "holder" "DepositHolder" NOT NULL DEFAULT 'COMPANY';
