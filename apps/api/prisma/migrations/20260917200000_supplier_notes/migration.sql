-- CreateEnum
CREATE TYPE "PurchaseDocType" AS ENUM ('PURCHASE', 'SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE');

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "docType" "PurchaseDocType" NOT NULL DEFAULT 'PURCHASE',
ADD COLUMN     "relatedPurchaseId" TEXT,
ADD COLUMN     "supplierRef" TEXT;

-- AlterTable
ALTER TABLE "purchase_lines" ADD COLUMN     "goodsReturned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnsPurchaseLineId" TEXT;

-- CreateIndex
CREATE INDEX "purchases_relatedPurchaseId_idx" ON "purchases"("relatedPurchaseId");

-- CreateIndex
CREATE INDEX "purchase_lines_returnsPurchaseLineId_idx" ON "purchase_lines"("returnsPurchaseLineId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_relatedPurchaseId_fkey" FOREIGN KEY ("relatedPurchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_returnsPurchaseLineId_fkey" FOREIGN KEY ("returnsPurchaseLineId") REFERENCES "purchase_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

