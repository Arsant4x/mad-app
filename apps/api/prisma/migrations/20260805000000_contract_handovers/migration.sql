-- CreateEnum
CREATE TYPE "HandoverType" AS ENUM ('DELIVERY', 'RECEIPT');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('DRAFT', 'SIGNED');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('GOOD', 'FAIR', 'DAMAGED', 'MISSING');

-- CreateTable
CREATE TABLE "contract_handovers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "HandoverType" NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'DRAFT',
    "date" DATE NOT NULL,
    "electricityMeter" TEXT,
    "waterMeter" TEXT,
    "notes" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "condition" "ItemCondition" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "contract_handovers" ADD CONSTRAINT "contract_handovers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_handovers" ADD CONSTRAINT "contract_handovers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "contract_handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security. This form decides disputes about someone's money, so the
-- database-level boundary matters as much as the application one.
ALTER TABLE "contract_handovers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_handovers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contract_handovers ON "contract_handovers"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "handover_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "handover_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_handover_items ON "handover_items"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
