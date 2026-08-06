-- CreateEnum
CREATE TYPE "ClaimKind" AS ENUM ('MAINTENANCE', 'UTILITIES', 'LATE_FEE', 'DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'PAID', 'WAIVED');

-- CreateTable
CREATE TABLE "contract_claims" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "ClaimKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "issuedAt" DATE NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "settledAt" DATE,
    "waiveReason" TEXT,
    "journalEntryId" TEXT,
    "settlementEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_claims_journalEntryId_key" ON "contract_claims"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_claims_settlementEntryId_key" ON "contract_claims"("settlementEntryId");

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_settlementEntryId_fkey" FOREIGN KEY ("settlementEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level Security — a claim names a person and a sum they owe. Same
-- two-layer boundary as every other tenant table.
ALTER TABLE "contract_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contract_claims ON "contract_claims"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
