-- ق-١٢٥٢ — المفاتيحُ المركّبة (companyId, col) → Parent(companyId, id) بجانب المفرد القائم — الدفعةُ ٢: المستندات
-- (invoices · invoice_lines · quotes · purchases · purchase_lines · payments · supplier_payments · goods_receipts · goods_receipt_lines · pos_shifts · pos_offline_incidents · landed_cost_distributions).
-- بلا فعلٍ عند الحذف ولا التحديث (NO ACTION) — المفردُ القائم يحمل فعلَه؛ لا كتابةَ بيانات. الإحصاءُ قبلها على التطوير: صفرُ صفٍّ عابر في ٢٩ مفتاحاً.

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_companyId_id_key" ON "goods_receipt_lines"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_companyId_id_key" ON "goods_receipts"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_companyId_id_key" ON "invoice_lines"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_id_key" ON "invoices"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "landed_cost_distributions_companyId_id_key" ON "landed_cost_distributions"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_companyId_id_key" ON "payments"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_offline_incidents_companyId_id_key" ON "pos_offline_incidents"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_shifts_companyId_id_key" ON "pos_shifts"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_lines_companyId_id_key" ON "purchase_lines"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_companyId_id_key" ON "purchases"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_companyId_id_key" ON "quotes"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_companyId_id_key" ON "supplier_payments"("companyId", "id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_posShiftId_fkey" FOREIGN KEY ("companyId", "posShiftId") REFERENCES "pos_shifts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_offlineIncidentId_fkey" FOREIGN KEY ("companyId", "offlineIncidentId") REFERENCES "pos_offline_incidents"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_relatedInvoiceId_fkey" FOREIGN KEY ("companyId", "relatedInvoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_replacesInvoiceId_fkey" FOREIGN KEY ("companyId", "replacesInvoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_companyId_returnsLineId_fkey" FOREIGN KEY ("companyId", "returnsLineId") REFERENCES "invoice_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_relatedPurchaseId_fkey" FOREIGN KEY ("companyId", "relatedPurchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_companyId_returnsPurchaseLineId_fkey" FOREIGN KEY ("companyId", "returnsPurchaseLineId") REFERENCES "purchase_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_companyId_goodsReceiptId_fkey" FOREIGN KEY ("companyId", "goodsReceiptId") REFERENCES "goods_receipts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_companyId_purchaseLineId_fkey" FOREIGN KEY ("companyId", "purchaseLineId") REFERENCES "purchase_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_companyId_purchaseLineId_fkey" FOREIGN KEY ("companyId", "purchaseLineId") REFERENCES "purchase_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_companyId_distributionId_fkey" FOREIGN KEY ("companyId", "distributionId") REFERENCES "landed_cost_distributions"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_companyId_convertedInvoiceId_fkey" FOREIGN KEY ("companyId", "convertedInvoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_companyId_quoteId_fkey" FOREIGN KEY ("companyId", "quoteId") REFERENCES "quotes"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_reversesId_fkey" FOREIGN KEY ("companyId", "reversesId") REFERENCES "payments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_refundsInvoiceId_fkey" FOREIGN KEY ("companyId", "refundsInvoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_companyId_paymentId_fkey" FOREIGN KEY ("companyId", "paymentId") REFERENCES "payments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_companyId_reversesId_fkey" FOREIGN KEY ("companyId", "reversesId") REFERENCES "supplier_payments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_companyId_paymentId_fkey" FOREIGN KEY ("companyId", "paymentId") REFERENCES "supplier_payments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_invoiceLineId_fkey" FOREIGN KEY ("companyId", "invoiceLineId") REFERENCES "invoice_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_purchaseLineId_fkey" FOREIGN KEY ("companyId", "purchaseLineId") REFERENCES "purchase_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_goodsReceiptLineId_fkey" FOREIGN KEY ("companyId", "goodsReceiptLineId") REFERENCES "goods_receipt_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

