-- فئة الشراء تصير رمزاً — والقرار لا يُتَّخذ بنصٍّ عربيّ حرفاً بحرف.
--
-- العلّة التي تُغلق: `resolveAmortization` و`purchaseExpenseAccountCode` كانا يشذّبان
-- المسافات و`incorporationReport` لا يشذّب. ففاتورةٌ فئتها 'مصروفات تأسيس ' تمرّ من
-- فحص الإطفاء **وتغيب من تقرير التأسيس**. التعبئة أدناه تشذّب المخزَّن أيضاً، فلا
-- يبقى صفٌّ يحمل العلّة.
--
-- ⚠️ الهجرات تُنفَّذ بدور `app_user` وهو **خاضع لـRLS**، فأي UPDATE هنا يطابق **صفر
-- صفوف** بلا `app.company_id` — بلا خطأ ولا تحذير. ولذلك تُرفع `FORCE` أثناء التعبئة
-- ثم تُعاد؛ والدور يملك الجدول فتمرّ قراءتُه. (نفس نمط 20260803120000_structural_wave.)

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "categoryCode" TEXT;

ALTER TABLE "purchases" NO FORCE ROW LEVEL SECURITY;

-- ① اللافتة المخزَّنة تُشذَّب، فلا تبقى مسافةٌ تقرّر مصير فاتورة.
UPDATE "purchases"
SET "category" = btrim("category")
WHERE "category" IS NOT NULL AND "category" <> btrim("category");

-- ② الرمز يُشتقّ من اللافتة — واللافتات القديمة التي لم تعد الواجهة تعرضها
--    مشمولةٌ عمداً، فإسقاطها يرحّل صفوفها إلى المستقرّ `5300` بصمت.
UPDATE "purchases"
SET "categoryCode" = CASE btrim("category")
  WHEN 'كهرباء'          THEN 'POWER'
  WHEN 'مياه'            THEN 'WATER'
  WHEN 'اتصالات وإنترنت' THEN 'TELECOM'
  WHEN 'إيجار'           THEN 'RENT'
  WHEN 'رواتب'           THEN 'SALARIES'
  WHEN 'رواتب وأجور'     THEN 'SALARIES'
  WHEN 'تكلفة مبيعات'    THEN 'COGS'
  WHEN 'مواد خام'        THEN 'COGS'
  WHEN 'بضاعة'           THEN 'COGS'
  WHEN 'مصروفات تأسيس'   THEN 'FORMATION'
  WHEN 'مصروفات أخرى'    THEN 'OTHER'
  ELSE NULL
END
WHERE "categoryCode" IS NULL AND "category" IS NOT NULL;

ALTER TABLE "purchases" FORCE ROW LEVEL SECURITY;

-- فهرسٌ للقرارين اللذين يقرآن الرمز: تقرير التأسيس، وترحيل المصروف.
CREATE INDEX "purchases_companyId_categoryCode_idx" ON "purchases"("companyId", "categoryCode");
