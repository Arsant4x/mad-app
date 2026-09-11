-- ═══ موافقةُ التاجر على المعالجين الفرعيين (ق-٥٨١ · ق-٥٨٩) ═══
--
-- اللائحةُ التنفيذية م١٧/٥/ج توجب **الموافقة المسبقة من جهة التحكم** قبل التعاقد مع
-- معالجٍ فرعيّ — **وجهةُ التحكم هي التاجر**. فثلاثةُ جداول: قائمةٌ · ونسخةٌ منشورةٌ منها
-- (فالموافقةُ على نصٍّ ثابتٍ لا على جدولٍ متحرّك) · وقبولٌ مؤرَّخٌ لكلِّ منشأة.
--
-- ⚠️ والأوّلان **جدولا منصّةٍ بلا `companyId`** — فلا عزلَ مستأجرٍ عليهما. والثالثُ
-- يملكه المستأجر، فيأخذ الطبقةَ الثانية كاملةً.
--
-- ⚠️ ولا `DML` على جدولٍ تحت `FORCE` (ق-٢٦٢): الإنشاءُ `DDL` محضة.

-- صنفُ إشعارٍ جديد للتذكير المتكرّر.
ALTER TYPE "NotificationKind" ADD VALUE 'SUBPROCESSOR_CONSENT';

CREATE TABLE "sub_processors" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "purpose"        TEXT NOT NULL,
    "location"       TEXT NOT NULL,
    "dataCategories" TEXT[],
    "addedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt"      TIMESTAMP(3),
    CONSTRAINT "sub_processors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sub_processor_list_versions" (
    "id"            TEXT NOT NULL,
    "version"       INTEGER NOT NULL,
    "publishedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "summary"       TEXT NOT NULL,
    "entries"       JSONB NOT NULL,
    CONSTRAINT "sub_processor_list_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sub_processor_list_versions_version_key"
    ON "sub_processor_list_versions"("version");

CREATE TABLE "processing_agreement_acceptances" (
    "id"             TEXT NOT NULL,
    "companyId"      TEXT NOT NULL,
    "version"        INTEGER NOT NULL,
    "acceptedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedById"   TEXT NOT NULL,
    "acceptedByName" TEXT NOT NULL,
    "ip"             TEXT,
    CONSTRAINT "processing_agreement_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processing_agreement_acceptances_companyId_version_key"
    ON "processing_agreement_acceptances"("companyId", "version");

ALTER TABLE "processing_agreement_acceptances"
    ADD CONSTRAINT "processing_agreement_acceptances_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `Restrict` عمداً: نسخةٌ وُوفق عليها لا تُحذف — فالقبولُ يشير إلى نصٍّ يجب أن يبقى مقروءاً.
ALTER TABLE "processing_agreement_acceptances"
    ADD CONSTRAINT "processing_agreement_acceptances_version_fkey"
    FOREIGN KEY ("version") REFERENCES "sub_processor_list_versions"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ عزل المستأجر — الطبقة الثانية (rls-coverage.live.spec توجبها لكل جدولٍ يملكه المستأجر) ═══
ALTER TABLE "processing_agreement_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processing_agreement_acceptances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_processing_agreement_acceptances ON "processing_agreement_acceptances"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- صورةُ آخر نسخةٍ قبِلها التاجر — تُقرأ في كلِّ طلبٍ بلا استعلامٍ ثانٍ.
ALTER TABLE "companies" ADD COLUMN "consentedListVersion" INTEGER;
