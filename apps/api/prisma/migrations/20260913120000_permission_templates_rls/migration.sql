-- ق-٦٧٥ — المرحلة ③: permission_templates تحت عزل الصفوف بصياغته الفريدة ومسنَد الإدارة.
--
-- الجدولُ ثنائيُّ النطاق: قوالبُ عامّة بلا منشأة (companyId IS NULL) تراها كلُّ المنشآت
-- ويقرؤها التسجيلُ قبل أيّ سياق، وقوالبُ خاصّة لمنشأةٍ واحدة. فسياسةٌ ساذجة على
-- app.company_id تُخفي العامَّ وتكسر التسجيل — وكان ذلك عائقَ إطلاقٍ مسجَّلاً (KNOWN_WEAK).
--
--   USING      : العامُّ يُرى من كلّ سياقٍ ومن غير سياق · والخاصُّ لصاحبه · ومسنَدُ الإدارة يرى الكلَّ (إشرافاً).
--   WITH CHECK : المنشأةُ تكتب قوالبَها وحدَها · والعامُّ لا يُكتب إلا بمسنَد الإدارة
--                (app.platform_admin = 'true' — تضبطه معاملةُ مدير المنصّة بعد أن يثبت الحارسُ هويّتَه).
--
-- ⚠️ ليس مفتاحاً ثانياً لعزل المستأجر (ق-٦٦٤ (ج) المرفوض): المستأجرُ لا يملك ضبطَ المسنَد،
-- والمسنَدُ لا يفتح صفوفَ مستأجرٍ لمستأجرٍ آخر — هو مسارُ المنصّة الذي أُعلن دَيناً.
--
-- ⚠️ لا DML هنا: الصفوفُ القائمة لا تُمسّ. وهجرةٌ لاحقة تكتب قالباً عامّاً يجب أن تضبط
-- المسنَد في معاملتها (set_config('app.platform_admin', 'true', true)) وإلا رُفضت.
--
-- القياسُ الحيّ قبل نقل القراءات: 23/54 حمراء في e2e القوالب والتفويض والمنصّة
-- («new row violates row-level security policy for table "permission_templates"») — وبعده خضراء.

ALTER TABLE "permission_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permission_templates" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_permission_templates" ON "permission_templates";
CREATE POLICY "tenant_isolation_permission_templates" ON "permission_templates"
  USING (
    "companyId" IS NULL
    OR "companyId" = current_setting('app.company_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  )
  WITH CHECK (
    "companyId" = current_setting('app.company_id', true)
    OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')
  );
