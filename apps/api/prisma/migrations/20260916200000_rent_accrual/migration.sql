-- ق-٩١٧ · ق-٩٢٤ · ق-٩٢٦ · ق-٩٢٧ — الاستحقاقُ الكامل لإيجار العقود: القسطُ ذمّةٌ عند نقطة
-- ضريبته (1200 إجمالاً ⇄ 2400/4200 صافياً + 2200 ضريبةً) والقبضُ يسدّدها — فيستوي الدفترُ
-- والإقرارُ بالبناء لا بحارسٍ يعلن فرقَهما (ق-٩١٥).
--
-- ما يُضاف: (١) صفُّ الاستحقاق rent_accruals — صفٌّ واحد لكلِّ نقطة ضريبة (م٢٠: الأسبقُ من
-- الاستحقاق والسداد، وبقدر المقبوض حين يسبق السدادُ — ق-٩٢٤) يقرؤه الدفترُ (قيدٌ لكلِّ صفّ)
-- والإقرارُ (يجمع الصفوفَ بتاريخها) معاً؛ (٢) أساسُ القسط accrualBasis والتراكمُ المستحقّ.
--
-- ⭐ «ما سبق اللحظةَ: في الإقرار لا في الدفتر» (ق-٩٢٦) — الاستثناءُ الوحيد من «الدفتر = الإقرار»:
-- قسطٌ سبقت نقطةُ ضريبته لحظةَ هذه الهجرة (حلّ استحقاقُه، أو قُبضت عليه دفعةٌ قبلها) يُعلَّم
-- LEGACY_COLLECTED فيبقى على مسار القبض القائم (نقدٌ ⇄ 4200/2400) ويُحسب في الإقرار بالمحرّك
-- نفسِه ولا يُرحَّل رجعياً؛ وما بعدها ACCRUAL يُستحقّ عند نقطته. والعدُّ يُعلَن بـWARNING لا
-- NOTICE (ق-٦٩٥) — وعلى قاعدةٍ فارغة يصرخ بصفر (ق-٦٩١).
--
-- ⭐ والحبسُ في القاعدة لا في العادة (ق-٨٩٨): قيدُ CHECK يمنع القيمةَ القديمة على أيّ صفٍّ أُنشئ
-- بعد لحظة الهجرة — «قيمةٌ قديمة يقبلها الخادمُ لصفٍّ جديد افتراضٌ صامتٌ باسمٍ جديد». اللحظةُ
-- تُلتقط بـclock_timestamp (UTC، كما يكتب Prisma createdAt) وتُثبَّت حرفياً في نصّ القيد.
--
-- ⚠️ الجدولان تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ
-- كلَّها (الأقساطُ ودفعاتُها معاً — فالختمُ يقرأ الدفعات) ثم يُعاد في الهجرة نفسِها.

-- CreateEnum
CREATE TYPE "InstallmentAccrualBasis" AS ENUM ('ACCRUAL', 'LEGACY_COLLECTED');
CREATE TYPE "RentAccrualKind" AS ENUM ('DUE', 'PREPAYMENT', 'UNLINKED', 'REVERSAL', 'DISCOUNT');

-- AlterTable — الأساسُ يُضاف قابلاً للفراغ لحظةً واحدة، ثم يُختم، ثم يُلزَم بافتراض ACCRUAL.
ALTER TABLE "contract_installments" ADD COLUMN "accrualBasis" "InstallmentAccrualBasis",
ADD COLUMN     "baseAccruedGross" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "baseAccruedNet" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "baseAccruedTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "accrualCompletedAt" TIMESTAMP(3);

ALTER TABLE "contract_installments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "rent_payments" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_total  integer;
  n_legacy integer;
  cutover  timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  SELECT count(*) INTO n_total FROM "contract_installments";

  -- الختم: نقطةُ الضريبة سبقت اللحظةَ إن حلّ الاستحقاقُ (بالتاريخ — يومُ الهجرة نفسُه يسبقها)
  -- أو قُبضت على القسط دفعةٌ قبلها (م٢٠/٢ — الدفعةُ المقدَّمة نقطةٌ بتاريخها).
  UPDATE "contract_installments" i
     SET "accrualBasis" = CASE
       WHEN i."dueDate" <= cutover::date
         OR EXISTS (SELECT 1 FROM "rent_payments" p WHERE p."installmentId" = i.id AND p."date" <= cutover::date)
       THEN 'LEGACY_COLLECTED'::"InstallmentAccrualBasis"
       ELSE 'ACCRUAL'::"InstallmentAccrualBasis"
     END
   WHERE i."accrualBasis" IS NULL;

  SELECT count(*) INTO n_legacy FROM "contract_installments" WHERE "accrualBasis" = 'LEGACY_COLLECTED';

  -- الحبس: القيمةُ القديمة لا تصحّ إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "contract_installments" ADD CONSTRAINT "installments_legacy_basis_before_cutover" CHECK ("accrualBasis" <> ''LEGACY_COLLECTED'' OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'ق-٩٢٦: % من % قسطاً قائماً عُلِّم «قديمٌ — على أساس القبض» (نقطةُ ضريبته سبقت % لحظة الهجرة، UTC): يُحسب في الإقرار ولا يُرحَّل رجعياً؛ والباقي يُستحقّ ذمّةً عند نقطته',
    n_legacy, n_total, cutover;
END $$;

ALTER TABLE "rent_payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contract_installments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "contract_installments" ALTER COLUMN "accrualBasis" SET NOT NULL,
ALTER COLUMN "accrualBasis" SET DEFAULT 'ACCRUAL';

-- CreateTable
CREATE TABLE "rent_accruals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "installmentId" TEXT,
    "paymentId" TEXT,
    "kind" "RentAccrualKind" NOT NULL,
    "date" DATE NOT NULL,
    "classification" "ContractClassification" NOT NULL,
    "taxable" BOOLEAN NOT NULL,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "amountGross" DECIMAL(18,2) NOT NULL,
    "amountNet" DECIMAL(18,2) NOT NULL,
    "amountTax" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "baseGross" DECIMAL(18,2) NOT NULL,
    "baseNet" DECIMAL(18,2) NOT NULL,
    "baseTax" DECIMAL(18,2) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rent_accruals_companyId_date_idx" ON "rent_accruals"("companyId", "date");

-- CreateIndex
CREATE INDEX "rent_accruals_installmentId_idx" ON "rent_accruals"("installmentId");

-- CreateIndex
CREATE INDEX "rent_accruals_contractId_idx" ON "rent_accruals"("contractId");

-- CreateIndex
CREATE INDEX "contract_installments_companyId_accrualBasis_dueDate_idx" ON "contract_installments"("companyId", "accrualBasis", "dueDate");

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "contract_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "rent_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Row-Level Security: عزلُ المستأجر بطبقته الثانية (§6.13 — تُكتب بيد دائماً) ──────
ALTER TABLE "rent_accruals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rent_accruals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rent_accruals ON "rent_accruals"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
