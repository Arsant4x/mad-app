-- ق-٦٢١ — ثقبُ الاعتماد الذاتيّ في الإجازات يُسدّ بالشكل نفسِه الذي في الشطب.
--
-- أربعةُ حقولٍ على الصفّ: من قدّم ومن قرّر، **بهويّة الفاعل لا بهويّة الموظَّف**
-- (فـ`employees` لا يرتبط بـ`login_identities` بأيّ حقل، ومقارنةُ المقرِّر
-- بـ`employeeId` مقارنةُ فضاءَي هويّةٍ مختلفَين).
--
-- ⚠️ وكلُّها `NULL`-قابلة عمداً: الصفوفُ القائمة لا تحمل قائلاً، **وفراغُها
-- «غيرُ معلوم» فلا يُقارَن** — ولا تُملأ رجعياً بترجيح.
ALTER TABLE "leave_requests" ADD COLUMN "requestedById" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN "requestedByName" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN "decidedById" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN "decidedByName" TEXT;

-- والإعدادُ مطفأٌ افتراضياً — **بالبنية**: منشأةٌ تُنشأ بفاعلٍ واحدٍ هو المالك،
-- فمن قدّم هو من يبتّ بالضرورة، ومنعٌ دائمٌ يعطّل الميزة فيها. ويُسنده عددٌ
-- (٤٩٣ من ٥١٢ في قاعدة التطوير) **بحدّه**: قاعدةُ التطوير ليست عيّنةَ عملاء.
ALTER TABLE "companies" ADD COLUMN "leaveApprovalRequiresTwoPersons" BOOLEAN NOT NULL DEFAULT false;
