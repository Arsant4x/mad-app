-- Early-termination settlement on a cancelled lease.
--
-- Nullable with no backfill: contracts cancelled before this existed were
-- settled outside the system (or not at all), and inventing a figure for them
-- would post compensation income the landlord never agreed.

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "settlementAmount" DECIMAL(18,2),
ADD COLUMN     "settlementEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contracts_settlementEntryId_key" ON "contracts"("settlementEntryId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_settlementEntryId_fkey" FOREIGN KEY ("settlementEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

