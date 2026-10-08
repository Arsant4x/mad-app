-- ⚖️ توجيه ٢٨٧ — إعدادُ توقيع النماذج للمنشأة:
-- ① حدُّ نفاذ بقيمة الكيان بعملة الأساس (ق-١٦٣٣ ①ب · ق-١٦٣٥ ①): فارغٌ = لا يُشترط، بلا قيمةٍ افتراضية.
-- ② مدّةُ التوقيع لكلِّ نوع (ق-١٦٣٣ ⑬): صفٌّ لما غيّره التاجرُ وحدَه، وغيابُه = سبعةُ أيّام (في الشيفرة بحكم القرار).
--
-- ⚠️ لا DML: DDL محضة (ق-٢٦٢)، والعمودُ يُضاف فارغاً والجدولُ يُنشأ فارغاً.

ALTER TABLE "companies" ADD COLUMN "formsNafathThreshold" DECIMAL(18,2);
ALTER TABLE "companies" ADD CONSTRAINT "companies_forms_nafath_threshold_nonnegative" CHECK ("formsNafathThreshold" IS NULL OR "formsNafathThreshold" >= 0);

CREATE TABLE "form_type_settings" (
    "id"             TEXT NOT NULL,
    "companyId"      TEXT NOT NULL,
    "formTypeId"     TEXT NOT NULL,
    "signPeriodDays" INTEGER NOT NULL,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_type_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_type_settings_period_positive" CHECK ("signPeriodDays" >= 1)
);

CREATE UNIQUE INDEX "form_type_settings_companyId_formTypeId_key" ON "form_type_settings"("companyId", "formTypeId");
CREATE UNIQUE INDEX "form_type_settings_companyId_id_key" ON "form_type_settings"("companyId", "id");

ALTER TABLE "form_type_settings"
    ADD CONSTRAINT "form_type_settings_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_type_settings"
    ADD CONSTRAINT "form_type_settings_formTypeId_fkey"
    FOREIGN KEY ("formTypeId") REFERENCES "form_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ عزل المستأجر — الطبقة الثانية ═══
ALTER TABLE "form_type_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_type_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_type_settings ON "form_type_settings"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
