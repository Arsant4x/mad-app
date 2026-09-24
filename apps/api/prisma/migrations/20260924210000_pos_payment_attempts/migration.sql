-- ⭐ ق-١٤٠١ — محاولةُ دفع البطاقة: الشحنُ خارج المعاملة، والفاتورةُ بعد القبول (الموجز `موجز-مسار-دفع-الكاشير.md` · ق-١٣٩٧ … ق-١٣٩٩).
--
-- ① جدولُ pos_payment_attempts بحالاته السبع ولقطةِ البيع ومرجعِ المزوّد ودليلِ الحسم اليدويّ — ومفاتيحُه المفردةُ والمركّبةُ بجانبها (ق-١٢٥٢).
-- ② صفُّ الدفع يحمل «بمَ ثبت دفعُ البطاقة» ورقمَ مرجع الجهاز ورمزَ الموافقة ومحاولتَه.
-- ③ مهلةُ تسوية الشبكة بالأيام إعداداً للمنشأة (الافتراضيُّ 3 — أعلى T+1..T+3 في خطّتنا الموثَّقة).
--
-- والقائمُ من صفوف البطاقة يُعلَّم **بما وقع فعلاً** لا بتخمين: بمرجع مزوّد ⟵ PROVIDER_APPROVED (مرّ بالمحوّل) ·
-- وبلا مرجع ⟵ CASHIER_CONFIRMED (لم يُسأل مزوّد — أكّده الكاشيرُ وحدَه، ومنه ما زُومن والربطُ فعّال: القياس ① في الموجز).
-- والعددُ يُعلَن بـWARNING ولو صفراً (ق-٦٩١).

-- AlterEnum — يُرفع للمراجعة باسم الكاشير ما لم تطابقه التسوية بعد مهلتها (ق-١٣٩٧/٣ · ق-١٣٩٩).
ALTER TYPE "NotificationKind" ADD VALUE 'POS_CARD_UNMATCHED';

