-- ⚖️ ق-١٦٠١ · ق-١٦٠٩/ج — الموظّفُ الجديد يبدأ بلا شاشات، بحكم صاحب المشروع («قالبٌ «بلا شاشات» اختيارٌ مسبق»).
--
-- علَمٌ معلَن على القالب (`isNewUserDefault`) لا اسمٌ يُطابَق، وقالبٌ عامٌّ واحدٌ «بلا شاشات» يُزرع هنا فيوجد في كلِّ قاعدة: قاعدةٌ
-- جديدة وقاعدةُ التطوير والمنشورُ حين يُنشر، لا عند تمهيدٍ قد لا يُشغَّل. وفهرسٌ جزئيٌّ فريد يحبسه واحداً.
--
-- ⛔ والقائمون لا يُمسّون (الحكم): لا يُنقل موظّفٌ عن قالبه، ولا يُغيَّر قالبٌ قائم — الهجرةُ تُضيف ولا تُعدّل.
--
-- ⚠️ الجدولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): السياسةُ تقصر كتابةَ القالب العامّ على مسنَد الإدارة، فيُرفع FORCE مؤقّتاً
-- ثم يُعاد. والزرعُ يُعلَن عدُّه (WARNING لا NOTICE · ق-٦٩٥)، وصفرٌ حين يوجد القالبُ قبلُ.

-- AlterTable
ALTER TABLE "permission_templates" ADD COLUMN "isNewUserDefault" BOOLEAN NOT NULL DEFAULT false;

-- واحدٌ في المنصّة.
CREATE UNIQUE INDEX "permission_templates_new_user_default_key" ON "permission_templates" ("isNewUserDefault") WHERE "isNewUserDefault";

ALTER TABLE "permission_templates" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_seeded integer;
BEGIN
  INSERT INTO "permission_templates" ("id", "companyId", "name", "isSystem", "isAllScreens", "isNewUserDefault", "allowedScreens", "screenActions", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, NULL, 'موظّفٌ جديد (بلا شاشات)', false, false, true, '{}'::text[], NULL, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "permission_templates" WHERE "isNewUserDefault");
  GET DIAGNOSTICS n_seeded = ROW_COUNT;

  RAISE WARNING 'ق-١٦٠١: زُرع % قالبٌ عامٌّ «بلا شاشات» للموظّف الجديد؛ والموظّفون القائمون وقوالبُهم لم تُمسّ', n_seeded;
END $$;

ALTER TABLE "permission_templates" FORCE ROW LEVEL SECURITY;
