-- ═══ الدفعة (ب): العدّاد والسلسلة داخل الوحدة (ق-١٧٧) ═══
--
-- نصّ الهيئة (الدليل الفني المفصّل v2): «على المكلَّف توليد المستندات في تسلسلٍ
-- واحد لكل EGS ربطها». كان مفتاح العدّاد على المنشأة (20260815090000_zatca_icv_unique)
-- ويصير على الوحدة. والوحدة الافتراضية واحدةٌ لكل منشأة (20260905030000_egs_units)
-- وكل مستندٍ يحمل ICV نُسب إليها هناك — فالمواقع القائمة لا تتغيّر رقماً واحداً،
-- والسلاسل المقبولة لا تُمَسّ.
--
-- ⚠️ الفحص المسبق يقرأ "invoices" تحت FORCE RLS بلا app.company_id: يرى صفر صفٍّ
-- **بلا خطأ** — فيُرفع FORCE قبله ويُعاد بعده (نمط 20260905030000). ولا إصلاحَ صامتاً
-- هنا: مستندٌ يحمل موقعاً بلا وحدة، أو موقعان متكرّران داخل وحدةٍ واحدة، يُسقطان
-- الهجرة **بالاسم والعدد** — التعبئة في (أ) هي المتّهم الوحيد، وتُصحَّح بيدٍ لا بتخمين.
ALTER TABLE "invoices" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  orphan_count integer;
  dup_count integer;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "invoices"
  WHERE "zatcaIcv" IS NOT NULL AND "egsUnitId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'icv_per_unit: % مستنداً يحمل ICV بلا وحدة — تعبئة الدفعة (أ) لم تُدركه', orphan_count;
  END IF;

  SELECT count(*) INTO dup_count
  FROM (
    SELECT "egsUnitId", "zatcaIcv"
    FROM "invoices"
    WHERE "zatcaIcv" IS NOT NULL
    GROUP BY "egsUnitId", "zatcaIcv"
    HAVING count(*) > 1
  ) AS duplicated;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'icv_per_unit: % موقعاً مكرَّراً داخل وحدةٍ واحدة — لا يُبنى فهرسٌ فريد فوق تكرار', dup_count;
  END IF;
END $$;

-- DropIndex
DROP INDEX "invoices_companyId_zatcaIcv_key";

-- CreateIndex
CREATE UNIQUE INDEX "invoices_egsUnitId_zatcaIcv_key" ON "invoices"("egsUnitId", "zatcaIcv");

-- موقعٌ بلا وحدة مستحيلٌ بالشكل لا بالفحص (ق-١٥٩): الفهرس الفريد أعلاه يُجيز
-- NULL مكرَّراً في "egsUnitId"، فلولا هذا القيد أفلت مستندٌ ذو ICV بلا وحدة من
-- العدّ كلّه. Prisma لا تعبّر عن CHECK، فيُكتب هنا ويُذكر في تعليق المخطَّط.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_icv_requires_unit" CHECK ("zatcaIcv" IS NULL OR "egsUnitId" IS NOT NULL);

ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
