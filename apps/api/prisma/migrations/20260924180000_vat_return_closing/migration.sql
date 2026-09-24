-- ⚖️ ق-١٣٦٠ — «إقفالُ الإقرار» حدثٌ مستقلٌّ بتاريخه: المشتركُ (MIXED) يُرحَّل غيرُ القابل منه للخصم إلى تكلفة ما اشتُري.
--
-- بنصّ المالك (①): «الخيارُ (ب)، حدثٌ مستقلٌّ «إقفالُ الإقرار» بتاريخ الحدث نفسِه في أوّل فترةٍ مفتوحة. ⇒ فتغيّرُ التقدير يُثبَت في
-- فترته لا بأثرٍ رجعيّ، ولا يُعلَّق على علَمٍ يرفعه التاجرُ بيده. ⚠️ ولا يُرفع إلا بحدثٍ عاكسٍ بتاريخه، والتسويةُ السنويةُ حدثٌ مثلُه.»
--
-- ما يُضاف: جدولُ vat_return_closings (الإقفالُ · التسويةُ السنوية · العكس — صفٌّ لكلِّ حدثٍ لا يُمحى، والعكسُ صفٌّ ثانٍ يشير إلى
-- ما يعكسه بمفتاحٍ فريد) · وأحداثُ ضريبة المدخلات غيرِ القابلة للخصم تشير إلى حدث الإقفال الذي أطلقها · وثلاثُ قيمٍ لمُطلِقها.
--
-- **القائمُ يُعدّ ويُعلَن ولا يُحوَّل** (ق-١١٧٨): لا حدثَ إقفالٍ قبل اليوم، فلا يُرحَّل شيءٌ هنا — المستنداتُ المشتركةُ القائمة تُعدّ
-- (متتبَّعةً يرحّلها أوّلُ إقفالٍ لفترتها · وسابقةً للتتبّع تبقى في 1250 ويعلنها الإقرار). والعدُّ داخل سياق كلِّ منشأة (ق-١٣٢٥).
-- ⚠️ الجدولُ الجديد تحت FORCE — كتلةُ RLS بيدٍ (§6.13).

-- CreateEnum
CREATE TYPE "VatClosingKind" AS ENUM ('CLOSING', 'ANNUAL_ADJUSTMENT', 'REVERSAL');

-- AlterEnum — لا تُستعمل القيمُ الجديدة في هذه الهجرة.
ALTER TYPE "NonDeductibleVatTrigger" ADD VALUE IF NOT EXISTS 'VAT_RETURN_CLOSING';
ALTER TYPE "NonDeductibleVatTrigger" ADD VALUE IF NOT EXISTS 'VAT_RETURN_CLOSING_REVERSAL';
ALTER TYPE "NonDeductibleVatTrigger" ADD VALUE IF NOT EXISTS 'VAT_ANNUAL_ADJUSTMENT';

-- AlterTable
ALTER TABLE "non_deductible_vat_events" ADD COLUMN     "vatReturnClosingId" TEXT;

-- CreateTable
CREATE TABLE "vat_return_closings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "VatClosingKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "periodType" "VatPeriod",
    "periodNo" INTEGER,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "ratio" DECIMAL(9,6) NOT NULL,
    "date" DATE NOT NULL,
    "reversesId" TEXT,
    "documentsCount" INTEGER NOT NULL,
    "untrackedCount" INTEGER NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vat_return_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vat_return_closings_reversesId_key" ON "vat_return_closings"("reversesId");
CREATE INDEX "vat_return_closings_companyId_year_idx" ON "vat_return_closings"("companyId", "year");
CREATE UNIQUE INDEX "vat_return_closings_companyId_id_key" ON "vat_return_closings"("companyId", "id");
CREATE INDEX "non_deductible_vat_events_vatReturnClosingId_idx" ON "non_deductible_vat_events"("vatReturnClosingId");

