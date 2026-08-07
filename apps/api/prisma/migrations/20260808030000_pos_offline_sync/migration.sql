-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "clientSaleId" TEXT,
ADD COLUMN     "offlineRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_clientSaleId_key" ON "invoices"("companyId", "clientSaleId");

