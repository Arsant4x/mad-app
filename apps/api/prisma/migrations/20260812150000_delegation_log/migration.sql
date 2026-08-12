-- سجل التفويض — ملحقٌ فقط، والمنع في القاعدة لا في الخدمة.
--
-- ⚠️ لماذا هنا لا في TypeScript (القاعدة السابعة):
-- حارسٌ يفحص `DelegationLogService.remove()` لا يحرس شيئاً — يمرّ عليه
-- `prisma.delegationLog.deleteMany()`، و`DELETE` خاماً عبر `$executeRaw`،
-- و**الحذف المتسلسل** عبر `ON DELETE CASCADE`. وهذه المسارات الثلاثة
-- تلتقي كلها عند القاعدة، فالمنع يقع حيث تلتقي.
--
-- المصدر النصّي: الملحق (1) من قرار ZATCA، تحت
-- «Tampering of e-invoices or their associated notes or logs»:
--   • Allows for log modification/deletion
--   • Non-sequential log generation
--   • Generated with inaccurate timestamps

CREATE TABLE "delegation_logs" (
    "id"         TEXT NOT NULL,
    "companyId"  TEXT NOT NULL,
    -- تسلسل لكل منشأة، يبدأ من 1. الفهرس الفريد أدناه يمنع التكرار،
    -- وكاشف الفجوات يكشف القفز — وهما شيئان مختلفان.
    "seq"        INTEGER NOT NULL,
    "grantorId"  TEXT NOT NULL,
    "granteeId"  TEXT NOT NULL,
    -- عقدة الشجرة المفوَّضة: 'root' أو نطاق أو شاشة بعينها.
    "nodeKey"    TEXT NOT NULL,
    -- الأزواج الممنوحة صراحةً: شاشة:فعل.
    "grants"     TEXT[] NOT NULL,
    -- ACTIVE ⇒ SEALED ⇒ REVOKED. لا حالة أخرى ولا رجوع.
    "state"      TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT now(),
    "revokedAt"  TIMESTAMP(3),

    CONSTRAINT "delegation_logs_pkey" PRIMARY KEY ("id")
);

-- ⚠️ RESTRICT لا CASCADE: حذف المنشأة يجب ألّا يمحو سجلّها متسلسلاً —
-- وهو حذفٌ لا يمرّ بأي دالة، فلا يراه أي حارس في الشيفرة.
ALTER TABLE "delegation_logs" ADD CONSTRAINT "delegation_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- تسلسل فريد لكل منشأة.
CREATE UNIQUE INDEX "delegation_logs_companyId_seq_key" ON "delegation_logs"("companyId", "seq");
CREATE INDEX "delegation_logs_companyId_createdAt_idx" ON "delegation_logs"("companyId", "createdAt");

-- ═══ ① الزمن من الخادم — يُدهس ما يرسله العميل ═══
--
-- ⚠️ `DEFAULT now()` وحده لا يكفي: قيمةٌ صريحة في INSERT تتجاوزه. والعميل
-- يستطيع إرسال `createdAt` في الجسم فتصل Prisma فتُدرَج. فالدهس هنا هو
-- المنع الحقيقي — ومحظور `Time change` يوجبه.
CREATE OR REPLACE FUNCTION delegation_logs_stamp_server_time() RETURNS trigger AS $$
BEGIN
    NEW."createdAt" := now();
    IF NEW."revokedAt" IS NOT NULL THEN
        NEW."revokedAt" := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delegation_logs_insert_guard
    BEFORE INSERT ON "delegation_logs"
    FOR EACH ROW EXECUTE FUNCTION delegation_logs_stamp_server_time();

-- ═══ ② لا حذف، ولا تعديل إلا الختم ═══
CREATE OR REPLACE FUNCTION delegation_logs_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'سجل التفويض ملحقٌ فقط — لا يُحذف منه صفّ. السحب يُختم ولا يُمحى.';
    END IF;

    -- التعديل الوحيد المسموح: ختم صفٍّ فعّال بالسحب.
    IF OLD."state" <> 'SEALED' OR NEW."state" <> 'REVOKED' THEN
        IF OLD."state" <> 'ACTIVE' OR NEW."state" <> 'SEALED' THEN
            RAISE EXCEPTION 'سجل التفويض لا يُعدَّل — التغيير الوحيد المسموح هو ختم الصفّ.';
        END IF;
    END IF;

    -- ولا يُمسّ أيٌّ من هذه مهما كانت الحالة.
    IF NEW."id" <> OLD."id"
        OR NEW."companyId" <> OLD."companyId"
        OR NEW."seq" <> OLD."seq"
        OR NEW."grantorId" <> OLD."grantorId"
        OR NEW."granteeId" <> OLD."granteeId"
        OR NEW."nodeKey" <> OLD."nodeKey"
        OR NEW."createdAt" <> OLD."createdAt"
    THEN
        RAISE EXCEPTION 'سجل التفويض: هذه الحقول ثابتة ولا تُعدَّل بحال.';
    END IF;

    NEW."revokedAt" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delegation_logs_append_only_guard
    BEFORE UPDATE OR DELETE ON "delegation_logs"
    FOR EACH ROW EXECUTE FUNCTION delegation_logs_append_only();

-- ═══ ③ عزل المستأجر — ENABLE وFORCE معاً ═══
-- FORCE شرطٌ لا تفصيل: مالك الجدول يتجاوز السياسة بدونه.
ALTER TABLE "delegation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delegation_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_delegation_logs ON "delegation_logs"
    USING ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
