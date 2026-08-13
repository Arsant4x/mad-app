-- ═══════════════════════════════════════════════════════════════════════
-- كيان المهمة — الجدول الذي كان ناقصاً
-- ═══════════════════════════════════════════════════════════════════════
--
-- المرحلة الثانية بنت **الأنواع والانتقالات** (`task-model.ts`) و**سجل
-- الانتقالات** (`task_logs`). و`task_logs` يحمل `taskId` ولا يحمل ما تعنيه
-- المهمة: لا عنوان ولا مكلَّف ولا مستند ولا موعد. فلا شيء يُقرأ منه ليُعرض
-- في لوحة «مهامي».
--
-- وهذا الجدول يحمل **الحالة الحاضرة**، والسجل يحمل **كيف وصلت إليها**.
-- والفصل مقصود: السجل ملحقٌ فقط لا يُعدَّل بحال (وقائع لا حالات)، والحالة
-- تتغيّر — فخلطُهما يفرض أحد الشرّين: سجلٌّ يُعدَّل، أو حالةٌ تُستنتج بقراءة
-- كل الانتقالات عند كل عرض.
--
-- ⚠️ ولا حقل `canOpenTarget` هنا **عمداً**: يُحسب عند القراءة من التقاطع
-- الحيّ. تخزينه يعني نسخةً تتقادم عند أول سحب — وهو بعينه العطل الذي
-- تجنّبه التقاطع أصلاً. وحارسٌ في `apps/web` وآخر في `apps/api` يمنعان
-- عودته.

CREATE TABLE "tasks" (
    "id"           TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "createdById"  TEXT NOT NULL,
    "assigneeId"   TEXT NOT NULL,
    -- الرابطة متعددة الأشكال: الشاشة من `ALLOWED_SCREENS` (قائمة مغلقة
    -- تُشتقّ في الشيفرة)، والمعرّف صفٌّ في تلك الشاشة. والاثنان معاً أو
    -- لا شيء — مهمةٌ بلا مستند مشروعة.
    "targetScreen" TEXT,
    "targetId"     TEXT,
    "status"       TEXT NOT NULL DEFAULT 'OPEN',
    "note"         TEXT,
    -- الروتينية: كل كم يوماً، ومن أي مرساة. و**الموعد يُحسب عند القراءة**
    -- (`currentDueDate`) لا بمهمةٍ خلفية — قرار المرحلة الثانية: وظيفةٌ
    -- دورية تصنع حالةً تختلف عن الحقيقة بين تشغيلين، فيصير «متى وُلِّدت»
    -- سؤالاً. والاشتقاق لا يعرف هذا السؤال.
    "recurEveryDays" INTEGER NOT NULL DEFAULT 0,
    "dueAnchor"      TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- ⚠️ RESTRICT لا CASCADE — نفس حجّة السجلّين: حذف المنشأة حذفٌ لا يمرّ بأي
-- دالة، فلا يراه حارسٌ في الشيفرة. و`task_logs` عليه RESTRICT أصلاً، فحذفُ
-- المنشأة مرفوضٌ من هناك على أي حال؛ وتركُ هذا CASCADE يجعل الجدولين
-- يختلفان في قاعدةٍ واحدة بلا سبب.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tasks_companyId_assigneeId_idx" ON "tasks"("companyId", "assigneeId");
CREATE INDEX "tasks_companyId_status_idx" ON "tasks"("companyId", "status");
CREATE INDEX "tasks_companyId_targetScreen_targetId_idx" ON "tasks"("companyId", "targetScreen", "targetId");

-- ═══ ① الرابطة كلٌّ أو لا شيء ═══
--
-- `targetScreen` بلا `targetId` يُنتج مهمةً «على شاشة العقود» بلا عقد —
-- فلا يُفتح شيء ولا يُقال لماذا. والعكس يُنتج معرّفاً بلا شاشةٍ تفسّره،
-- فيصير `canOpenTarget` غير قابلٍ للحساب أصلاً.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_target_both_or_neither"
    CHECK (("targetScreen" IS NULL) = ("targetId" IS NULL));

-- ═══ ② الحالة من القائمة المغلقة ═══
--
-- ⚠️ **في القاعدة لا في الشيفرة وحدها.** `TASK_STATUSES` تحرس ما يمرّ
-- بالخدمة؛ وهذا يحرس ما يصل بأي طريق — كتابةٌ خام، ترحيلٌ لاحق، سكربت
-- إصلاح. وحالةٌ مخترَعة تجعل `mayTransition` تُرجع `false` دائماً، فتصير
-- المهمة **عالقةً بلا رسالة**.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_closed_list"
    CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'));

-- ═══ ③ الروتينية متّسقة ═══
--
-- تكرارٌ موجب بلا مرساة يجعل `currentDueDate` بلا نقطة بدء.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_needs_anchor"
    CHECK ("recurEveryDays" <= 0 OR "dueAnchor" IS NOT NULL);

-- ═══ ④ عزل المستأجر — ENABLE وFORCE معاً ═══
-- FORCE شرطٌ لا تفصيل: مالك الجدول يتجاوز السياسة بدونه.
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tasks ON "tasks"
    USING ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ═══ ⑤ زمن التعديل من الخادم ═══
--
-- `DEFAULT now()` يحكم الإدراج وحده. والتعديل يحتاج مُشغِّلاً، وإلا بقي
-- `updatedAt` على زمن الإنشاء إلى الأبد — حقلٌ يبدو صادقاً وهو لا يتحرّك.
CREATE OR REPLACE FUNCTION tasks_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW."updatedAt" := now();
    -- ولا يُزوَّر زمن الإنشاء: العميل قد يرسله، والمُشغِّل يعيده.
    NEW."createdAt" := OLD."createdAt";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_touch_updated_at
    BEFORE UPDATE ON "tasks"
    FOR EACH ROW EXECUTE FUNCTION tasks_touch_updated_at();

CREATE OR REPLACE FUNCTION tasks_stamp_created_at() RETURNS trigger AS $$
BEGIN
    NEW."createdAt" := now();
    NEW."updatedAt" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_stamp_created_at
    BEFORE INSERT ON "tasks"
    FOR EACH ROW EXECUTE FUNCTION tasks_stamp_created_at();
