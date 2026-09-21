-- ق-١٢٥٢ — المفاتيحُ المركّبة (companyId, col) → Parent(companyId, id) بجانب المفرد القائم — الدفعةُ ٤: العقارات — تمامُ المئة والخمسين
-- (contracts · properties · units · contract_installments · contract_handovers · contract_claims · contract_deposits · handover_items · rent_payments · warranties).
-- بلا فعلٍ عند الحذف ولا التحديث (NO ACTION) — المفردُ القائم يحمل فعلَه؛ لا كتابةَ بيانات. الإحصاءُ قبلها على التطوير: صفرُ صفٍّ عابر في ٣٠ مفتاحاً.
-- المستثنى معلَن: company_user_branches (بلا companyId) وpermission_templates (صفوفٌ عامّة بلا منشأة).

-- CreateIndex
CREATE UNIQUE INDEX "contract_claims_companyId_id_key" ON "contract_claims"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_deposits_companyId_id_key" ON "contract_deposits"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_handovers_companyId_id_key" ON "contract_handovers"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_installments_companyId_id_key" ON "contract_installments"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_companyId_id_key" ON "contracts"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "handover_items_companyId_id_key" ON "handover_items"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_companyId_id_key" ON "properties"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rent_payments_companyId_id_key" ON "rent_payments"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "units_companyId_id_key" ON "units"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_companyId_id_key" ON "warranties"("companyId", "id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_propertyId_fkey" FOREIGN KEY ("companyId", "propertyId") REFERENCES "properties"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_companyId_propertyId_fkey" FOREIGN KEY ("companyId", "propertyId") REFERENCES "properties"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "units"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_companyId_propertyId_fkey" FOREIGN KEY ("companyId", "propertyId") REFERENCES "properties"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "units"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_reminders" ADD CONSTRAINT "rent_reminders_companyId_installmentId_fkey" FOREIGN KEY ("companyId", "installmentId") REFERENCES "contract_installments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_companyId_propertyId_fkey" FOREIGN KEY ("companyId", "propertyId") REFERENCES "properties"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "units"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_companyId_warrantyId_fkey" FOREIGN KEY ("companyId", "warrantyId") REFERENCES "warranties"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_companyId_propertyId_fkey" FOREIGN KEY ("companyId", "propertyId") REFERENCES "properties"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "units"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_handovers" ADD CONSTRAINT "contract_handovers_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_companyId_handoverId_fkey" FOREIGN KEY ("companyId", "handoverId") REFERENCES "contract_handovers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_key_money" ADD CONSTRAINT "contract_key_money_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_deposits" ADD CONSTRAINT "contract_deposits_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deposit_deductions" ADD CONSTRAINT "deposit_deductions_companyId_depositId_fkey" FOREIGN KEY ("companyId", "depositId") REFERENCES "contract_deposits"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "units"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_renewedFromId_fkey" FOREIGN KEY ("companyId", "renewedFromId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "claim_attachments" ADD CONSTRAINT "claim_attachments_companyId_claimId_fkey" FOREIGN KEY ("companyId", "claimId") REFERENCES "contract_claims"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_companyId_handoverId_fkey" FOREIGN KEY ("companyId", "handoverId") REFERENCES "contract_handovers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "handover_items"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_settlement_lines" ADD CONSTRAINT "contract_settlement_lines_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_installments" ADD CONSTRAINT "contract_installments_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_companyId_installmentId_fkey" FOREIGN KEY ("companyId", "installmentId") REFERENCES "contract_installments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_companyId_installmentId_fkey" FOREIGN KEY ("companyId", "installmentId") REFERENCES "contract_installments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_companyId_paymentId_fkey" FOREIGN KEY ("companyId", "paymentId") REFERENCES "rent_payments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

