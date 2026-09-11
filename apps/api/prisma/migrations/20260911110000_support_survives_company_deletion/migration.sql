-- إذنُ الدعم وسجلُّه يبقيان بعد حذف المنشأة (ق-٥٣١): الحذفُ صلبٌ (Cascade عبر هويّة الدخول)،
-- وسجلُّ دخول المعالج إلى بيانات جهة التحكم يلزمه النظامُ (م٨ · م٣١) ولا يزول بزوال الصفّ.
ALTER TABLE "support_access_grants" DROP CONSTRAINT "support_access_grants_companyId_fkey";
ALTER TABLE "support_access_logs" DROP CONSTRAINT "support_access_logs_companyId_fkey";

-- اسمُ المنشأة يُحفظ على الإذن — فالصفُّ الذي كان يُقرأ منه يزول مع الحذف.
ALTER TABLE "support_access_grants" ADD COLUMN "companyName" TEXT NOT NULL DEFAULT '';
-- ⚠️ الجدولان ENABLE لا FORCE (استثناءٌ أبيض معلَن)، و"companies" بلا RLS — فمالكُ الجدول يقرأ الكلَّ بلا رفع.
UPDATE "support_access_grants" g
   SET "companyName" = c."orgName"
  FROM "companies" c
 WHERE c."id" = g."companyId";
