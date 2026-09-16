-- ق-٩١٩ — علَمُ «قُدِّم» على ربع السنة: سطرٌ واحد يضعه التاجرُ بيده بعد تقديم الإقرار، ومعه
-- صافي الضريبة كما قُرئ لحظتَها — فتُعرض رسالةُ التصحيح (م٦٣) لمن قدّم وتغيّر رقمُه وحدَه، لا
-- لكلِّ ربعٍ تغيّر. لا كتابةَ بيانات (لا WARNING يلزم — ق-٦٩٥).

-- CreateTable
CREATE TABLE "vat_return_filings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "netVat" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vat_return_filings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vat_return_filings_companyId_year_quarter_key" ON "vat_return_filings"("companyId", "year", "quarter");

-- AddForeignKey
ALTER TABLE "vat_return_filings" ADD CONSTRAINT "vat_return_filings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security: عزلُ المستأجر بطبقته الثانية (§6.13 — تُكتب بيد دائماً) ──────
ALTER TABLE "vat_return_filings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vat_return_filings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vat_return_filings ON "vat_return_filings"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
