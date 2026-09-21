-- ق-١٢٥٢ — المفاتيحُ المركّبة (companyId, col) → Parent(companyId, id) بجانب المفرد القائم — الدفعةُ ٣: الأستاذُ والمخزون
-- (journal_entries · stock_movements · inventory_layers · stock_batches · inventory_consumptions · inventory_write_offs · stock_openings) — ومنها علاقتان ذاتيّتان (reversalOfId).
-- بلا فعلٍ عند الحذف ولا التحديث (NO ACTION) — المفردُ القائم يحمل فعلَه؛ لا كتابةَ بيانات. الإحصاءُ قبلها على التطوير: صفرُ صفٍّ عابر في ٣٥ مفتاحاً.

-- CreateIndex
CREATE UNIQUE INDEX "inventory_consumptions_companyId_id_key" ON "inventory_consumptions"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_layers_companyId_id_key" ON "inventory_layers"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_write_offs_companyId_id_key" ON "inventory_write_offs"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_companyId_id_key" ON "journal_entries"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_companyId_id_key" ON "stock_batches"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_companyId_id_key" ON "stock_movements"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_openings_companyId_id_key" ON "stock_openings"("companyId", "id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_reversalJournalEntryId_fkey" FOREIGN KEY ("companyId", "reversalJournalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_companyId_voidJournalEntryId_fkey" FOREIGN KEY ("companyId", "voidJournalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_companyId_layerId_fkey" FOREIGN KEY ("companyId", "layerId") REFERENCES "inventory_layers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_openings" ADD CONSTRAINT "stock_openings_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_companyId_openingId_fkey" FOREIGN KEY ("companyId", "openingId") REFERENCES "stock_openings"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_companyId_movementId_fkey" FOREIGN KEY ("companyId", "movementId") REFERENCES "stock_movements"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_companyId_layerId_fkey" FOREIGN KEY ("companyId", "layerId") REFERENCES "inventory_layers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_companyId_voidMovementId_fkey" FOREIGN KEY ("companyId", "voidMovementId") REFERENCES "stock_movements"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_companyId_voidJournalEntryId_fkey" FOREIGN KEY ("companyId", "voidJournalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_reversalOfId_fkey" FOREIGN KEY ("companyId", "reversalOfId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_key_money" ADD CONSTRAINT "contract_key_money_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_companyId_settlementEntryId_fkey" FOREIGN KEY ("companyId", "settlementEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_deposits" ADD CONSTRAINT "contract_deposits_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_deposits" ADD CONSTRAINT "contract_deposits_companyId_settlementEntryId_fkey" FOREIGN KEY ("companyId", "settlementEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_settlementEntryId_fkey" FOREIGN KEY ("companyId", "settlementEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_reversalOfId_fkey" FOREIGN KEY ("companyId", "reversalOfId") REFERENCES "stock_movements"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_companyId_sourceMovementId_fkey" FOREIGN KEY ("companyId", "sourceMovementId") REFERENCES "stock_movements"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_companyId_batchId_fkey" FOREIGN KEY ("companyId", "batchId") REFERENCES "stock_batches"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_companyId_layerId_fkey" FOREIGN KEY ("companyId", "layerId") REFERENCES "inventory_layers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_companyId_movementId_fkey" FOREIGN KEY ("companyId", "movementId") REFERENCES "stock_movements"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_companyId_settlesId_fkey" FOREIGN KEY ("companyId", "settlesId") REFERENCES "inventory_consumptions"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_companyId_movementId_fkey" FOREIGN KEY ("companyId", "movementId") REFERENCES "stock_movements"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_write_off_attachments" ADD CONSTRAINT "inventory_write_off_attachments_companyId_writeOffId_fkey" FOREIGN KEY ("companyId", "writeOffId") REFERENCES "inventory_write_offs"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

