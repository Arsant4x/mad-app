rlsTables(clean)=84 fks(clean)=152 fromTables=60 toTables=44 compositeReadyTargets=0
rlsTables(dev)=78 fks(dev)=133
fks only in clean (dev behind)=19 goods_receipt_lines.goodsReceiptId->goods_receipts | goods_receipt_lines.purchaseLineId->purchase_lines | goods_receipts.branchId->branches | goods_receipts.journalEntryId->journal_entries | goods_receipts.purchaseId->purchases | goods_receipts.warehouseId->warehouses | landed_cost_distributions.journalEntryId->journal_entries | landed_cost_distributions.purchaseId->purchases | landed_cost_distributions.purchaseLineId->purchase_lines | landed_cost_distributions.voidJournalEntryId->journal_entries | landed_cost_lines.distributionId->landed_cost_distributions | landed_cost_lines.layerId->inventory_layers | stock_movements.goodsReceiptLineId->goods_receipt_lines | stock_opening_lines.layerId->inventory_layers | stock_opening_lines.movementId->stock_movements | stock_opening_lines.openingId->stock_openings | stock_opening_lines.voidJournalEntryId->journal_entries | stock_opening_lines.voidMovementId->stock_movements | stock_openings.journalEntryId->journal_entries
fks only in dev=0 
referencing rows on dev (sum over 60 from-tables, distinct)=114351

