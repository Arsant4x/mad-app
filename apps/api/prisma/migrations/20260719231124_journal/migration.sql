-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "balance" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Backfill: existing accounts start their running balance at whatever their
-- opening balance already was (matches what AccountsService.create will do
-- for every account created from now on).
--
-- "accounts" has FORCE ROW LEVEL SECURITY, and migrations run with no
-- app.company_id set — a plain UPDATE here would match zero rows under the
-- tenant_isolation_accounts policy and silently backfill nothing. Since
-- migrations already run as the table owner (app_user), the simplest fix is
-- to temporarily lift FORCE for this one statement, matching how the owner
-- would behave without it, then restore it immediately after.
ALTER TABLE "accounts" NO FORCE ROW LEVEL SECURITY;
UPDATE "accounts" SET "balance" = "openingBalance";
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "journalEntryId" TEXT;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "journalEntryId" TEXT;

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "memo" TEXT NOT NULL,
    "totalDebit" DECIMAL(18,2) NOT NULL,
    "totalCredit" DECIMAL(18,2) NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_companyId_no_key" ON "journal_entries"("companyId", "no");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security, same pattern as every other tenant table — see the
-- comment on "accounts" in the initial migration.
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_journal_entries ON "journal_entries"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_journal_lines ON "journal_lines"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
