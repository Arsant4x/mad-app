-- قيدُ إقفال السنة المالية (`ق-١٢٨٣` · د/③ · التوجيه ٢٥٢).
--
-- `closingForFiscalYearId` يسِم القيدَ بأنه **قيدُ إقفال سنةٍ بعينها** — ومنه
-- يُعرف «أمقفلةٌ هي؟» (قيدُ إقفالٍ لم يُعكس)، وبه **وحدَه** يُسمح بالترحيل داخل
-- فترةٍ مقفلة: فالإقفالُ يقع **لأنها أُقفلت**، لا رغم ذلك.
--
-- والقيدان اثنان كما يقضي `ق-١٢٥٢`: مفردٌ يحمل الفعلَ عند الحذف، ومركّبٌ
-- `(companyId, id)` يمنع الإشارةَ عبر المنشآت — فلا يُقفَل عامُ منشأةٍ بقيدِ أخرى.
--
-- ولا يُكتب صفٌّ واحد هنا: عمودٌ فارغٌ يُملأ بالتشغيل — فلا `RAISE WARNING` (`§8.28`).

ALTER TABLE "journal_entries" ADD COLUMN "closingForFiscalYearId" TEXT;

CREATE INDEX "journal_entries_closingForFiscalYearId_idx" ON "journal_entries"("closingForFiscalYearId");

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_closingForFiscalYearId_fkey"
  FOREIGN KEY ("closingForFiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_closingForFiscalYearId_fkey"
  FOREIGN KEY ("companyId", "closingForFiscalYearId") REFERENCES "fiscal_years"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