| الجدولُ المُشارُ إليه | صفوفه (dev) | عددُ المفاتيح إليه | من (جدول.عمود) |
|---|---|---|---|
| `journal_entries` | 12728 | 21 | `contract_claims.journalEntryId` · `contract_claims.settlementEntryId` · `contract_deposits.journalEntryId` · `contract_deposits.settlementEntryId` · `contract_key_money.journalEntryId` · `contracts.settlementEntryId` · `goods_receipts.journalEntryId` · `inventory_write_offs.journalEntryId` · `invoices.journalEntryId` · `invoices.reversalJournalEntryId` · `journal_lines.journalEntryId` · `landed_cost_distributions.journalEntryId` · `landed_cost_distributions.voidJournalEntryId` · `maintenance_requests.journalEntryId` · `payments.journalEntryId` · `purchases.journalEntryId` · `rent_accruals.journalEntryId` · `rent_payments.journalEntryId` · `stock_opening_lines.voidJournalEntryId` · `stock_openings.journalEntryId` · `supplier_payments.journalEntryId` |
| `branches` | 239 | 16 | `bank_transactions.branchId` · `banks.branchId` · `cash_drawers.branchId` · `company_user_branches.branchId` · `employees.branchId` · `goods_receipts.branchId` · `inventory_write_offs.branchId` · `invoices.branchId` · `journal_entries.branchId` · `journal_lines.branchId` · `payments.branchId` · `pos_shifts.branchId` · `purchases.branchId` · `quotes.branchId` · `stock_movements.branchId` · `supplier_payments.branchId` |
| `contracts` | 1974 | 10 | `contract_attachments.contractId` · `contract_claims.contractId` · `contract_deposits.contractId` · `contract_handovers.contractId` · `contract_installments.contractId` · `contract_key_money.contractId` · `contract_settlement_lines.contractId` · `contracts.renewedFromId` · `rent_accruals.contractId` · `rent_payments.contractId` |
| `products` | 808 | 7 | `inventory_layers.productId` · `inventory_write_offs.productId` · `invoice_lines.productId` · `purchase_lines.productId` · `quote_lines.productId` · `stock_batches.productId` · `stock_movements.productId` |
| `invoices` | 3004 | 7 | `invoice_lines.invoiceId` · `invoices.relatedInvoiceId` · `invoices.replacesInvoiceId` · `payment_allocations.invoiceId` · `payments.refundsInvoiceId` · `pos_payments.invoiceId` · `quotes.convertedInvoiceId` |
| `warehouses` | 578 | 6 | `branches.warehouseId` · `goods_receipts.warehouseId` · `inventory_layers.warehouseId` · `inventory_write_offs.warehouseId` · `stock_movements.toWarehouseId` · `stock_movements.warehouseId` |
| `purchases` | 338 | 6 | `goods_receipts.purchaseId` · `landed_cost_distributions.purchaseId` · `purchase_attachments.purchaseId` · `purchase_lines.purchaseId` · `purchases.relatedPurchaseId` · `supplier_payment_allocations.purchaseId` |
| `stock_movements` | 1315 | 6 | `inventory_consumptions.movementId` · `inventory_layers.sourceMovementId` · `inventory_write_offs.movementId` · `stock_movements.reversalOfId` · `stock_opening_lines.movementId` · `stock_opening_lines.voidMovementId` |
| `properties` | 2054 | 5 | `branches.propertyId` · `journal_lines.propertyId` · `maintenance_requests.propertyId` · `units.propertyId` · `warranties.propertyId` |
| `customers` | 2897 | 5 | `contracts.customerId` · `invoices.customerId` · `journal_lines.customerId` · `payments.customerId` · `quotes.customerId` |
| `units` | 2225 | 5 | `contracts.unitId` · `journal_lines.unitId` · `maintenance_requests.unitId` · `reservations.unitId` · `warranties.unitId` |
| `banks` | 376 | 4 | `bank_transactions.bankId` · `payments.bankId` · `rent_payments.bankId` · `supplier_payments.bankId` |
| `accounts` | 7179 | 4 | `banks.accountId` · `cash_drawers.accountId` · `journal_entries.openingForAccountId` · `journal_lines.accountId` |
| `purchase_lines` | 213 | 4 | `goods_receipt_lines.purchaseLineId` · `landed_cost_distributions.purchaseLineId` · `purchase_lines.returnsPurchaseLineId` · `stock_movements.purchaseLineId` |
| `suppliers` | 396 | 4 | `journal_lines.supplierId` · `purchases.supplierId` · `supplier_payments.supplierId` · `warranties.supplierId` |
| `company_users` | 86 | 3 | `company_user_branches.companyUserId` · `notifications.targetUserId` · `reminder_policies.escalateToUserId` |
| `inventory_layers` | 224 | 3 | `inventory_consumptions.layerId` · `landed_cost_lines.layerId` · `stock_opening_lines.layerId` |
| `contract_installments` | 33275 | 3 | `rent_accruals.installmentId` · `rent_payments.installmentId` · `rent_reminders.installmentId` |
| `employees` | 69 | 2 | `attendance_records.employeeId` · `leave_requests.employeeId` |
| `business_activities` | 469 | 2 | `branches.activityId` · `products.activityId` |
| `contract_handovers` | 99 | 2 | `handover_items.handoverId` · `handover_photos.handoverId` |
| `invoice_lines` | 3408 | 2 | `invoice_lines.returnsLineId` · `stock_movements.invoiceLineId` |
| `egs_units` | 143 | 2 | `invoices.egsUnitId` · `zatca_credentials.egsUnitId` |
| `payments` | 1860 | 2 | `payment_allocations.paymentId` · `payments.reversesId` |
| `supplier_payments` | 1 | 2 | `supplier_payment_allocations.paymentId` · `supplier_payments.reversesId` |
| `contract_claims` | 164 | 1 | `claim_attachments.claimId` |
| `permission_templates` | 236 | 1 | `company_users.permissionTemplateId` |
| `contract_deposits` | 275 | 1 | `deposit_deductions.depositId` |
| `fiscal_years` | 77 | 1 | `fiscal_periods.fiscalYearId` |
| `goods_receipts` | ? | 1 | `goods_receipt_lines.goodsReceiptId` |
| `handover_items` | 99 | 1 | `handover_photos.itemId` |
| `inventory_consumptions` | 569 | 1 | `inventory_consumptions.settlesId` |
| `stock_batches` | 6 | 1 | `inventory_layers.batchId` |
| `inventory_write_offs` | 139 | 1 | `inventory_write_off_attachments.writeOffId` |
| `pos_offline_incidents` | 31 | 1 | `invoices.offlineIncidentId` |
| `pos_shifts` | 599 | 1 | `invoices.posShiftId` |
| `landed_cost_distributions` | ? | 1 | `landed_cost_lines.distributionId` |
| `leave_types` | 37 | 1 | `leave_requests.leaveTypeId` |
| `warranties` | 0 | 1 | `maintenance_requests.warrantyId` |
| `cash_drawers` | 58 | 1 | `pos_shifts.drawerId` |
| `quotes` | 631 | 1 | `quote_lines.quoteId` |
| `rent_payments` | 828 | 1 | `rent_accruals.paymentId` |
| `goods_receipt_lines` | ? | 1 | `stock_movements.goodsReceiptLineId` |
| `stock_openings` | ? | 1 | `stock_opening_lines.openingId` |

