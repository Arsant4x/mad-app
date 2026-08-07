-- CreateTable
CREATE TABLE "pos_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_payments_companyId_invoiceId_idx" ON "pos_payments"("companyId", "invoiceId");

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security: tenant isolation (same block as every other tenant table).
ALTER TABLE "pos_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pos_payments ON "pos_payments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
