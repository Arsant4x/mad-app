-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('RENT', 'FACILITY');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('HELD', 'SETTLED');

-- CreateEnum
CREATE TYPE "DeductionKind" AS ENUM ('UNPAID_RENT', 'DAMAGE', 'UTILITIES', 'CLEANING', 'OTHER');

-- CreateTable
CREATE TABLE "contract_deposits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "DepositType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "receivedAt" DATE NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'HELD',
    "settledAt" DATE,
    "refundAmount" DECIMAL(18,2),
    "note" TEXT,
    "journalEntryId" TEXT,
    "settlementEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_deductions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "kind" "DeductionKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_deposits_journalEntryId_key" ON "contract_deposits"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_deposits_settlementEntryId_key" ON "contract_deposits"("settlementEntryId");

-- AddForeignKey
ALTER TABLE "contract_deposits" ADD CONSTRAINT "contract_deposits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deposits" ADD CONSTRAINT "contract_deposits_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deposits" ADD CONSTRAINT "contract_deposits_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deposits" ADD CONSTRAINT "contract_deposits_settlementEntryId_fkey" FOREIGN KEY ("settlementEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_deductions" ADD CONSTRAINT "deposit_deductions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_deductions" ADD CONSTRAINT "deposit_deductions_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "contract_deposits"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security — the same two-layer boundary every tenant table gets.
-- A deposit is money owed back to a named person; one company reading or
-- settling another's would be both a data leak and a financial act.
ALTER TABLE "contract_deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_deposits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contract_deposits ON "contract_deposits"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "deposit_deductions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deposit_deductions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_deposit_deductions ON "deposit_deductions"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
