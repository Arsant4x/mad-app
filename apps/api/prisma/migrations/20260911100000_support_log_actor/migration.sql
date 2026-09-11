-- هويّةُ الداخل على سطر سجل الدعم (ق-٥٢٨): كان السطرُ يُنسب إلى طالب الإذن لا إلى من دخل به.
ALTER TABLE "support_access_logs" ADD COLUMN "actorId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "support_access_logs" ADD COLUMN "actorName" TEXT NOT NULL DEFAULT '';

-- تعبئةُ القائم من الإذن: قبل هذا العمود لم يكن يدخل بالإذن إلا طالبُه (مديرٌ واحد — مقيس).
-- ⚠️ الجدولان تحت ENABLE لا FORCE — استثناءٌ أبيض معلَنٌ بحجّته في rls-coverage
--    (مديرُ المنصّة يكتبهما خارج سياق مستأجر)، فمالكُ الجدول يقرأ كلَّ الصفوف هنا بلا رفعٍ.
--    ⛔ ولا يُكتب FORCE عليهما: أوّلُ صياغةٍ فعلت ذلك فكسرت كتابةَ المدير (42501) وأمسكتها الحزمة.
UPDATE "support_access_logs" l
   SET "actorId" = g."requestedById", "actorName" = g."requestedByName"
  FROM "support_access_grants" g
 WHERE g."id" = l."grantId";

-- الافتراضُ كان للتعبئة وحدها — السطرُ الجديد يحمل داخلَه دائماً.
ALTER TABLE "support_access_logs" ALTER COLUMN "actorId" DROP DEFAULT;
ALTER TABLE "support_access_logs" ALTER COLUMN "actorName" DROP DEFAULT;
