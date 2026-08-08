-- GET /reports/property-kpis blew the 5s tenant-transaction timeout on large
-- portfolios: it loaded every installment *with its payments relation* into JS
-- (~10s at 50k installments) just to compute the collection rate. The service
-- now aggregates in SQL with a first-payment-per-installment join; this index
-- covers that join, and — as a bonus — the ON DELETE SET NULL cascade from
-- contract_installments, which previously re-scanned rent_payments once per
-- deleted installment.

-- CreateIndex
CREATE INDEX "rent_payments_installmentId_idx" ON "rent_payments"("installmentId");
