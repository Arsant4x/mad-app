-- GET /contracts blew the 5s tenant-transaction timeout at ~1,300 contracts.
-- Alongside paginating the endpoint, these indexes cover the hot paths:
--   * contract_installments(contractId)             — one contract's schedule (findOne); FK columns are not auto-indexed.
--   * contract_installments(companyId,status,dueDate) — the lazy DUE→LATE refresh on every read.
--   * contracts(companyId,start)                    — the paginated list's order-by within a tenant.
--   * rent_payments(contractId)                     — one contract's payments (findOne).

-- CreateIndex
CREATE INDEX "contract_installments_contractId_idx" ON "contract_installments"("contractId");

-- CreateIndex
CREATE INDEX "contract_installments_companyId_status_dueDate_idx" ON "contract_installments"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "contracts_companyId_start_idx" ON "contracts"("companyId", "start");

-- CreateIndex
CREATE INDEX "rent_payments_contractId_idx" ON "rent_payments"("contractId");
