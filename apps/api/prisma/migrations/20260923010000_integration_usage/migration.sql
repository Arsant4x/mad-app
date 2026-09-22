-- قياسُ استعمال التكاملات وحصّتُه (ق-١٢٩١ · ي/㉑A1).
--
-- ولا كتابةَ بيانات هنا: جدولٌ جديد وعمودٌ يقبل العدم — فلا `RAISE WARNING` (ق-٦٩١).

ALTER TABLE "companies" ADD COLUMN "apiMonthlyQuota" INTEGER;

CREATE TABLE "integration_usage" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "lastAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "integration_usage_pkey" PRIMARY KEY ("id")
);

-- المفتاحُ الطبيعيّ: منشأةٌ ونوعٌ وشهر — وبه يُزاد العدُّ ذرّياً في عبارةٍ واحدة.
CREATE UNIQUE INDEX "integration_usage_companyId_kind_period_key"
  ON "integration_usage"("companyId", "kind", "period");

ALTER TABLE "integration_usage" ADD CONSTRAINT "integration_usage_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- عزلُ الصفوف — يُكتب بيدٍ دائماً (CLAUDE §6.13).
ALTER TABLE "integration_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_usage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_integration_usage ON "integration_usage"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
