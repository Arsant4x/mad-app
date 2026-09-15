-- ق-٨٧١ · ق-٨٧٢ · ق-٨٧٤ — سدادُ المشتريات مستنداً يُرحَّل لا علَماً على الصفّ.
--
-- ما كان: `purchases.paid` و`paidDate` يقولان «سُدِّد» بلا حسابٍ ولا مبلغٍ ولا قيد —
-- فـ`2100` لا ينقص أبداً (صفرُ سطرِ مدينٍ عليه في تاريخ الأستاذ كلِّه — ق-٨٦٣).
-- ما يصير: `supplier_payments` + `supplier_payment_allocations` مرآةُ سند القبض،
-- وحالةٌ مشتقّةٌ مخزَّنة `status` على الشراء تحلّ محلَّ العلَم.
--
-- ⚠️ العلَمُ يُحذف ولا يبقى مشتقّاً بالاسم الثنائيّ (ق-٨٧٤). وتحويلُ علَمٍ بلا مبلغٍ إلى
-- سندٍ اختلاقٌ — فإن وُجد صفٌّ معلَّمٌ مسدَّداً على هذه القاعدة **تتوقّف الهجرةُ برسالة**
-- ويُقرَّر بيد (المنشورُ صفرٌ مقيس — ق-٨٦٣ — فالتوقّفُ لا يقع فيه؛ وصفرُ اليوم لا يُفترض غداً).
-- والعدُّ يُعلَن بـWARNING لا NOTICE (ق-٦٩٥): ما يُقال بـNOTICE لا يقرؤه أحد.

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DUE', 'PARTIAL', 'PAID');

-- ── العلَمُ القائم: يُعدّ ويُعلَن، ويوقف الهجرةَ إن وُجد ─────────────────────────────
-- ق-٢٦٢: الجدولُ تحت `FORCE`، والهجرةُ تتّصل بـ`app_user` بلا `app.company_id` — فبلا رفعٍ
-- صريح **يعود العدُّ صفراً بلا خطأ** (مقيس: `0` من `272` على التطوير) ويشهد الحارسُ بغيابٍ
-- لم يبحث فيه. يُرفع `FORCE` للعدّ ثم يُعاد في الهجرة نفسِها (معاملةٌ واحدة).
ALTER TABLE "purchases" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  flagged integer;
  total   integer;
BEGIN
  SELECT count(*) INTO total FROM purchases;
  SELECT count(*) INTO flagged FROM purchases WHERE paid = true;

  IF flagged > 0 THEN
    RAISE EXCEPTION 'ق-٨٧٤: % من % مشترياتٍ معلَّمةٌ مسدَّدةً بالعلَم القديم (paid) بلا سندٍ ولا مبلغ — لا يُختلق لها سند؛ تُحوَّل بيدٍ إلى سندات صرفٍ حقيقية ثم تُعاد الهجرة', flagged, total;
  END IF;

  RAISE WARNING 'ق-٨٧٤: لا مشتريات معلَّمة بالعلَم القديم (paid) — % مشترياتٍ كلُّها تبدأ بالحالة DUE؛ العلَمان paid/paidDate يُحذفان', total;
END $$;

ALTER TABLE "purchases" FORCE ROW LEVEL SECURITY;

-- AlterTable — الحالةُ المشتقّة تحلّ محلَّ العلَم (كلُّ القائم DUE لأن لا علَمَ عليه — أُثبت أعلاه).
ALTER TABLE "purchases" DROP COLUMN "paid",
DROP COLUMN "paidDate",
ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'DUE';

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "bankId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "journalEntryId" TEXT,
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_reversesId_key" ON "supplier_payments"("reversesId");

-- CreateIndex
CREATE INDEX "supplier_payments_companyId_supplierId_idx" ON "supplier_payments"("companyId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_companyId_no_key" ON "supplier_payments"("companyId", "no");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_purchaseId_idx" ON "supplier_payment_allocations"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_paymentId_purchaseId_key" ON "supplier_payment_allocations"("paymentId", "purchaseId");

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Row-Level Security: عزلُ المستأجر بطبقته الثانية (§6.13 — تُكتب بيد دائماً) ──────
ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_supplier_payments ON "supplier_payments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "supplier_payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_payment_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_supplier_payment_allocations ON "supplier_payment_allocations"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
