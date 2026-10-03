-- ⚖️ ق-١٦٠٠ · ق-١٦٠٩/د — المطالبةُ والخصمُ من التأمين بمعاملتهما الضريبية (الأسئلة ٤٩ و٥١ و٤١٣ و٤١٤، بحكم صاحب المشروع:
-- «خانةٌ عند كلِّ مطالبة، والافتراضُ خاضع» · «الضررُ والإيجارُ غيرُ المسدَّد كما هما، والنظافةُ والمرافقُ بحكم ٤٩ و٥١، و«أخرى» يُسأل عنها»).
--
-- ⛔ القديمُ يُعلَن ولا يُصحَّح رجعيّاً (ق-٨٩٨ بروحه): المطالباتُ القائمة رُحّلت إيراداً بلا ضريبة، فتُعلَّم `LEGACY_UNTAXED`
-- وتُعدّ ويُصرخ بها (WARNING لا NOTICE · ق-٦٩٥)؛ والخصوماتُ القائمة تبقى بلا معاملة (فارغة) كما رُحّلت. والقيمةُ القديمة
-- والفراغُ محبوسان بقيدَين على ما سبق لحظةَ هذه الهجرة، فلا يقبلهما صفٌّ جديد.
--
-- ⚠️ الجدولان تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها (وإلا أعاد العدُّ صفراً
-- بلا خطأ، §8.5) ثم يُعاد. والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١).

-- CreateEnum
CREATE TYPE "ChargeTaxTreatment" AS ENUM ('TAXABLE_SERVICE', 'ON_BEHALF', 'COMPENSATION', 'LEGACY_UNTAXED');

-- AlterTable — يُضاف قابلاً للفراغ لحظةً واحدة، ثم يُملأ، ثم يُلزَم.
ALTER TABLE "contract_claims" ADD COLUMN "taxTreatment" "ChargeTaxTreatment",
ADD COLUMN "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "baseTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "onBehalfEvidence" TEXT;

-- AlterTable
ALTER TABLE "deposit_deductions" ADD COLUMN "taxTreatment" "ChargeTaxTreatment",
ADD COLUMN "baseNet" DECIMAL(18,2),
ADD COLUMN "baseTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "onBehalfEvidence" TEXT;

ALTER TABLE "contract_claims" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "deposit_deductions" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_claims     integer;
  n_deductions integer;
  cutover      timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  UPDATE "contract_claims" SET "taxTreatment" = 'LEGACY_UNTAXED' WHERE "taxTreatment" IS NULL;
  GET DIAGNOSTICS n_claims = ROW_COUNT;

  SELECT count(*) INTO n_deductions FROM "deposit_deductions" WHERE "kind" IN ('CLEANING', 'UTILITIES', 'OTHER');

  -- الحبس: القيمةُ القديمة للمطالبة، والفراغُ لخصم النظافة والمرافق و«أخرى» — لا يصحّان إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_legacy_treatment_before_cutover" CHECK ("taxTreatment" <> ''LEGACY_UNTAXED'' OR "createdAt" < %L)',
    cutover
  );
  EXECUTE format(
    'ALTER TABLE "deposit_deductions" ADD CONSTRAINT "deposit_deductions_treatment_declared" CHECK ("taxTreatment" IS NOT NULL OR "kind" NOT IN (''CLEANING'', ''UTILITIES'', ''OTHER'') OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'الأسئلة ٥١ و٤١٣ و٤١٤ (ق-١٦٠٠): % مطالبةً قائمة عُلِّمت «قديمةٌ بلا ضريبة» (رُحّلت كذلك وتبقى)، و% خصماً قائماً من التأمين للنظافة أو المرافق أو «أخرى» بقي بلا معاملة كما رُحّل؛ والقديمُ محبوسٌ على ما سبق % (لحظة الهجرة، UTC)',
    n_claims, n_deductions, cutover;
END $$;

ALTER TABLE "deposit_deductions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contract_claims" FORCE ROW LEVEL SECURITY;

-- الإلزام — بلا DEFAULT: الخادمُ يكتب المعاملةَ في كلِّ إنشاء.
ALTER TABLE "contract_claims" ALTER COLUMN "taxTreatment" SET NOT NULL;

-- والنيابةُ تُثبَت: ما يثبت الشروطَ مكتوبٌ معها، وإلا فهي خدمةٌ خاضعة.
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_on_behalf_evidence" CHECK ("taxTreatment" <> 'ON_BEHALF' OR ("onBehalfEvidence" IS NOT NULL AND btrim("onBehalfEvidence") <> ''));
ALTER TABLE "deposit_deductions" ADD CONSTRAINT "deposit_deductions_on_behalf_evidence" CHECK ("taxTreatment" IS DISTINCT FROM 'ON_BEHALF' OR ("onBehalfEvidence" IS NOT NULL AND btrim("onBehalfEvidence") <> ''));
