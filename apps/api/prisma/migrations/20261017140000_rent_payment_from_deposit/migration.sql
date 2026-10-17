-- Unpaid rent taken from a security deposit is recorded as a rent payment on the installments it pays, linked to the
-- deposit it came from, so the installment, the receivable and the aging agree.
--
-- No data is written: a new empty column for every existing payment.

-- AlterTable
ALTER TABLE "rent_payments" ADD COLUMN "depositId" TEXT;

-- CreateIndex
CREATE INDEX "rent_payments_depositId_idx" ON "rent_payments"("depositId");

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "contract_deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: the composite key beside the single one, with no delete action
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_companyId_depositId_fkey" FOREIGN KEY ("companyId", "depositId") REFERENCES "contract_deposits"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
