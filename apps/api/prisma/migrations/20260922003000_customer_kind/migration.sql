-- ق-١٢٦١ أ — ②A1 صفةُ المشتري ومعرّفُه البديل وبلدُه: نوعُ الفاتورة يُقرَّر من صفة المشتري (م٥٣(١)(أ): خاضعٌ · شخصٌ
-- اعتباريّ غيرُ خاضع · مؤسّسةٌ فردية · كيانٌ مؤسَّس بموجب أنظمة المملكة ⟵ ضريبيةٌ كاملة؛ وغيرُهم (م٥٣(٧)) ⟵ مبسّطة)
-- لا من رقمه الضريبيّ وحدَه؛ ومعرّفٌ بديل بمخطّطه (BR-KSA-14: TIN · CRN · MOM · MLS · 700 · SAG · NAT · GCC · IQA ·
-- PAS · OTH) لمن ليس مسجَّلاً؛ وبلدٌ (BT-55) كان ثابتاً «SA» في المستند.
--
-- ⛔ لا استنباطَ من نصّ (ق-٨٩٨): الصفوفُ القائمة لا تُصنَّف من اسمٍ ولا من رقمٍ، بل تُعلَّم قيمةً قديمةً صريحة
-- («قديمٌ غيرُ معلَن») تُعدّ ويُصرخ بها (WARNING لا NOTICE — ق-٦٩٥) ولا تُصحَّح رجعياً — يُعلنها التاجرُ بيدٍ،
-- ولا تُفوتَر قبل الإعلان (كما لا يُعدَّل عقدٌ قديم قبل إعلانه — ق-٨٩٢).
--
-- ⭐ والحبسُ في القاعدة لا في العادة: قيدُ CHECK يمنع القيمةَ القديمة على أيّ صفٍّ أُنشئ بعد لحظة هذه الهجرة
-- (clock_timestamp بتوقيت UTC كما يكتب Prisma createdAt، مثبَّتةً حرفياً في نصّ القيد).
--
-- والبلدُ يُضاف بقيمةٍ افتراضية «SA» **لأنها ما كان المستندُ يكتبه حرفياً لكلِّ مشترٍ** — تثبيتُ السلوك القائم لا
-- تصنيفٌ جديد؛ ويبقى للتاجر تغييرُه على البطاقة.
--
-- ⚠️ الجدولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها ثم يُعاد.

-- CreateEnum
CREATE TYPE "CustomerKind" AS ENUM ('NATURAL', 'ESTABLISHMENT', 'LEGAL_PERSON', 'LEGACY_UNDECLARED');

-- AlterTable — الصفةُ تُضاف قابلةً للفراغ لحظةً واحدة، ثم تُملأ، ثم تُلزَم.
ALTER TABLE "customers" ADD COLUMN "kind" "CustomerKind",
ADD COLUMN "otherIdScheme" TEXT,
ADD COLUMN "otherId" TEXT,
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'SA';

ALTER TABLE "customers" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_total  integer;
  n_legacy integer;
  cutover  timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  SELECT count(*) INTO n_total FROM "customers";

  UPDATE "customers" SET "kind" = 'LEGACY_UNDECLARED' WHERE "kind" IS NULL;
  GET DIAGNOSTICS n_legacy = ROW_COUNT;

  -- الحبس: القيمةُ القديمة لا تصحّ إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "customers" ADD CONSTRAINT "customers_legacy_kind_before_cutover" CHECK ("kind" <> ''LEGACY_UNDECLARED'' OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'ق-١٢٦١ أ (②A1): % من % عميلاً قائماً عُلِّم «قديمٌ غيرُ معلَنِ الصفة» — يُعدّ ولا يُصنَّف رجعياً؛ لا يُفوتَر قبل أن يُعلن التاجرُ صفتَه. لحظةُ الحبس (UTC): %',
    n_legacy, n_total, cutover;
END $$;

ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;

-- المعرّفُ البديل: المخطّطُ من القيم الأحد عشر (نصٌّ مقيَّدٌ لا تعداد — «700» ليست اسمَ عضوٍ صالحاً في Prisma)،
-- والمخطّطُ والرقمُ معاً أو لا شيء، وألفبائيٌّ رقميّ (BR-KSA-14).
ALTER TABLE "customers" ADD CONSTRAINT "customers_other_id_scheme" CHECK ("otherIdScheme" IS NULL OR "otherIdScheme" IN ('TIN', 'CRN', 'MOM', 'MLS', '700', 'SAG', 'NAT', 'GCC', 'IQA', 'PAS', 'OTH'));
ALTER TABLE "customers" ADD CONSTRAINT "customers_other_id_pair" CHECK (("otherIdScheme" IS NULL) = ("otherId" IS NULL));
ALTER TABLE "customers" ADD CONSTRAINT "customers_other_id_alnum" CHECK ("otherId" IS NULL OR "otherId" ~ '^[A-Za-z0-9]+$');

-- الإلزام — بلا DEFAULT: الخادمُ يُلزَم أن يذكر الصفةَ في كل إنشاء.
ALTER TABLE "customers" ALTER COLUMN "kind" SET NOT NULL;
