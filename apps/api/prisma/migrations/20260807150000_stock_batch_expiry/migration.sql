-- Batch/lot + expiry on stock movements (perishables). Nullable/additive → no backfill, no RLS toggle.
ALTER TABLE "stock_movements" ADD COLUMN     "batchNo" TEXT,
ADD COLUMN     "expiryDate" DATE;

-- CreateIndex
CREATE INDEX "stock_movements_expiryDate_idx" ON "stock_movements"("expiryDate");
