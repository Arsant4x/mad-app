-- ⑥A3 (`ق-١٣٢٥`) — الرصيدُ المرحَّل وتصحيحُ الإقرارات (اللائحةُ التنفيذية م٦٢/٢/ي · م٦٣).

-- ① الترحيلُ هو الأصل، والردُّ طلبٌ يُعلنه التاجر:
--    «may request excess Tax to be refunded, otherwise excess Tax will be carried forward».
ALTER TABLE "vat_return_filings" ADD COLUMN "refundRequested" BOOLEAN NOT NULL DEFAULT false;

DO $$
DECLARE
  c RECORD;
  k INTEGER;
  companies_n INTEGER := 0;
  filings INTEGER := 0;
  refunds INTEGER := 0;
BEGIN
  -- ⚠️ العدُّ داخلَ سياق كلِّ منشأة — الجدولُ تحت `FORCE`، وعدٌّ بلا سياقٍ يرى صفراً (`ق-١١٧٨`).
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);
    SELECT count(*) INTO k FROM "vat_return_filings";
    filings := filings + k;
    SELECT count(*) INTO k FROM "vat_return_filings" WHERE "netVat" < 0;
    refunds := refunds + k;
  END LOOP;

  RAISE WARNING 'ق-١٣٢٥: % منشأة — وسومُ تقديمٍ قائمة: % (منها % بفائضٍ مستردّ). وكلُّها تأخذ «يُرحَّل» افتراضاً، وهو حكمُ النصّ حين لا يُطلب الردّ',
    companies_n, filings, refunds;
END $$;

-- ② تصحيحُ إقرارٍ سابق من خلال إقرارٍ لاحق (م٦٣/٢–٣).
CREATE TABLE "vat_return_corrections" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "year"       INTEGER NOT NULL,
  "periodType" "VatPeriod" NOT NULL,
  "periodNo"   INTEGER NOT NULL,
  "correctedYear"       INTEGER NOT NULL,
  "correctedPeriodType" "VatPeriod" NOT NULL,
  "correctedPeriodNo"   INTEGER NOT NULL,
  "amount"     DECIMAL(18,2) NOT NULL,
  "reason"     TEXT NOT NULL,
  "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vat_return_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vat_return_corrections_companyId_year_periodType_periodNo_idx"
  ON "vat_return_corrections" ("companyId", "year", "periodType", "periodNo");

ALTER TABLE "vat_return_corrections"
  ADD CONSTRAINT "vat_return_corrections_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- وأرقامُ الفترتين محصورةٌ بنوعيهما في القاعدة — كما في وسم التقديم.
ALTER TABLE "vat_return_corrections" ADD CONSTRAINT "vat_return_corrections_period_no_range"
  CHECK (
    (("periodType" = 'QUARTERLY' AND "periodNo" BETWEEN 1 AND 4) OR ("periodType" = 'MONTHLY' AND "periodNo" BETWEEN 1 AND 12))
    AND (("correctedPeriodType" = 'QUARTERLY' AND "correctedPeriodNo" BETWEEN 1 AND 4) OR ("correctedPeriodType" = 'MONTHLY' AND "correctedPeriodNo" BETWEEN 1 AND 12))
  );

-- ⛔ **والتصحيحُ لا يكون بصفر** — صفٌّ بلا أثرٍ يُثقل الإقرار ولا يقول شيئاً.
ALTER TABLE "vat_return_corrections" ADD CONSTRAINT "vat_return_corrections_amount_not_zero"
  CHECK ("amount" <> 0);

-- 🔒 عزلُ الصفوف بطبقتين (`§6.13`).
ALTER TABLE "vat_return_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vat_return_corrections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vat_return_corrections ON "vat_return_corrections"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