| الجدولُ المُشير | صفوفه (dev) | مفاتيحُه إلى جداول معزولة |
|---|---|---|
| `contract_installments` | 33275 | `contractId`→`contracts` |
| `journal_lines` | 31128 | `accountId`→`accounts` · `branchId`→`branches` · `customerId`→`customers` · `journalEntryId`→`journal_entries` · `propertyId`→`properties` · `supplierId`→`suppliers` · `unitId`→`units` |
| `journal_entries` | 12728 | `branchId`→`branches` · `openingForAccountId`→`accounts` |
| `notifications` | 7647 | `targetUserId`→`company_users` |
| `invoice_lines` | 3408 | `invoiceId`→`invoices` · `productId`→`products` · `returnsLineId`→`invoice_lines` |
| `invoices` | 3004 | `branchId`→`branches` · `customerId`→`customers` · `egsUnitId`→`egs_units` · `journalEntryId`→`journal_entries` · `offlineIncidentId`→`pos_offline_incidents` · `posShiftId`→`pos_shifts` · `relatedInvoiceId`→`invoices` · `replacesInvoiceId`→`invoices` · `reversalJournalEntryId`→`journal_entries` |
| `rent_accruals` | 2670 | `contractId`→`contracts` · `installmentId`→`contract_installments` · `journalEntryId`→`journal_entries` · `paymentId`→`rent_payments` |
| `units` | 2225 | `propertyId`→`properties` |
| `contracts` | 1974 | `customerId`→`customers` · `renewedFromId`→`contracts` · `settlementEntryId`→`journal_entries` · `unitId`→`units` |
| `payments` | 1860 | `bankId`→`banks` · `branchId`→`branches` · `customerId`→`customers` · `journalEntryId`→`journal_entries` · `refundsInvoiceId`→`invoices` · `reversesId`→`payments` |
| `payment_allocations` | 1745 | `invoiceId`→`invoices` · `paymentId`→`payments` |
| `quote_lines` | 1591 | `productId`→`products` · `quoteId`→`quotes` |
| `stock_movements` | 1315 | `branchId`→`branches` · `goodsReceiptLineId`→`goods_receipt_lines` · `invoiceLineId`→`invoice_lines` · `productId`→`products` · `purchaseLineId`→`purchase_lines` · `reversalOfId`→`stock_movements` · `toWarehouseId`→`warehouses` · `warehouseId`→`warehouses` |
| `pos_payments` | 1246 | `invoiceId`→`invoices` |
| `fiscal_periods` | 914 | `fiscalYearId`→`fiscal_years` |
| `rent_payments` | 828 | `bankId`→`banks` · `contractId`→`contracts` · `installmentId`→`contract_installments` · `journalEntryId`→`journal_entries` |
| `products` | 808 | `activityId`→`business_activities` |
| `bank_transactions` | 731 | `bankId`→`banks` · `branchId`→`branches` |
| `quotes` | 631 | `branchId`→`branches` · `convertedInvoiceId`→`invoices` · `customerId`→`customers` |
| `pos_shifts` | 599 | `branchId`→`branches` · `drawerId`→`cash_drawers` |
| `inventory_consumptions` | 569 | `layerId`→`inventory_layers` · `movementId`→`stock_movements` · `settlesId`→`inventory_consumptions` |
| `banks` | 376 | `accountId`→`accounts` · `branchId`→`branches` |
| `purchases` | 338 | `branchId`→`branches` · `journalEntryId`→`journal_entries` · `relatedPurchaseId`→`purchases` · `supplierId`→`suppliers` |
| `contract_deposits` | 275 | `contractId`→`contracts` · `journalEntryId`→`journal_entries` · `settlementEntryId`→`journal_entries` |
| `branches` | 239 | `activityId`→`business_activities` · `propertyId`→`properties` · `warehouseId`→`warehouses` |
| `maintenance_requests` | 226 | `journalEntryId`→`journal_entries` · `propertyId`→`properties` · `unitId`→`units` · `warrantyId`→`warranties` |
| `inventory_layers` | 224 | `batchId`→`stock_batches` · `productId`→`products` · `sourceMovementId`→`stock_movements` · `warehouseId`→`warehouses` |
| `purchase_lines` | 213 | `productId`→`products` · `purchaseId`→`purchases` · `returnsPurchaseLineId`→`purchase_lines` |
| `reservations` | 190 | `unitId`→`units` |
| `deposit_deductions` | 172 | `depositId`→`contract_deposits` |
| `contract_claims` | 164 | `contractId`→`contracts` · `journalEntryId`→`journal_entries` · `settlementEntryId`→`journal_entries` |
| `zatca_credentials` | 152 | `egsUnitId`→`egs_units` |
| `inventory_write_offs` | 139 | `branchId`→`branches` · `journalEntryId`→`journal_entries` · `movementId`→`stock_movements` · `productId`→`products` · `warehouseId`→`warehouses` |
| `contract_handovers` | 99 | `contractId`→`contracts` |
| `handover_items` | 99 | `handoverId`→`contract_handovers` |
| `contract_settlement_lines` | 96 | `contractId`→`contracts` |
| `company_users` | 86 | `permissionTemplateId`→`permission_templates` |
| `leave_requests` | 72 | `employeeId`→`employees` · `leaveTypeId`→`leave_types` |
| `employees` | 69 | `branchId`→`branches` |
| `contract_key_money` | 64 | `contractId`→`contracts` · `journalEntryId`→`journal_entries` |
| `cash_drawers` | 58 | `accountId`→`accounts` · `branchId`→`branches` |
| `rent_reminders` | 34 | `installmentId`→`contract_installments` |
| `handover_photos` | 33 | `handoverId`→`contract_handovers` · `itemId`→`handover_items` |
| `inventory_write_off_attachments` | 28 | `writeOffId`→`inventory_write_offs` |
| `stock_batches` | 6 | `productId`→`products` |
| `reminder_policies` | 1 | `escalateToUserId`→`company_users` |
| `supplier_payment_allocations` | 1 | `paymentId`→`supplier_payments` · `purchaseId`→`purchases` |
| `supplier_payments` | 1 | `bankId`→`banks` · `branchId`→`branches` · `journalEntryId`→`journal_entries` · `reversesId`→`supplier_payments` · `supplierId`→`suppliers` |
| `attendance_records` | 0 | `employeeId`→`employees` |
| `claim_attachments` | 0 | `claimId`→`contract_claims` |
| `company_user_branches` | 0 | `branchId`→`branches` · `companyUserId`→`company_users` |
| `contract_attachments` | 0 | `contractId`→`contracts` |
| `goods_receipt_lines` | ? | `goodsReceiptId`→`goods_receipts` · `purchaseLineId`→`purchase_lines` |
| `goods_receipts` | ? | `branchId`→`branches` · `journalEntryId`→`journal_entries` · `purchaseId`→`purchases` · `warehouseId`→`warehouses` |
| `landed_cost_distributions` | ? | `journalEntryId`→`journal_entries` · `purchaseId`→`purchases` · `purchaseLineId`→`purchase_lines` · `voidJournalEntryId`→`journal_entries` |
| `landed_cost_lines` | ? | `distributionId`→`landed_cost_distributions` · `layerId`→`inventory_layers` |
| `purchase_attachments` | 0 | `purchaseId`→`purchases` |
| `stock_opening_lines` | ? | `layerId`→`inventory_layers` · `movementId`→`stock_movements` · `openingId`→`stock_openings` · `voidJournalEntryId`→`journal_entries` · `voidMovementId`→`stock_movements` |
| `stock_openings` | ? | `journalEntryId`→`journal_entries` |
| `warranties` | 0 | `propertyId`→`properties` · `supplierId`→`suppliers` · `unitId`→`units` |
