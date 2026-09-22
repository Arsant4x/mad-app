-- ق-١٢٦١ ب — ④A1 الدفعةُ المقدَّمة بمستندٍ ضريبيّ (رمزُ الهيئة 386): نوعُ مستندٍ PREPAYMENT، ورابطُ سند القبض الذي أصدره على
-- الفاتورة، وجدولُ تطبيق الدفعة المقدَّمة على فاتورة التوريد (BT-113 · KSA-26…34)، ومفاتيحُه المفردةُ والمركّبةُ بجانبها
-- (ق-١٢٥٩). لا كتابةَ بيانات — والقبضُ القائم غيرُ المخصَّص يُعدّ ويُصرخ به (WARNING) ولا يُصحَّح رجعياً:
-- مستندُه مستندٌ ضريبيّ بتاريخه وسلسلته، ولا يُختلق بأثرٍ رجعيّ.

-- AlterEnum
ALTER TYPE "InvoiceDocType" ADD VALUE 'PREPAYMENT';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "prepaymentPaymentId" TEXT;

-- CreateTable
CREATE TABLE "invoice_prepayments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "prepaymentInvoiceId" TEXT NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "vat" DECIMAL(18,2) NOT NULL,
    "gross" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_prepayments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_prepayments_prepaymentInvoiceId_key" ON "invoice_prepayments"("prepaymentInvoiceId");

-- CreateIndex
CREATE INDEX "invoice_prepayments_companyId_invoiceId_idx" ON "invoice_prepayments"("companyId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_prepaymentPaymentId_key" ON "invoices"("prepaymentPaymentId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_prepaymentPaymentId_fkey" FOREIGN KEY ("prepaymentPaymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_prepaymentPaymentId_fkey" FOREIGN KEY ("companyId", "prepaymentPaymentId") REFERENCES "payments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_prepayments" ADD CONSTRAINT "invoice_prepayments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_prepayments" ADD CONSTRAINT "invoice_prepayments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_prepayments" ADD CONSTRAINT "invoice_prepayments_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_prepayments" ADD CONSTRAINT "invoice_prepayments_prepaymentInvoiceId_fkey" FOREIGN KEY ("prepaymentInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_prepayments" ADD CONSTRAINT "invoice_prepayments_companyId_prepaymentInvoiceId_fkey" FOREIGN KEY ("companyId", "prepaymentInvoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- RLS — بيدٍ كسائر جداول المنشأة (§6.13): طبقتان.
ALTER TABLE "invoice_prepayments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_prepayments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_invoice_prepayments ON "invoice_prepayments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- القائمُ يُعدّ ويُعلَن: سنداتُ قبضٍ (RECEIPT، غيرُ عكسٍ) مبلغُها يفوق مجموعَ تخصيصاتها — قُبضت على الحساب قبل هذا البناء
-- بلا مستندٍ ضريبيّ. تُعدّ عبر المنشآت (FORCE يُرفع لحظةً) ويُصرخ بها، ولا تُصحَّح.
ALTER TABLE "payments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocations" NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  n_unallocated integer;
  n_companies   integer;
BEGIN
  SELECT count(*), count(DISTINCT p."companyId") INTO n_unallocated, n_companies
    FROM "payments" p
    LEFT JOIN (SELECT "paymentId", sum(amount) AS allocated FROM "payment_allocations" GROUP BY "paymentId") a ON a."paymentId" = p.id
   WHERE p.kind = 'RECEIPT' AND p."reversesId" IS NULL AND p.amount > COALESCE(a.allocated, 0) + 0.005;
  RAISE WARNING 'ق-١٢٦١ ب (④A1): % سندَ قبضٍ قائماً في % منشأة قُبض على الحساب (فائضٌ غيرُ مخصَّص) قبل بناء مستند الدفعة المقدَّمة — يُعدّ ولا يُصحَّح رجعياً؛ من اليوم يُعلَن مصيرُ الفائض على كل سند.', n_unallocated, n_companies;
END $$;
ALTER TABLE "payment_allocations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
