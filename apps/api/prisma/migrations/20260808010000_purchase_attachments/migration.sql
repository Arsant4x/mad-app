-- CreateTable
CREATE TABLE "purchase_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_attachments_purchaseId_idx" ON "purchase_attachments"("purchaseId");

-- AddForeignKey
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security: tenant isolation (same block as every other tenant table).
ALTER TABLE "purchase_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_purchase_attachments ON "purchase_attachments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
