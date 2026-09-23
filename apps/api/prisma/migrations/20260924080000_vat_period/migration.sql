-- ⑥A2 (`ق-١٣٢٥`) — الفترةُ الضريبية: شهريةٌ فوق أربعين مليوناً، وربعيةٌ لغيرها.
-- (اللائحةُ التنفيذية · مادّةُ الفترة الضريبية ف١–٢.)
--
-- **والقائمُ يُنقل ويُعدّ ويُصرخ به** (`ق-٦٩١`: `RAISE WARNING` لا `NOTICE`):
-- كلُّ وسمِ تقديمٍ قائم ربعيٌّ بالضرورة — فـ`quarter` يصير `periodNo` بنوع `QUARTERLY`.

CREATE TYPE "VatPeriod" AS ENUM ('QUARTERLY', 'MONTHLY');

ALTER TABLE "companies" ADD COLUMN "vatPeriod" "VatPeriod" NOT NULL DEFAULT 'QUARTERLY';

-- ① النوعُ والرقم: يُضافان بقيمةٍ افتراضية ثم يُملأ الرقمُ من `quarter` القائم.
ALTER TABLE "vat_return_filings" ADD COLUMN "periodType" "VatPeriod" NOT NULL DEFAULT 'QUARTERLY';
ALTER TABLE "vat_return_filings" ADD COLUMN "periodNo" INTEGER;

-- ⚠️ **ورفعُ `FORCE` صراحةً للنقل ثم إعادتُه** (`ق-٢٦٢`): الجدولُ تحت `FORCE ROW LEVEL
--    SECURITY` والهجرةُ تعمل بدور المالك **بلا `app.company_id`** — فـ`UPDATE` بلا رفعٍ
--    **يمسّ صفرَ صفوف**، ثم يسقط `SET NOT NULL` على عمودٍ ما زال فارغاً. والرفعُ لمدّة
--    النقل وحدَها ويُعاد بعده فوراً، فضمانُ العزل لا يتغيّر بانتهاء الهجرة.
ALTER TABLE "vat_return_filings" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  moved INTEGER;
BEGIN
  UPDATE "vat_return_filings" SET "periodNo" = "quarter" WHERE "periodNo" IS NULL;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE WARNING 'ق-١٣٢٥ — وسومُ تقديمٍ نُقلت من quarter إلى periodNo بنوع QUARTERLY: %', moved;
END $$;

ALTER TABLE "vat_return_filings" FORCE ROW LEVEL SECURITY;

ALTER TABLE "vat_return_filings" ALTER COLUMN "periodNo" SET NOT NULL;

-- ② المفتاحُ الفريد يتبع النوعَ والرقم.
DROP INDEX IF EXISTS "vat_return_filings_companyId_year_quarter_key";
ALTER TABLE "vat_return_filings" DROP COLUMN "quarter";
CREATE UNIQUE INDEX "vat_return_filings_companyId_year_periodType_periodNo_key"
  ON "vat_return_filings" ("companyId", "year", "periodType", "periodNo");

-- ③ ورقمُ الفترة محصورٌ بنوعها في القاعدة لا في الخدمة وحدَها — فمسارٌ لا يمرّ بالخدمة
--    لا يكتب شهراً `13` ولا ربعاً `5`.
ALTER TABLE "vat_return_filings" ADD CONSTRAINT "vat_return_filings_period_no_range"
  CHECK (
    ("periodType" = 'QUARTERLY' AND "periodNo" BETWEEN 1 AND 4)
    OR ("periodType" = 'MONTHLY' AND "periodNo" BETWEEN 1 AND 12)
  );
