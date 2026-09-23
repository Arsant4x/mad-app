-- ⑥A1 (`ق-١٣٢٥` · `ق-٨٢٤`) — الخصمُ النسبيّ لضريبة المدخلات (اللائحةُ التنفيذية م٥١).
--
-- **القائمُ يُعلَن ولا يُخمَّن** (كتصنيف العقد `ق-٨٩٢`): كلُّ شراءٍ قائم يأخذ قيمةً قديمةً
-- **صريحة** (`LEGACY_UNASSIGNED`) تُعدّ ويُصرَخ بها (`ق-٦٩١`: `RAISE WARNING`)، **وقيدُ
-- `CHECK` على `createdAt` يحبسها على ما سبق لحظةَ الهجرة** — فقيمةٌ قديمة يقبلها الخادمُ
-- لشراءٍ جديد افتراضٌ صامتٌ باسمٍ جديد.

CREATE TYPE "InputVatUse" AS ENUM ('TAXABLE_ONLY', 'EXEMPT_ONLY', 'MIXED', 'LEGACY_UNASSIGNED');
CREATE TYPE "VatRatioBasis" AS ENUM ('COMPUTED', 'ESTIMATED');

ALTER TABLE "purchases" ADD COLUMN "inputVatUse" "InputVatUse" NOT NULL DEFAULT 'LEGACY_UNASSIGNED';

-- ⚠️ **والعدُّ داخلَ سياق كلِّ منشأة** (`ق-١١٧٨` · قاعدةُ 2026-08-12): `purchases` تحت
--    `FORCE ROW LEVEL SECURITY`، والهجرةُ تعمل بدور المالك **بلا `app.company_id`** —
--    فسياسةُ العزل لا تطابق شيئاً و`count(*)` **يعيد صفراً على جدولٍ مملوء**.
--    وقِس فعلاً: أوّلُ صياغةٍ أعلنت `0` و`purchases` فيها `340`.
DO $$
DECLARE
  c RECORD;
  k INTEGER;
  companies_n INTEGER := 0;
  legacy INTEGER := 0;
  with_vat INTEGER := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*) INTO k FROM "purchases";
    legacy := legacy + k;
    SELECT count(*) INTO k FROM "purchases" WHERE "taxAmount" > 0 AND NOT "excludeFromVat";
    with_vat := with_vat + k;
  END LOOP;

  IF legacy = 0 THEN
    RAISE WARNING 'ق-١٣٢٥: % منشأة — لا مشترياتٍ قائمة: لا قائمَ يُعلَن', companies_n;
  ELSE
    RAISE WARNING 'ق-١٣٢٥: % منشأة — مشترياتٌ قائمة بلا إسنادِ مدخلات (LEGACY_UNASSIGNED): % — منها % تحمل ضريبةً تدخل الإقرار، وتُعامَل معاملةَ المشترك حتى تُصنَّف',
      companies_n, legacy, with_vat;
  END IF;
END $$;

-- ⛔ **والقيمةُ القديمة محبوسةٌ على ما سبق**: `now()` هنا لحظةُ الهجرة، فصفٌّ جديد
--    لا يمرّ بها. (و`createdAt` على الشراء قائمٌ أصلاً.)
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_input_vat_use_legacy_is_old"
  CHECK ("inputVatUse" <> 'LEGACY_UNASSIGNED' OR "createdAt" < now());

-- نسبةُ الخصم النسبيّ المطبَّقة في سنةٍ تقويمية (م٥١/٤–٧).
CREATE TABLE "vat_proportional_ratios" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "year"      INTEGER NOT NULL,
  "ratio"     DECIMAL(9,6) NOT NULL,
  "basis"     "VatRatioBasis" NOT NULL,
  "note"      TEXT,
  "settledRatio" DECIMAL(9,6),
  "settledAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vat_proportional_ratios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vat_proportional_ratios_companyId_year_key" ON "vat_proportional_ratios" ("companyId", "year");

ALTER TABLE "vat_proportional_ratios"
  ADD CONSTRAINT "vat_proportional_ratios_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- والنسبةُ كسرٌ بين صفرٍ وواحد — في القاعدة لا في الخدمة وحدَها.
ALTER TABLE "vat_proportional_ratios" ADD CONSTRAINT "vat_proportional_ratios_ratio_range"
  CHECK ("ratio" >= 0 AND "ratio" <= 1 AND ("settledRatio" IS NULL OR ("settledRatio" >= 0 AND "settledRatio" <= 1)));

-- 🔒 عزلُ الصفوف بطبقتين (`§6.13`) — يُكتب بيدٍ دائماً، فمخطَّطُ Prisma لا يعبّر عنه.
ALTER TABLE "vat_proportional_ratios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vat_proportional_ratios" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vat_proportional_ratios ON "vat_proportional_ratios"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
