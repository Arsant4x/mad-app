-- ⚖️ ق-٣٤٥ — الفجوةُ تُرى ولا تُصمت: كلُّ رقمٍ أُخذ من العدّاد صفٌّ، ويُختم «مستعمَلاً» في معاملة العمل
-- (شرطُ صاحب المشروع على ق-٣٤٤؛ بُني في توجيه ٢٨٦ بالقاعدة ٣٧، وكان ق-٣٤٤ قد بُني بدونه).
--
-- منفذُ العدّاد يزيد السلسلةَ ويكتب صفَّ الأخذ في جملةٍ واحدة على اتصاله القصير، ومعاملةُ العمل تختم
-- "usedAt" — فإن ارتدّت بقي الصفُّ «أُخذ ولم يُستعمل» بلا شيءٍ يُتذكَّر. والتقريرُ يقرأ ما بقي فارغاً.
--
-- ⚠️ لا DML على جدولٍ تحت FORCE: الإنشاءُ DDL محضة (ق-٢٦٢)، والجدولُ يُنشأ فارغاً؛ وما صدر قبله لا صفَّ له.

CREATE TABLE "document_number_allocations" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "year"        INTEGER NOT NULL,
    "number"      INTEGER NOT NULL,
    "no"          TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt"      TIMESTAMP(3),
    CONSTRAINT "document_number_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_number_allocations_companyId_kind_year_number_key"
    ON "document_number_allocations"("companyId", "kind", "year", "number");
CREATE INDEX "document_number_allocations_companyId_usedAt_idx"
    ON "document_number_allocations"("companyId", "usedAt");

ALTER TABLE "document_number_allocations"
    ADD CONSTRAINT "document_number_allocations_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ عزل المستأجر — الطبقة الثانية (rls-coverage.live.spec يوجبها لكل جدولٍ يملكه المستأجر) ═══
ALTER TABLE "document_number_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_number_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_document_number_allocations ON "document_number_allocations"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
