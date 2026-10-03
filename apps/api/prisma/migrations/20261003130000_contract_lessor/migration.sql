-- ⚖️ السؤال ٥٧٧ · ق-١٦٠٠ · ق-١٦٠٩/أ — من المؤجّرُ في عقد الإيجار، بحكم صاحب المشروع («يُبنى كما تقول الهيئة»).
--
-- الفيصلُ عند الهيئة باسم من يُبرم العقد: المنشأةُ مؤجّرةً (مالكةٌ أو مستأجرةٌ رئيساً أو مشغّلٌ وقّع مؤجّراً) فالإيجارُ
-- إيرادُها وضريبةُ التجاريّ عليها؛ أو المالكُ مؤجّراً والمنشأةُ وكيلٌ معلَن فالإيجارُ أمانةٌ له، والعمولةُ إيرادُها بضريبتها.
--
-- ⛔ لا افتراضَ صامت: عقدٌ قائم على عقار تشغيل (`managed`) لا يُعرف باسم من وُقّع، فيُعلَّم «قديمٌ لم يُعلَن مؤجّرُه»
-- ويُعدّ ويُصرخ به (WARNING لا NOTICE · ق-٦٩٥)، ويُعلنه التاجرُ بيدٍ من بطاقة العقد. وعقدٌ على مملوكٍ أو مستأجَرٍ رئيساً
-- مؤجّرُه المنشأةُ واقعةً (لا مالكَ غيرُها) فيُكتب `COMPANY`.
--
-- ⭐ والحبسُ في القاعدة كقيد التصنيف (ق-٨٩٨): القيمةُ القديمة لا تصحّ إلا لصفٍّ سبق لحظةَ هذه الهجرة، والمالكُ مؤجّراً
-- بلا اسمه مرفوض.
--
-- ⚠️ الجداولُ الثلاثة تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها (وإلا
-- أعاد ربطُ الوحدة بالعقار صفراً بلا خطأ، §8.5) ثم يُعاد. والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١).

-- CreateEnum
CREATE TYPE "ContractLessor" AS ENUM ('COMPANY', 'OWNER', 'LEGACY_UNDECLARED');

-- AlterTable — يُضاف قابلاً للفراغ لحظةً واحدة، ثم يُملأ، ثم يُلزَم.
ALTER TABLE "contracts" ADD COLUMN "lessor" "ContractLessor",
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "ownerVatNumber" TEXT;

-- AlterTable — العمولةُ على صفّ الدفعة لعقدٍ مؤجّرُه المالك، وفارغةٌ لغيره.
ALTER TABLE "rent_payments" ADD COLUMN "commissionRate" DECIMAL(5,2),
ADD COLUMN "baseOwnerVat" DECIMAL(18,2),
ADD COLUMN "baseCommission" DECIMAL(18,2),
ADD COLUMN "baseCommissionTax" DECIMAL(18,2),
ADD COLUMN "baseOwnerShare" DECIMAL(18,2);

ALTER TABLE "contracts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "properties" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_total   integer;
  n_legacy  integer;
  n_company integer;
  cutover   timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  SELECT count(*) INTO n_total FROM "contracts";

  UPDATE "contracts" c
     SET "lessor" = 'LEGACY_UNDECLARED'
    FROM "units" u
    JOIN "properties" p ON p."id" = u."propertyId"
   WHERE u."id" = c."unitId"
     AND p."ownership" = 'managed'
     AND c."lessor" IS NULL;
  GET DIAGNOSTICS n_legacy = ROW_COUNT;

  UPDATE "contracts" SET "lessor" = 'COMPANY' WHERE "lessor" IS NULL;
  GET DIAGNOSTICS n_company = ROW_COUNT;

  -- الحبس: القيمةُ القديمة لا تصحّ إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legacy_lessor_before_cutover" CHECK ("lessor" <> ''LEGACY_UNDECLARED'' OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'السؤال ٥٧٧ (ق-١٦٠٠): من % عقداً قائماً، % على عقار تشغيلٍ عُلِّم «قديمٌ لم يُعلَن مؤجّرُه» (يُعدّ ولا يُستحقّ حتى يُعلَن من بطاقة العقد) و% مؤجّرُه المنشأةُ واقعةً؛ والقيمةُ القديمة محبوسةٌ على ما سبق % (لحظة الهجرة، UTC)',
    n_total, n_legacy, n_company, cutover;
END $$;

ALTER TABLE "properties" FORCE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;

-- الإلزام — بلا DEFAULT: الخادمُ يذكر المؤجّرَ في كلِّ إنشاء.
ALTER TABLE "contracts" ALTER COLUMN "lessor" SET NOT NULL;

-- والمالكُ مؤجّراً يُسمّى — فالالتزامُ له يحتاج من يُدفع له.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_owner_lessor_named" CHECK ("lessor" <> 'OWNER' OR ("ownerName" IS NOT NULL AND btrim("ownerName") <> ''));
