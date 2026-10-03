-- ⚖️ محرّكُ النماذج — الموجةُ ١ج: السجلُّ المعبّأ والختم (توجيه ٢٧٨ · ق-١٦٣٥ · ق-١٦٣٦).
--
--   form_instances  سجلٌّ معبّأ على إصدارٍ منشورٍ من قالب المنشأة (المركّبُ يمنع قالباً عامّاً أو قالبَ غيرها)،
--                   وختمُه: رقمُ FRM وموضعُه في سلسلة أختام المنشأة وبصمةُ السجلّ كلِّه وبصمةُ الختم السابق.
--   form_values     قيمةُ كلِّ بند.
--
-- 🔴 ③ب (ق-١٦٣٥، بحكم صاحب المشروع: «والنماذجُ المختومة تحميها قاعدةُ البيانات مع البرنامج»): مُشغِّلان يرفضان تعديلَ
--    المختوم وحذفَه، وكتابةَ قيمةٍ أو تعديلَها أو حذفَها تحت سجلٍّ مختوم — أيّاً كان المسار (البرنامج · SQL خام · حذفٌ متسلسل).
--    فمنشأةٌ لها سجلٌّ مختوم لا تُحذف حذفاً صلباً، كسجلّ المهام وسجلّ التفويض (ق-١١٠).
--
-- ⚠️ لا DML هنا: الجداولُ جديدةٌ فارغة، وفهرسُ (companyId, id) على بنود القالب قيدٌ على صفوفٍ فريدةِ المعرّف أصلاً.

-- CreateEnum
CREATE TYPE "FormInstanceStatus" AS ENUM ('DRAFT', 'SEALED');

-- CreateTable
CREATE TABLE "form_instances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "formDate" DATE NOT NULL,
    "status" "FormInstanceStatus" NOT NULL DEFAULT 'DRAFT',
    "filledById" TEXT NOT NULL,
    "filledByName" TEXT NOT NULL,
    "no" TEXT,
    "sealSeq" INTEGER,
    "contentHash" TEXT,
    "prevHash" TEXT,
    "sealedById" TEXT,
    "sealedByName" TEXT,
    "sealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_instances_pkey" PRIMARY KEY ("id"),
    -- المختومُ يحمل ختمَه كلَّه، والمسوّدةُ لا تحمل منه شيئاً.
    CONSTRAINT "form_instances_sealed_stamped" CHECK (
      ("status" = 'SEALED') = (
        "no" IS NOT NULL AND "sealSeq" IS NOT NULL AND "contentHash" IS NOT NULL
        AND "sealedAt" IS NOT NULL AND "sealedById" IS NOT NULL AND "sealedByName" IS NOT NULL
      )
    ),
    -- أوّلُ ختمٍ في المنشأة بلا سابق، وكلُّ ختمٍ بعده يحمل بصمةَ سابقه (ق-١٦٣٦ ب).
    CONSTRAINT "form_instances_chain_linked" CHECK ("sealSeq" IS NULL OR ("sealSeq" >= 1 AND ("sealSeq" = 1) = ("prevHash" IS NULL))),
    CONSTRAINT "form_instances_subject_present" CHECK (btrim("subjectType") <> '' AND btrim("subjectId") <> '')
);

-- CreateTable
CREATE TABLE "form_values" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DECIMAL(18,4),
    "boolValue" BOOLEAN,
    "note" TEXT,

    CONSTRAINT "form_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_instances_companyId_subjectType_subjectId_idx" ON "form_instances"("companyId", "subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "form_instances_companyId_id_key" ON "form_instances"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_instances_companyId_no_key" ON "form_instances"("companyId", "no");

-- CreateIndex
CREATE UNIQUE INDEX "form_instances_companyId_sealSeq_key" ON "form_instances"("companyId", "sealSeq");

-- CreateIndex
CREATE UNIQUE INDEX "form_values_instanceId_itemId_key" ON "form_values"("instanceId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "form_template_items_companyId_id_key" ON "form_template_items"("companyId", "id");

-- AddForeignKey
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (ق-١٢٥٢ — المركّبُ بلا فعلٍ عند الحذف)
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_companyId_templateId_fkey" FOREIGN KEY ("companyId", "templateId") REFERENCES "form_templates"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_values" ADD CONSTRAINT "form_values_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_values" ADD CONSTRAINT "form_values_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "form_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (ق-١٢٥٢)
ALTER TABLE "form_values" ADD CONSTRAINT "form_values_companyId_instanceId_fkey" FOREIGN KEY ("companyId", "instanceId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_values" ADD CONSTRAINT "form_values_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "form_template_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (ق-١٢٥٢)
ALTER TABLE "form_values" ADD CONSTRAINT "form_values_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "form_template_items"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ ③ب: المختومُ لا يُعدَّل ولا يُحذف — في القاعدة مع البرنامج (ق-١٦٣٥) ═══
CREATE OR REPLACE FUNCTION form_instances_sealed_guard() RETURNS trigger AS $$
BEGIN
    IF OLD."status" = 'SEALED' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'السجلُّ المختوم لا يُحذف، والتصحيحُ بنموذجٍ تصحيحيّ (ق-١٦٣٥).' USING ERRCODE = 'restrict_violation';
        END IF;
        RAISE EXCEPTION 'السجلُّ المختوم لا يُعدَّل (ق-١٦٣٥).' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_instances_sealed_guard
    BEFORE UPDATE OR DELETE ON "form_instances"
    FOR EACH ROW EXECUTE FUNCTION form_instances_sealed_guard();

-- وقيمُ السجلّ المختوم كذلك: لا تُكتب تحته قيمة، ولا تُعدَّل قيمتُه ولا تُحذف ولا تُنقل إلى سجلٍّ آخر.
CREATE OR REPLACE FUNCTION form_values_sealed_guard() RETURNS trigger AS $$
DECLARE
    sealed_parent boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM "form_instances" fi
         WHERE fi."status" = 'SEALED'
           AND fi."id" IN (
               CASE WHEN TG_OP <> 'INSERT' THEN OLD."instanceId" END,
               CASE WHEN TG_OP <> 'DELETE' THEN NEW."instanceId" END
           )
    ) INTO sealed_parent;
    IF sealed_parent THEN
        RAISE EXCEPTION 'قيمُ السجلّ المختوم لا تُكتب ولا تُعدَّل ولا تُحذف (ق-١٦٣٥).' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_values_sealed_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "form_values"
    FOR EACH ROW EXECUTE FUNCTION form_values_sealed_guard();

-- ═══ عزلُ المستأجر — ENABLE وFORCE معاً، بالسياسة القانونيّة ═══
ALTER TABLE "form_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_instances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_instances ON "form_instances"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "form_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_values" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_values ON "form_values"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
