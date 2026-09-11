-- طلبُ الحذف وقرارُه يبقيان بعد حذف المنشأة (ق-٥٣٧): الحذفُ صلبٌ (Cascade عبر هويّة الدخول)،
-- وكان الصفُّ الذي يشهد على قرار الإعدام يزول مع المنشأة نفسِها — فلا أثرَ لمن أذن به
-- إلا سطرُ تحذيرٍ في سجلّ خادم.
ALTER TABLE "account_deletion_requests" DROP CONSTRAINT "account_deletion_requests_companyId_fkey";

-- اسمُ المنشأة يُحفظ على الطلب — فالصفُّ الذي كان يُقرأ منه يزول مع الحذف.
ALTER TABLE "account_deletion_requests" ADD COLUMN "companyName" TEXT NOT NULL DEFAULT '';
-- ومن قرّر — معرّفُه واسمُه — يُكتب على القرار نفسه.
ALTER TABLE "account_deletion_requests" ADD COLUMN "decidedById" TEXT;
ALTER TABLE "account_deletion_requests" ADD COLUMN "decidedByName" TEXT;

-- ⚠️ الجدولُ ENABLE لا FORCE (استثناءٌ أبيض معلَن في rls-coverage: يُقرأ من لوحة المنصّة عبر المنشآت)،
--    و"companies" بلا RLS — فمالكُ الجدول يقرأ الكلَّ بلا رفع. حالُ الجدول قُرئت من القاعدة لا من عمومها (ق-٥٣٤).
UPDATE "account_deletion_requests" r
   SET "companyName" = c."orgName"
  FROM "companies" c
 WHERE c."id" = r."companyId";
