-- CreateEnum
CREATE TYPE "KeyMoneyDirection" AS ENUM ('RECEIVED', 'PAID');

-- CreateTable
CREATE TABLE "contract_key_money" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "direction" "KeyMoneyDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_key_money_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_key_money_journalEntryId_key" ON "contract_key_money"("journalEntryId");

-- AddForeignKey
ALTER TABLE "contract_key_money" ADD CONSTRAINT "contract_key_money_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_key_money" ADD CONSTRAINT "contract_key_money_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_key_money" ADD CONSTRAINT "contract_key_money_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level Security — same two-layer boundary as every other tenant table.
ALTER TABLE "contract_key_money" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_key_money" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contract_key_money ON "contract_key_money"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