-- AddForeignKey — المفرد يحمل الفعل
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_vatReturnClosingId_fkey" FOREIGN KEY ("vatReturnClosingId") REFERENCES "vat_return_closings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vat_return_closings" ADD CONSTRAINT "vat_return_closings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vat_return_closings" ADD CONSTRAINT "vat_return_closings_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "vat_return_closings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey — ق-١٢٥٢: المركّبُ بجانب المفرد، بلا فعلٍ عند الحذف (المفردُ يحمله)
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_companyId_vatReturnClosingId_fkey" FOREIGN KEY ("companyId", "vatReturnClosingId") REFERENCES "vat_return_closings"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "vat_return_closings" ADD CONSTRAINT "vat_return_closings_companyId_reversesId_fkey" FOREIGN KEY ("companyId", "reversesId") REFERENCES "vat_return_closings"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ القيود — ما يستطيعه CHECK بلا قراءة جدولٍ آخر ═══
-- النسبةُ بين الصفر والواحد · الإقفالُ بفترته والتسويةُ بلا فترة (سنتُها كلُّها) · العكسُ وحدَه يشير إلى ما يعكسه · المدى مرتَّب.
ALTER TABLE "vat_return_closings" ADD CONSTRAINT "vat_return_closings_ratio_range" CHECK ("ratio" >= 0 AND "ratio" <= 1);
ALTER TABLE "vat_return_closings" ADD CONSTRAINT "vat_return_closings_period_shape"
    CHECK (
      ("kind" <> 'CLOSING' OR ("periodType" IS NOT NULL AND "periodNo" IS NOT NULL))
      AND ("kind" <> 'ANNUAL_ADJUSTMENT' OR ("periodType" IS NULL AND "periodNo" IS NULL))
    );
ALTER TABLE "vat_return_closings" ADD CONSTRAINT "vat_return_closings_reversal_iff" CHECK (("kind" = 'REVERSAL') = ("reversesId" IS NOT NULL));
ALTER TABLE "vat_return_closings" ADD CONSTRAINT "vat_return_closings_range_order" CHECK ("periodFrom" <= "periodTo");

-- ═══ عزلُ الصفوف — طبقةٌ ثانية فوق حقن النطاق (§6.1) ═══
ALTER TABLE "vat_return_closings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vat_return_closings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vat_return_closings ON "vat_return_closings"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ═══ القائمُ يُعدّ ويُعلَن ولا يُحوَّل ═══
DO $$
DECLARE
  c RECORD;
  k INTEGER;
  v NUMERIC;
  companies_n INTEGER := 0;
  tracked INTEGER := 0;
  tracked_vat NUMERIC := 0;
  untracked INTEGER := 0;
  untracked_vat NUMERIC := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*), COALESCE(sum("baseTaxAmount"), 0) INTO k, v FROM "purchases"
     WHERE "companyId" = c.id AND "inputVatUse" IN ('MIXED', 'LEGACY_UNASSIGNED') AND "nonDeductibleTracked"
       AND NOT "exempt" AND NOT "excludeFromVat" AND "baseTaxAmount" > 0 AND "voidedAt" IS NULL;
    tracked := tracked + k;
    tracked_vat := tracked_vat + v;

    SELECT count(*), COALESCE(sum("baseTaxAmount"), 0) INTO k, v FROM "purchases"
     WHERE "companyId" = c.id AND "inputVatUse" IN ('MIXED', 'LEGACY_UNASSIGNED') AND NOT "nonDeductibleTracked"
       AND NOT "exempt" AND NOT "excludeFromVat" AND "baseTaxAmount" > 0 AND "voidedAt" IS NULL;
    untracked := untracked + k;
    untracked_vat := untracked_vat + v;
  END LOOP;

  RAISE WARNING 'ق-١٣٦٠: % منشأة — مستنداتٌ مشتركةٌ قائمة بضريبة: متتبَّعةٌ % بمجموع % (يرحّل غيرَ القابل منها أوّلُ إقفالٍ لفترتها، بتاريخه) · سابقةٌ للتتبّع % بمجموع % (تبقى في 1250 ويعلنها الإقرار)؛ ولا حدثَ إقفالٍ قبل اليوم',
    companies_n, tracked, tracked_vat, untracked, untracked_vat;
END $$;
