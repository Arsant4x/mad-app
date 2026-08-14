-- ═══════════════════════════════════════════════════════════════════════
-- قطاع النشاط — والترشيح **مطفأٌ حتى يختار المالك**
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️ `activityType` القديم **لا يُمسّ** (قرار المالك 2026-08-13). وهو نصٌّ
-- حرّ يقارَن به في مواضع قائمة، وتعديلُه يمسّ ما لم يُطلب.
--
-- ولا يُخلط بـ`Property.activityType`: ذاك **استعمال العقار**
-- (residential · shop · office · warehouse) ومحوره مختلف تماماً.

ALTER TABLE "business_activities" ADD COLUMN "sector" TEXT;

-- ⚠️ **حقلٌ منفصل عن `sector` عمداً.** المطابقة الآلية للنصّ الحرّ
-- **اقتراحٌ لا حكم**: «عقارات وتجارة» أو «مؤسسة الرياض» لا تُطابَق بثقة،
-- وخطأٌ واحد يُخفي شاشةً يعمل عليها تاجر. فالاقتراح يُكتب هنا، والمالك
-- يؤكّده فيُكتب في `sector`. وكتابتُهما في حقلٍ واحد تمحو الفرق بين
-- «رشّحه الحاسوب» و«أكّده الإنسان».
ALTER TABLE "business_activities" ADD COLUMN "sectorSuggested" TEXT;

-- ═══ التعطيل لا الحذف ═══
--
-- الشاشات تختفي و**البيانات تبقى كما هي**. وعقودُ منشأةٍ عطّلت «عقارات»
-- لا تُحذف ولا تُخفى من التقارير — تختفي شاشتها فقط. وإخفاؤها من التقارير
-- يجعل ميزان المراجعة يكذب.
ALTER TABLE "business_activities" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- ═══ القطاع من القائمة المغلقة — في القاعدة لا الشيفرة وحدها ═══
--
-- الشيفرة تحرس ما يمرّ بالخدمة؛ وهذا يحرس ما يصل بأي طريق. وقطاعٌ مخترَع
-- يجعل `screensFor` تتجاهله صامتاً، فتختفي شاشاتُ نشاطٍ قائم بلا رسالة.
ALTER TABLE "business_activities" ADD CONSTRAINT "business_activities_sector_closed_list"
    CHECK ("sector" IS NULL OR "sector" IN ('REALESTATE', 'RESTAURANT', 'RETAIL', 'PHARMACY', 'CONTRACTING', 'FREELANCE', 'OTHER'));

ALTER TABLE "business_activities" ADD CONSTRAINT "business_activities_sector_suggested_closed_list"
    CHECK ("sectorSuggested" IS NULL OR "sectorSuggested" IN ('REALESTATE', 'RESTAURANT', 'RETAIL', 'PHARMACY', 'CONTRACTING', 'FREELANCE', 'OTHER'));

-- ═══ النشاط الرئيسي — وهو مفتاح الترشيح كله ═══
--
-- ⚠️ **`NULL` يعني: لا ترشيح إطلاقاً.**
--
-- وهذا الجواب على «ماذا يحدث للمنشآت القائمة لحظة التطبيق؟»: كلها تستيقظ
-- غداً و**ترى ما كانت تراه بالضبط**، لأن العمود يبدأ فارغاً. والترشيح
-- يبدأ عند أول اختيارٍ صريح — لا قبله.
--
-- والاتجاه مقصود: النسيان يُنتج **شاشاتٍ زائدة** لا مفقودة. والزائدة
-- تُشتكى وتُصلَح؛ والمفقودة تُقرأ «تعطّلت المنصة».
--
-- ⚠️ ولا `DEFAULT` ولا `NOT NULL` — أيٌّ منهما يُشغّل الترشيح على منشأةٍ
-- لم تختر، وهو بالضبط ما يمنعه هذا التصميم.
ALTER TABLE "companies" ADD COLUMN "primaryActivityId" TEXT;

-- ⚠️ `ON DELETE SET NULL` لا CASCADE: حذف النشاط الرئيسي يجب أن يُعيد
-- المنشأة إلى «لا ترشيح» — لا أن يحذفها. والفشل هنا آمن: ترى الكل.
ALTER TABLE "companies" ADD CONSTRAINT "companies_primaryActivityId_fkey"
    FOREIGN KEY ("primaryActivityId") REFERENCES "business_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "business_activities_companyId_sector_idx" ON "business_activities"("companyId", "sector");
