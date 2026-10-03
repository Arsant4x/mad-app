-- ⚖️ محرّكُ النماذج — الموجةُ ١ج: السجلُّ المعبّأ والختم (توجيه ٢٧٨ · ق-١٦٣٥ · ق-١٦٣٦)، بكيانات الخطّة §٦.١.
--
--   form_instances  FormInstance: سجلٌّ معبّأ على إصدارٍ منشورٍ من قالب المنشأة (templateVersionId، والمركّبُ يمنع قالباً عامّاً
--                   أو قالبَ غيرها)، وكيانُه المرتبط يكتبه النشاطُ الطالب بلا مفتاحٍ أجنبيّ (المحرّكُ لا يعرف نشاطاً).
--   form_values     FormValue: قيمةُ كلِّ بند.
--   form_seals      FormSeal: ختمُ السجلّ، رقمُ FRM وموضعُه في سلسلة أختام المنشأة وبصمةُ السجلّ كلِّه وبصمةُ الختم السابق.
--
-- 🔴 ③ب (ق-١٦٣٥، بحكم صاحب المشروع: «والنماذجُ المختومة تحميها قاعدةُ البيانات مع البرنامج»): ثلاثةُ مُشغِّلات —
--    الختمُ يُكتب مرّةً ولا يُعدَّل ولا يُحذف · السجلُّ المختوم لا يُعدَّل ولا يُحذف، ولا يصير مختوماً بلا ختمٍ مكتوب ·
--    ولا تُكتب قيمةٌ ولا تُعدَّل ولا تُحذف تحت سجلٍّ مختوم — أيّاً كان المسار (البرنامج · SQL خام · حذفٌ متسلسل).
--    فمنشأةٌ لها سجلٌّ مختوم لا تُحذف حذفاً صلباً، كسجلّ المهام وسجلّ التفويض (ق-١١٠).
--
-- ⚠️ لا DML هنا: الجداولُ جديدةٌ فارغة، وفهرسُ (companyId, id) على بنود القالب قيدٌ على صفوفٍ فريدةِ المعرّف أصلاً.

-- CreateEnum
CREATE TYPE "FormInstanceStatus" AS ENUM ('DRAFT', 'SEALED');

-- CreateTable
CREATE TABLE "form_instances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "linkedEntityType" TEXT NOT NULL,
    "linkedEntityId" TEXT NOT NULL,
    "formDate" DATE NOT NULL,
    "status" "FormInstanceStatus" NOT NULL DEFAULT 'DRAFT',
    "filledById" TEXT NOT NULL,
    "filledByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_instances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_instances_linked_entity_present" CHECK (btrim("linkedEntityType") <> '' AND btrim("linkedEntityId") <> '')
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

-- CreateTable
CREATE TABLE "form_seals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "sealSeq" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "prevHash" TEXT,
    "sealedById" TEXT NOT NULL,
    "sealedByName" TEXT NOT NULL,
    "sealedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_seals_pkey" PRIMARY KEY ("id"),
    -- أوّلُ ختمٍ في المنشأة بلا سابق، وكلُّ ختمٍ بعده يحمل بصمةَ سابقه (ق-١٦٣٦ ب).
    CONSTRAINT "form_seals_chain_linked" CHECK ("sealSeq" >= 1 AND ("sealSeq" = 1) = ("prevHash" IS NULL)),
    -- البصمةُ SHA-256 بالست عشريّ الصغير (ق-١٦٣٦ أ).
    CONSTRAINT "form_seals_hash_shape" CHECK ("contentHash" ~ '^[0-9a-f]{64}$' AND ("prevHash" IS NULL OR "prevHash" ~ '^[0-9a-f]{64}$'))
);

-- CreateIndex
CREATE INDEX "form_instances_companyId_linkedEntityType_linkedEntityId_idx" ON "form_instances"("companyId", "linkedEntityType", "linkedEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "form_instances_companyId_id_key" ON "form_instances"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_values_instanceId_itemId_key" ON "form_values"("instanceId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "form_seals_instanceId_key" ON "form_seals"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "form_seals_companyId_instanceId_key" ON "form_seals"("companyId", "instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "form_seals_companyId_no_key" ON "form_seals"("companyId", "no");

-- CreateIndex
CREATE UNIQUE INDEX "form_seals_companyId_sealSeq_key" ON "form_seals"("companyId", "sealSeq");

-- CreateIndex
CREATE UNIQUE INDEX "form_template_items_companyId_id_key" ON "form_template_items"("companyId", "id");

-- AddForeignKey
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (ق-١٢٥٢ — المركّبُ بلا فعلٍ عند الحذف)
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_companyId_templateVersionId_fkey" FOREIGN KEY ("companyId", "templateVersionId") REFERENCES "form_templates"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

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

-- AddForeignKey
ALTER TABLE "form_seals" ADD CONSTRAINT "form_seals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_seals" ADD CONSTRAINT "form_seals_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "form_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (ق-١٢٥٢)
ALTER TABLE "form_seals" ADD CONSTRAINT "form_seals_companyId_instanceId_fkey" FOREIGN KEY ("companyId", "instanceId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ ③ب: الختمُ والمختومُ لا يُعدَّلان ولا يُحذفان — في القاعدة مع البرنامج (ق-١٦٣٥) ═══

-- الختمُ يُكتب مرّةً: لا تعديلَ ولا حذف، ولا بمسارٍ متسلسل.
CREATE OR REPLACE FUNCTION form_seals_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'الختمُ لا يُعدَّل ولا يُحذف (ق-١٦٣٥).' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_seals_append_only
    BEFORE UPDATE OR DELETE ON "form_seals"
    FOR EACH ROW EXECUTE FUNCTION form_seals_append_only();

-- السجلُّ المختوم لا يُعدَّل ولا يُحذف، والمسوّدةُ لا تصير مختومةً إلا وختمُها مكتوب.
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
    IF NEW."status" = 'SEALED' AND NOT EXISTS (SELECT 1 FROM "form_seals" fs WHERE fs."instanceId" = NEW."id") THEN
        RAISE EXCEPTION 'لا يُختم السجلُّ بلا ختمٍ مكتوب (ق-١٦٣٦).' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_instances_sealed_guard
    BEFORE UPDATE OR DELETE ON "form_instances"
    FOR EACH ROW EXECUTE FUNCTION form_instances_sealed_guard();

-- والسجلُّ لا يُنشأ مختوماً أصلاً (فلا ختمَ قبله).
CREATE OR REPLACE FUNCTION form_instances_born_draft() RETURNS trigger AS $$
BEGIN
    IF NEW."status" <> 'DRAFT' THEN
        RAISE EXCEPTION 'السجلُّ يُنشأ مسوّدةً ثم يُختم (ق-١٦٣٦).' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_instances_born_draft
    BEFORE INSERT ON "form_instances"
    FOR EACH ROW EXECUTE FUNCTION form_instances_born_draft();

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

ALTER TABLE "form_seals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_seals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_seals ON "form_seals"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
