-- ق-١٢٦١ ج — التسويةُ البنكية: banks.reconciledUntil (لا قيدَ على حساب البنك بتاريخٍ ≤ له) · bank_transactions.matchedLineId/matchedAt (مطابقةُ سطر الكشف بسطر الدفتر، واحدٌ لواحد)
-- والمركّبُ (companyId, matchedLineId) بجانب المفرد كسائر المفاتيح (ق-١٢٥٩). لا كتابةَ بيانات.

-- AlterTable
ALTER TABLE "bank_transactions" ADD COLUMN     "matchedAt" TIMESTAMP(3),
ADD COLUMN     "matchedLineId" TEXT;

-- AlterTable
ALTER TABLE "banks" ADD COLUMN     "reconciledUntil" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_matchedLineId_key" ON "bank_transactions"("matchedLineId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_companyId_id_key" ON "journal_lines"("companyId", "id");

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matchedLineId_fkey" FOREIGN KEY ("matchedLineId") REFERENCES "journal_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_companyId_matchedLineId_fkey" FOREIGN KEY ("companyId", "matchedLineId") REFERENCES "journal_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

