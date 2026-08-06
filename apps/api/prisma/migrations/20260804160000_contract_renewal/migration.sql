-- Contract renewal: a new contract that carries the tenancy forward.
--
-- UPCOMING is added but not used by any row here. Postgres 12+ allows ADD
-- VALUE inside a transaction only when the value is not referenced in that
-- same transaction, which is why no backfill is attempted alongside it.
--
-- renewedFromId is UNIQUE, so a lease can be renewed at most once — two
-- renewals of the same contract would fork the tenancy history and make
-- deposit carry-over ambiguous.

-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE 'UPCOMING';

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "renewedFromId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contracts_renewedFromId_key" ON "contracts"("renewedFromId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

