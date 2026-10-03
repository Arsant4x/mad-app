-- ⚖️ محرّكُ النماذج المهيكلة — الموجةُ ١أ: أنواعُ النماذج والقوالبُ المُصدَّرة (توجيه ٢٧٨ · ق-١٦٣٤).
-- الخطّة: docs/plans/handover-forms-master-plan.md §٦.١ و§٦.٢ · والموجةُ صفر: handover-forms-wave-zero.md §١ (قرارُ الخطّة ٤٣).
--
-- ثلاثةُ جداول:
--   form_types           كتالوجُ المنصّة، بلا companyId ولا عزل: لا بياناتِ تاجرٍ فيه، والكتابةُ من لوحة المطوّر وحدَها.
--   form_templates       إصدارُ قالب: العامُّ (companyId فارغ) تملكه المنصّة، والنسخةُ (companyId مملوء) يملكها التاجر.
--   form_template_items  بنودُ الإصدار، companyId فيها يتبع قالبَها.
--
-- 🔴 العزلُ بصياغةٍ ثنائية النطاق، وفيها ما يزيد على صياغة permission_templates (ق-٦٧٥):
--   · سياسةُ الكتابة لكلِّ الأوامر: المنشأةُ على صفوفها، والعامُّ لمسنَد الإدارة وحدَه — وهي وحدَها تحكم الحذف،
--     فلا يحذف مستأجرٌ قالباً عامّاً ولو رآه. (وفي صياغة permission_templates الواحدة يرى المستأجرُ العامَّ في USING
--     فيبلغه الحذفُ في القاعدة، ويحميه التطبيقُ وحدَه.)
--   · وسياسةُ قراءةٍ للعامّ وحدَه (FOR SELECT): يراه كلُّ سياق ليُنسخ منه.
--   · ومسنَدُ الإدارة لا يقرأ نسخَ التجّار: قوالبُ المنشأة بياناتُها، والمنصّةُ تملك العامَّ فقط (CLAUDE.md §3.5).
--
-- ⚠️ لا DML هنا: الجداولُ جديدةٌ فارغة.

-- CreateEnum
CREATE TYPE "FormTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormItemType" AS ENUM ('CONDITION', 'QTY', 'NUMBER', 'METER_READING', 'TEMPERATURE', 'BOOLEAN', 'TEXT');

-- CreateTable
CREATE TABLE "form_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sector" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "formTypeId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "FormTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceTemplateId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id"),
    -- المسوّدةُ وحدَها بلا وقتِ نشر، وكلُّ ما نُشر يحمله.
    CONSTRAINT "form_templates_published_stamped" CHECK (("status" = 'DRAFT') = ("publishedAt" IS NULL)),
    CONSTRAINT "form_templates_version_positive" CHECK ("version" >= 1),
    -- النسخةُ للتاجر وحدَه: قالبُ المنصّة لا ينسخ من غيره.
    CONSTRAINT "form_templates_copy_is_company" CHECK ("sourceTemplateId" IS NULL OR "companyId" IS NOT NULL),
    CONSTRAINT "form_templates_name_present" CHECK (btrim("name") <> '')
);

-- CreateTable
CREATE TABLE "form_template_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "templateId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "itemType" "FormItemType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minValue" DECIMAL(18,4),
    "maxValue" DECIMAL(18,4),
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "helpText" TEXT,

    CONSTRAINT "form_template_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_template_items_line_positive" CHECK ("lineNo" >= 1),
    CONSTRAINT "form_template_items_label_present" CHECK (btrim("label") <> ''),
    CONSTRAINT "form_template_items_range_ordered" CHECK ("minValue" IS NULL OR "maxValue" IS NULL OR "minValue" <= "maxValue"),
    -- «يمنع الختم خارج النطاق» بلا نطاقٍ لا معنى له.
    CONSTRAINT "form_template_items_blocking_has_range" CHECK (NOT "isBlocking" OR "minValue" IS NOT NULL OR "maxValue" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "form_types_code_key" ON "form_types"("code");

-- CreateIndex
CREATE INDEX "form_templates_companyId_status_idx" ON "form_templates"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_familyId_version_key" ON "form_templates"("familyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_companyId_id_key" ON "form_templates"("companyId", "id");

-- مسوّدةٌ واحدة ومنشورٌ واحد لكلِّ قالب: نشرُ إصدارٍ يؤرشف ما قبله في المعاملة نفسِها، وطلبان معاً يصطدم ثانيهما هنا.
CREATE UNIQUE INDEX "form_templates_one_draft_per_family" ON "form_templates"("familyId") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "form_templates_one_published_per_family" ON "form_templates"("familyId") WHERE "status" = 'PUBLISHED';

-- CreateIndex
CREATE UNIQUE INDEX "form_template_items_templateId_lineNo_key" ON "form_template_items"("templateId", "lineNo");

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_formTypeId_fkey" FOREIGN KEY ("formTypeId") REFERENCES "form_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_template_items" ADD CONSTRAINT "form_template_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_template_items" ADD CONSTRAINT "form_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (ق-١٢٥٢ — المركّبُ بلا فعلٍ عند الحذف)
ALTER TABLE "form_template_items" ADD CONSTRAINT "form_template_items_companyId_templateId_fkey" FOREIGN KEY ("companyId", "templateId") REFERENCES "form_templates"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- RLS — form_templates
ALTER TABLE "form_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_form_templates" ON "form_templates"
  USING (
    "companyId" = current_setting('app.company_id', true)
    OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')
  )
  WITH CHECK (
    "companyId" = current_setting('app.company_id', true)
    OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')
  );

CREATE POLICY "public_read_form_templates" ON "form_templates"
  FOR SELECT
  USING ("companyId" IS NULL);

-- RLS — form_template_items
ALTER TABLE "form_template_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_template_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_form_template_items" ON "form_template_items"
  USING (
    "companyId" = current_setting('app.company_id', true)
    OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')
  )
  WITH CHECK (
    "companyId" = current_setting('app.company_id', true)
    OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')
  );

CREATE POLICY "public_read_form_template_items" ON "form_template_items"
  FOR SELECT
  USING ("companyId" IS NULL);
