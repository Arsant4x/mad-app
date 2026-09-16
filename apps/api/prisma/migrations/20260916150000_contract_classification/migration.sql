-- ق-٨٩١ · ق-٨٩٢ · ق-٨٩٨ — تصنيفُ العقد للضريبة (سكنيٌّ معفى · تجاريٌّ خاضع) وشمولُ قيمته
-- للضريبة: حقلان إلزاميان بتعدادٍ مغلق **على العقد** — لا على العقار (المختلطُ يحمل الاثنين)
-- ولا على الوحدة (نصٌّ حرٌّ قبل الخادمُ فيه أيَّ كلمة) — فالعقدُ هو الواقعةُ الخاضعة.
--
-- ⛔ لا استنباطَ من نصّ: الصفوفُ القائمة لا تُصنَّف من كلمة الوحدة، بل تُعلَّم قيمةً قديمةً صريحة
-- («قديمٌ غيرُ مصنَّف» · «قديمٌ غيرُ معلَنِ الشمول») تُعدّ ويُصرخ بها (WARNING لا NOTICE — ق-٦٩٥)
-- ولا تُصحَّح رجعياً — يُنقصها التاجرُ بيدٍ عند لمس العقد.
--
-- ⭐ والحبسُ في القاعدة لا في العادة: قيدُ CHECK يمنع القيمةَ القديمة على أيّ صفٍّ أُنشئ بعد لحظة
-- هذه الهجرة — «قيمةٌ قديمة يقبلها الخادمُ لعقدٍ جديد افتراضٌ صامتٌ باسمٍ جديد» (حكم المالك).
-- اللحظةُ تُلتقط وقتَ التنفيذ (clock_timestamp بتوقيت UTC، كما يكتب Prisma createdAt) وتُثبَّت
-- حرفياً في نصّ القيد — فلا تعتمد على ساعةٍ لاحقة ولا على المنطقة الزمنية.
--
-- ⚠️ الجدولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها
-- ثم يُعاد. والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١) — فعلى قاعدةٍ فارغة تصرخ الهجرةُ بصفر.

-- CreateEnum
CREATE TYPE "ContractClassification" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'LEGACY_UNCLASSIFIED');
CREATE TYPE "ContractVatInclusion" AS ENUM ('INCLUSIVE', 'EXCLUSIVE', 'LEGACY_UNDECLARED');

-- AlterTable — يُضافان قابلَين للفراغ لحظةً واحدة، ثم يُملآن، ثم يُلزَمان.
ALTER TABLE "contracts" ADD COLUMN "classification" "ContractClassification",
ADD COLUMN "vatInclusion" "ContractVatInclusion";

ALTER TABLE "contracts" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_total  integer;
  n_legacy integer;
  cutover  timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  SELECT count(*) INTO n_total FROM "contracts";

  UPDATE "contracts"
     SET "classification" = 'LEGACY_UNCLASSIFIED',
         "vatInclusion"   = 'LEGACY_UNDECLARED'
   WHERE "classification" IS NULL;
  GET DIAGNOSTICS n_legacy = ROW_COUNT;

  -- الحبس: القيمةُ القديمة لا تصحّ إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legacy_classification_before_cutover" CHECK ("classification" <> ''LEGACY_UNCLASSIFIED'' OR "createdAt" < %L)',
    cutover
  );
  EXECUTE format(
    'ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legacy_vat_inclusion_before_cutover" CHECK ("vatInclusion" <> ''LEGACY_UNDECLARED'' OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'ق-٨٩٨: % من % عقداً قائماً عُلِّم «قديمٌ غيرُ مصنَّف / غيرُ معلَنِ الشمول» — يُعدّ ولا يُصحَّح رجعياً؛ والقيمةُ القديمة محبوسةٌ على ما سبق % (لحظة الهجرة، UTC)',
    n_legacy, n_total, cutover;
END $$;

ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;

-- الإلزام — بلا DEFAULT: الخادمُ يُلزَم أن يذكر القيمةَ في كل إنشاء.
ALTER TABLE "contracts" ALTER COLUMN "classification" SET NOT NULL,
ALTER COLUMN "vatInclusion" SET NOT NULL;
