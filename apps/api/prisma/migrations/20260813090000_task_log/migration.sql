-- سجل المهام — يتبع قواعد سجل التفويض نفسها.
--
-- ⚠️ لماذا في القاعدة لا في الخدمة، والمهمة ليست مستند ZATCA:
--
-- المهمة نفسها ليست فاتورة ولا إشعاراً، فلا يحكمها الملحق (1) مباشرةً.
-- لكن **أثرها يصير نظامياً** عند نقطتين مسجَّلتين سلفاً:
--   • تقرير المرتجعات والتلف (SPEC 30.9) يوجب «**ومن سجّله**» — وسجل
--     المهام هو ما يجيب. فحذف صفٍّ منه يمحو إجابةً نظامية.
--   • وفصل المهام (30.7): الكاشير يسجّل ولا يقرّر التلف. وإثبات الفصل
--     أثرٌ لا سياسة — والأثر هنا.
--
-- ولو وُضع المنع في الخدمة لمرّ عليه `deleteMany` و`DELETE` خاماً والحذف
-- المتسلسل — وهي المسارات الثلاثة نفسها التي أثبتناها حيّاً على
-- `delegation_logs`. **ومنعٌ أضعف لمتطلبٍ واحد يدعو للتفارق**، فيُستعمل
-- المسار المُثبَت لا مسارٌ ثانٍ.

CREATE TABLE "task_logs" (
    "id"         TEXT NOT NULL,
    "companyId"  TEXT NOT NULL,
    "seq"        INTEGER NOT NULL,
    "taskId"     TEXT NOT NULL,
    "actorId"    TEXT NOT NULL,
    -- الانتقال كما وقع: من ← إلى. قائمة مغلقة في الشيفرة (`TASK_STATUSES`).
    "fromStatus" TEXT,
    "toStatus"   TEXT NOT NULL,
    "note"       TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- RESTRICT لا CASCADE — نفس حجّة سجل التفويض: حذف المنشأة لا يمحو سجلّها،
-- وهو حذفٌ لا يمرّ بأي دالة فلا يراه حارسٌ في الشيفرة.
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "task_logs_companyId_seq_key" ON "task_logs"("companyId", "seq");
CREATE INDEX "task_logs_companyId_taskId_idx" ON "task_logs"("companyId", "taskId");

-- ═══ الزمن من الخادم — يُدهس ما يرسله العميل ═══
-- `DEFAULT now()` وحده لا يكفي: قيمةٌ صريحة في INSERT تتجاوزه.
CREATE OR REPLACE FUNCTION task_logs_stamp_server_time() RETURNS trigger AS $$
BEGIN
    NEW."createdAt" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_logs_insert_guard
    BEFORE INSERT ON "task_logs"
    FOR EACH ROW EXECUTE FUNCTION task_logs_stamp_server_time();

-- ═══ ملحقٌ فقط: لا حذف ولا تعديل ═══
-- أشدّ من سجل التفويض: لا حتى «ختم». السجل وقائع لا حالات — والانتقال
-- التالي صفٌّ جديد لا تعديلٌ لسابقه.
CREATE OR REPLACE FUNCTION task_logs_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'سجل المهام ملحقٌ فقط — لا يُحذف منه صفّ.';
    END IF;
    RAISE EXCEPTION 'سجل المهام لا يُعدَّل — الانتقال التالي صفٌّ جديد.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_logs_append_only_guard
    BEFORE UPDATE OR DELETE ON "task_logs"
    FOR EACH ROW EXECUTE FUNCTION task_logs_append_only();

-- ═══ عزل المستأجر — ENABLE وFORCE معاً ═══
ALTER TABLE "task_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_task_logs ON "task_logs"
    USING ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
