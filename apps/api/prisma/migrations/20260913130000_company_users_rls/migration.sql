-- ق-٦٧٥ — المرحلة ④: company_users وcompany_user_branches معاً تحت عزل الصفوف.
--
-- معاً لأن الثاني يُبلَغ عبر الأول (ق-٦٥٣): FORCE على الفروع بلا سياقٍ في قراءة الحارس
-- كان يجعل كلَّ موظّفٍ «بلا تضييق» — وقد نُقلت القراءاتُ كلُّها إلى سياقها في ① (ق-٦٥٧)،
-- ومسارُ الدخول في ② (ق-٦٦٦)، فلم يبقَ قارئٌ بلا سياق: القياسُ قبل هذه الهجرة بالسياستين
-- نفسِهما طُعماً: e2e كاملة 617/618 — والساقطُ الوحيد حارسُ الصدق الذي يقول إن الجدول لم
-- يعد «غيرَ محميّ».
--
--   company_users        : USING الصفُّ لمنشأة السياق — أو مسنَدُ الإدارة (عدُّ الحسابات الراكبة على
--                          قالبٍ عامٍّ عند حذفه، ق-٦٦٢) · WITH CHECK لمنشأة السياق وحدَها.
--   company_user_branches: بلا companyId — يُرى ويُكتب عبر أبيه (EXISTS على company_users).
--
-- ⚠️ لا DML هنا. والمفاتيحُ الأجنبية (تسلسلُ الحذف من companies وlogin_identities) تتجاوز
-- عزلَ الصفوف بطبيعتها فلا تتأثّر.

ALTER TABLE "company_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_company_users" ON "company_users";
CREATE POLICY "tenant_isolation_company_users" ON "company_users"
  USING (
    "companyId" = current_setting('app.company_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  )
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "company_user_branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_user_branches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_company_user_branches" ON "company_user_branches";
CREATE POLICY "tenant_isolation_company_user_branches" ON "company_user_branches"
  USING (EXISTS (
    SELECT 1 FROM "company_users" cu
     WHERE cu."id" = "company_user_branches"."companyUserId"
       AND cu."companyId" = current_setting('app.company_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "company_users" cu
     WHERE cu."id" = "company_user_branches"."companyUserId"
       AND cu."companyId" = current_setting('app.company_id', true)
  ));
