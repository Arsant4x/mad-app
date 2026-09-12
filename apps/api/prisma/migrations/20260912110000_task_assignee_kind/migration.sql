-- ق-٦٣٩ — وسمُ المكلَّف في المهامّ: عمودٌ وهجرة، محصورٌ في المهامّ، لا يمسّ هويّةَ الدخول.
--
-- assigneeId كان حقلاً نصّياً بلا مفتاحٍ أجنبيّ يقبل معرّفَ حسابٍ فرعيٍّ وحدَه (يُتحقَّق منه في
-- الخدمة). والمالكُ profileId له معرّفُ المنشأة — فلم يكن مكلَّفاً ممكناً، وكانت «مهامي»
-- والعدّادان فارغَين له بنيوياً. وقبولُ معرّفِ المنشأة في الحقل نفسِه بلا وسمٍ هو الحقلُ
-- المتعدّدُ الشكل (ق-٦٢٩) من بابٍ آخر، وصفٌّ للمالك في company_users سقط بالرقم (ق-٦٣٩).
-- فالوسمُ: يقول أيَّ فضاءٍ يحمل assigneeId — OWNER ⇒ معرّفُ المنشأة، USER ⇒ معرّفُ حسابٍ فرعيّ.
CREATE TYPE "TaskAssigneeKind" AS ENUM ('OWNER', 'USER');
ALTER TABLE "tasks" ADD COLUMN "assigneeKind" "TaskAssigneeKind";

-- ⚠️ تعبئةٌ معلَنةٌ لا افتراضٌ صامت (شرطُ المالك الأول): كلُّ مكلَّفٍ قائمٍ حسابٌ فرعيٌّ —
-- مقيسٌ يوم 2026-09-12 (صفرُ صفوفٍ assigneeId = companyId على ١٠٣ مهامّ)، والخدمةُ لم تقبل
-- غيرَه قطّ. فتُوسَم الصفوفُ القائمة USER صراحةً هنا، ويصير العمودُ إلزامياً بلا DEFAULT —
-- فصفٌّ قادمٌ بلا وسمٍ يُرفض في القاعدة لا يُملأ بالظنّ.
--
-- و"tasks" تحت FORCE ROW LEVEL SECURITY والهجرةُ تعمل بلا app.company_id — فـUPDATE عاديٌّ
-- يطابق صفرَ صفوفٍ صامتاً (ق-٢٦٢). يُرفع FORCE لهذه الجملة وحدَها ثم يُعاد (سابقةُ accounts).
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;
UPDATE "tasks" SET "assigneeKind" = 'USER' WHERE "assigneeKind" IS NULL;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;

ALTER TABLE "tasks" ALTER COLUMN "assigneeKind" SET NOT NULL;

-- وقيدٌ في القاعدة يلتقي عنده كلُّ مسارات الكتابة: المالكُ مكلَّفٌ ⇔ assigneeId هو المنشأةُ نفسُها.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_assignee_is_company"
  CHECK ("assigneeKind" <> 'OWNER' OR "assigneeId" = "companyId");

-- والفهرسُ الذي تقرأ به «مهامي» — بالوسم والمعرّف معاً.
CREATE INDEX "tasks_companyId_assigneeKind_assigneeId_idx" ON "tasks"("companyId", "assigneeKind", "assigneeId");