-- CreateEnum
CREATE TYPE "PosPaymentAttemptStatus" AS ENUM ('CREATED', 'CHARGING', 'APPROVED', 'COMPLETED', 'DECLINED', 'UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosCardVerification" AS ENUM ('PROVIDER_APPROVED', 'DEVICE_REFERENCE', 'MANUAL_EVIDENCE', 'CASHIER_CONFIRMED');

-- CreateEnum
CREATE TYPE "PosPaymentResolution" AS ENUM ('PROVIDER_CHARGE', 'PROVIDER_STATUS', 'MANUAL_EVIDENCE', 'CANCELLED');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "posCardSettlementDays" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "pos_payments" ADD COLUMN     "approvalCode" TEXT,
ADD COLUMN     "attemptId" TEXT,
ADD COLUMN     "deviceReference" TEXT,
ADD COLUMN     "verification" "PosCardVerification";

-- CreateTable
CREATE TABLE "pos_payment_attempts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "clientSaleId" TEXT NOT NULL,
    "status" "PosPaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "sale" JSONB NOT NULL,
    "cardAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "approvalCode" TEXT,
    "declineReason" TEXT,
    "detail" TEXT,
    "invoiceId" TEXT,
    "chargeStartedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" "PosPaymentResolution",
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "evidenceDeviceReference" TEXT,
    "evidenceApprovalCode" TEXT,
    "evidenceNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_payment_attempts_invoiceId_key" ON "pos_payment_attempts"("invoiceId");

-- CreateIndex
CREATE INDEX "pos_payment_attempts_companyId_status_idx" ON "pos_payment_attempts"("companyId", "status");

-- CreateIndex
CREATE INDEX "pos_payment_attempts_companyId_shiftId_idx" ON "pos_payment_attempts"("companyId", "shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_payment_attempts_companyId_clientSaleId_key" ON "pos_payment_attempts"("companyId", "clientSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_payment_attempts_companyId_id_key" ON "pos_payment_attempts"("companyId", "id");

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "pos_payment_attempts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_companyId_attemptId_fkey" FOREIGN KEY ("companyId", "attemptId") REFERENCES "pos_payment_attempts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "pos_shifts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_companyId_shiftId_fkey" FOREIGN KEY ("companyId", "shiftId") REFERENCES "pos_shifts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- القائمُ يُعلَّم بما وقع، ثم يُحبس الشكلُ بالقيود.
-- ⚠️ **ورفعُ `FORCE` صراحةً للتعبئة ثم إعادتُه** (`ق-٢٦٢`): الجدولُ تحت `FORCE ROW LEVEL SECURITY` والهجرةُ تعمل بدور المالك
--    **بلا `app.company_id`** — فـ`UPDATE` بلا رفعٍ يمسّ صفرَ صفوف، ثم يسقط قيدُ صفّ البطاقة على صفوفٍ لم تُعلَّم. والرفعُ
--    لمدّة التعبئة وحدَها ويُعاد بعدها فوراً، فضمانُ العزل لا يتغيّر بانتهاء الهجرة.
ALTER TABLE "pos_payments" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  provider_n INTEGER;
  cashier_n INTEGER;
BEGIN
  UPDATE "pos_payments" SET "verification" = 'PROVIDER_APPROVED'
   WHERE "method" = 'CARD' AND "providerRef" IS NOT NULL AND "verification" IS NULL;
  GET DIAGNOSTICS provider_n = ROW_COUNT;

  UPDATE "pos_payments" SET "verification" = 'CASHIER_CONFIRMED'
   WHERE "method" = 'CARD' AND "providerRef" IS NULL AND "verification" IS NULL;
  GET DIAGNOSTICS cashier_n = ROW_COUNT;

  RAISE WARNING 'ق-١٣٩٧: صفوفُ بطاقةٍ قائمة: % بمرجع مزوّد ⟵ PROVIDER_APPROVED · % بلا مرجع ⟵ CASHIER_CONFIRMED (لم يُسأل مزوّد — أكّدها الكاشيرُ وحدَه)',
    provider_n, cashier_n;
END $$;

ALTER TABLE "pos_payments" FORCE ROW LEVEL SECURITY;

-- صفُّ البطاقة يعلن بمَ ثبت دفعُه، وصفُّ النقد لا (ق-١٣٩٧).
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_card_verification"
  CHECK (("method" = 'CARD') = ("verification" IS NOT NULL));
-- رقمُ مرجع الجهاز إلزاميٌّ لما لم يمرّ بالمزوّد (ق-١٣٩٧/١ · ق-١٣٩٩) — لا «أكّده الكاشير» وحدَه.
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_device_reference_required"
  CHECK ("verification" IS NULL OR "verification" NOT IN ('DEVICE_REFERENCE', 'MANUAL_EVIDENCE') OR ("deviceReference" IS NOT NULL AND btrim("deviceReference") <> ''));
-- والحسمُ اليدويّ بدليلٍ لا بقول: رمزُ الموافقة من إيصال الجهاز (ق-١٣٩٩).
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_manual_approval_code"
  CHECK ("verification" IS DISTINCT FROM 'MANUAL_EVIDENCE' OR ("approvalCode" IS NOT NULL AND btrim("approvalCode") <> ''));
-- وما قبله المزوّد يحمل مرجعَه.
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_provider_ref_required"
  CHECK ("verification" IS DISTINCT FROM 'PROVIDER_APPROVED' OR "providerRef" IS NOT NULL);

-- المحاولةُ المكتملة وحدَها تحمل فاتورة، وكلُّ مكتملةٍ تحملها.
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_completed_invoice"
  CHECK (("status" = 'COMPLETED') = ("invoiceId" IS NOT NULL));
-- ولا زرَّ «اعتبرها مقبولة» بلا دليل (ق-١٣٩٩): الحسمُ اليدويّ بمرجع الجهاز ورمز الموافقة ومَن حسم.
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_manual_evidence"
  CHECK ("resolution" IS DISTINCT FROM 'MANUAL_EVIDENCE' OR (
    "evidenceDeviceReference" IS NOT NULL AND btrim("evidenceDeviceReference") <> '' AND
    "evidenceApprovalCode" IS NOT NULL AND btrim("evidenceApprovalCode") <> '' AND
    "resolvedById" IS NOT NULL));
ALTER TABLE "pos_payment_attempts" ADD CONSTRAINT "pos_payment_attempts_card_amount_positive"
  CHECK ("cardAmount" > 0);

-- المهلةُ بين يومٍ وستّين.
ALTER TABLE "companies" ADD CONSTRAINT "companies_pos_card_settlement_days"
  CHECK ("posCardSettlementDays" BETWEEN 1 AND 60);

-- RLS — بيدٍ كسائر جداول المنشأة (§6.13): طبقتان.
ALTER TABLE "pos_payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_payment_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pos_payment_attempts ON "pos_payment_attempts"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
