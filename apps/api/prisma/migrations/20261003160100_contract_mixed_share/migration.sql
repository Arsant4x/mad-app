-- ⚖️ ق-١٦٠٠ · ق-١٦٠٩/د — العقدُ المختلطُ يُقسَّم داخلَه بنسبةٍ يعلنها المؤجّرُ بأساسه (السؤال ٤١٢، بحكم صاحب المشروع:
-- «نسبةٌ يعلنها المؤجّرُ بأساسه، ولا مساحةَ إلزامية»).
--
-- على العقد: نصيبُ المعفى بالمئة وأساسُه — إلزاميّان للمختلط وممنوعان لغيره، بقيدٍ مسمّى في القاعدة (الخادمُ يردّ قبله برسالة).
-- وعلى صفّ الاستحقاق: الجزءُ المعفى من الصافي للمختلط وحدَه، فيقرأ الإقرارُ الجزأين من الصفّ الذي رُحّل منه القيد.
--
-- لا كتابةَ بيانات: الأعمدةُ فارغةٌ للقائم كلِّه، ولا عقدَ مختلطاً قبل هذه الهجرة فالقيدان يصدقان عليه.

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "exemptSharePercent" DECIMAL(5,2),
ADD COLUMN "exemptShareBasis" TEXT;

-- AlterTable
ALTER TABLE "rent_accruals" ADD COLUMN "baseExemptNet" DECIMAL(18,2);

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_mixed_share_declared" CHECK (
  (
    "classification" = 'MIXED'
    AND "exemptSharePercent" IS NOT NULL AND "exemptSharePercent" > 0 AND "exemptSharePercent" < 100
    AND "exemptShareBasis" IS NOT NULL AND btrim("exemptShareBasis") <> ''
  )
  OR ("classification" <> 'MIXED' AND "exemptSharePercent" IS NULL AND "exemptShareBasis" IS NULL)
);

ALTER TABLE "rent_accruals" ADD CONSTRAINT "rent_accruals_exempt_part_mixed" CHECK (("classification" = 'MIXED') = ("baseExemptNet" IS NOT NULL));
