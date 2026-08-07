-- Opening balances become real posted journal entries (CLAUDE.md 3.8 debt):
-- `openingForAccountId` marks an entry as the قيد افتتاحي of one account
-- (counterpart: the 3900 opening-balances equity account), so opening
-- amounts are identifiable in the ledger — for delta entries on edit, for
-- reversal on account delete, and for the idempotent backfill script.

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN "openingForAccountId" TEXT;

-- CreateIndex
CREATE INDEX "journal_entries_openingForAccountId_idx" ON "journal_entries"("openingForAccountId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_openingForAccountId_fkey" FOREIGN KEY ("openingForAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
