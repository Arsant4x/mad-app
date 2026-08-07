-- AlterTable
ALTER TABLE "units" ADD COLUMN     "roomDetails" TEXT;

-- CreateTable
CREATE TABLE "claim_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_photos" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "itemId" TEXT,
    "fileKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "note" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_settlement_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claim_attachments_claimId_idx" ON "claim_attachments"("claimId");

-- CreateIndex
CREATE INDEX "handover_photos_handoverId_idx" ON "handover_photos"("handoverId");

-- CreateIndex
CREATE INDEX "contract_settlement_lines_contractId_idx" ON "contract_settlement_lines"("contractId");

-- AddForeignKey
ALTER TABLE "claim_attachments" ADD CONSTRAINT "claim_attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_attachments" ADD CONSTRAINT "claim_attachments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "contract_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "contract_handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "handover_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_settlement_lines" ADD CONSTRAINT "contract_settlement_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_settlement_lines" ADD CONSTRAINT "contract_settlement_lines_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security: tenant isolation (same block as every other tenant table).
ALTER TABLE "claim_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_claim_attachments ON "claim_attachments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
ALTER TABLE "handover_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "handover_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_handover_photos ON "handover_photos"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
ALTER TABLE "contract_settlement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_settlement_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contract_settlement_lines ON "contract_settlement_lines"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
