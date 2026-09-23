-- ⚖️ ق-١٣٣٠ · ق-١٣٤٢ — ضريبةُ المدخلات غيرُ القابلة للخصم تدخل تكلفةَ ما اشتُري.
--
-- بنصّ المالك: «وهو حكمُ المعايير نصّاً: الضرائبُ غيرُ المستردّة جزءٌ من تكلفة الشراء» — و«يرث قاعدةَ الانتشار
-- القائمة بعينها، ولا منطقَ جديد. ما على الرفّ يرفع تكلفةَ الطبقة، وما استُهلك إلى تكلفة المبيعات في فترة الحدث».
--
-- ما كان: ضريبةُ الشراء كلُّها إلى 1250، والمنسوبُ إلى المعفى منها **لا يُستردّ** — فيبقى رصيدُ 1250 أعلى مما يُستردّ،
-- والإقرارُ يُعلن الفرقَ حدّاً (NON_DEDUCTIBLE_INPUT_VAT_NOT_POSTED). ما صار: لكلِّ مستندٍ **منسوبٍ إلى المعفى وحدَه**
-- (EXEMPT_ONLY) حدثٌ عند الشراء نفسِه يُخرج حصّةَ كلِّ سطرٍ إلى موضعها: الطبقة (الرفُّ يرفع تكلفتَها، والمستهلَكُ إلى
-- 5100) · وسيطُ الاستلام (مفوتَرٌ لم يُستلم، ينتظر طبقتَه) · حسابُ الفئة (بندٌ خدميّ) · 5100 (بضاعةٌ أُعيدت إلى المورّد).
-- ⛔ والمشتركُ (MIXED) لا يُرحَّل — محبوسٌ على قرارٍ لم يُحسم.
--
-- **القائمُ يُعدّ ويُعلَن ولا يُحوَّل** (ق-١١٧٨): العمودُ nonDeductibleTracked يُضاف بافتراضٍ false فيأخذه كلُّ مستندٍ
-- قائم — بلا عبارةِ كتابة — ثم يصير افتراضُه true للجديد. والعدُّ داخل سياق كلِّ منشأة (purchases تحت FORCE،
-- والعدُّ بلا سياقٍ يرى صفراً على جدولٍ مملوء — ق-١٣٢٥).
--
-- ⚠️ الجدولان تحت FORCE (ق-٦٩١) — كتلةُ RLS بيدٍ لأن Prisma لا تعبّر عنها (§6.13).

-- ═══ الشراء: هل يُرحَّل غيرُ القابل للخصم لهذا المستند؟ ═══
ALTER TABLE "purchases" ADD COLUMN "nonDeductibleTracked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "purchases" ALTER COLUMN "nonDeductibleTracked" SET DEFAULT true;

DO $$
DECLARE
  c RECORD;
  k INTEGER;
  v NUMERIC;
  companies_n INTEGER := 0;
  exempt_only INTEGER := 0;
  exempt_only_vat NUMERIC := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*), COALESCE(sum("baseTaxAmount"), 0) INTO k, v
      FROM "purchases"
     WHERE "inputVatUse" = 'EXEMPT_ONLY' AND "baseTaxAmount" > 0 AND "voidedAt" IS NULL;
    exempt_only := exempt_only + k;
    exempt_only_vat := exempt_only_vat + v;
  END LOOP;

  IF exempt_only = 0 THEN
    RAISE WARNING 'ق-١٣٤٢: % منشأة — لا مستندَ قائمٌ منسوبٌ إلى المعفى وحدَه بضريبة: لا قائمَ يُعلَن', companies_n;
  ELSE
    RAISE WARNING 'ق-١٣٤٢: % منشأة — مستنداتٌ قائمة منسوبةٌ إلى المعفى وحدَه (EXEMPT_ONLY) بضريبة: % بمجموع % — تبقى في 1250 ولا تُحوَّل، ويعدّها الإقرارُ غيرَ مرحَّلة',
      companies_n, exempt_only, exempt_only_vat;
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "NonDeductibleVatTrigger" AS ENUM ('PURCHASE', 'PURCHASE_EDIT', 'PURCHASE_VOID', 'RECEIPT', 'RECEIPT_VOID', 'SUPPLIER_NOTE');
CREATE TYPE "NonDeductibleVatPlacement" AS ENUM ('LAYER', 'CLEARING', 'EXPENSE', 'COGS');

-- CreateTable
CREATE TABLE "non_deductible_vat_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "trigger" "NonDeductibleVatTrigger" NOT NULL,
    "date" DATE NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "baseInventory" DECIMAL(18,2) NOT NULL,
    "baseCogs" DECIMAL(18,2) NOT NULL,
    "baseExpense" DECIMAL(18,2) NOT NULL,
    "baseClearing" DECIMAL(18,2) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "non_deductible_vat_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_deductible_vat_event_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "purchaseLineId" TEXT,
    "placement" "NonDeductibleVatPlacement" NOT NULL,
    "layerId" TEXT,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "baseInventory" DECIMAL(18,2) NOT NULL,
    "baseCogs" DECIMAL(18,2) NOT NULL,
    "qtyRemainingAt" DECIMAL(18,3),
    "unitCostBefore" DECIMAL(18,6),
    "unitCostAfter" DECIMAL(18,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "non_deductible_vat_event_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "non_deductible_vat_events_companyId_purchaseId_idx" ON "non_deductible_vat_events"("companyId", "purchaseId");
CREATE UNIQUE INDEX "non_deductible_vat_events_companyId_id_key" ON "non_deductible_vat_events"("companyId", "id");
CREATE INDEX "non_deductible_vat_event_lines_eventId_idx" ON "non_deductible_vat_event_lines"("eventId");
CREATE INDEX "non_deductible_vat_event_lines_purchaseLineId_idx" ON "non_deductible_vat_event_lines"("purchaseLineId");
CREATE INDEX "non_deductible_vat_event_lines_layerId_idx" ON "non_deductible_vat_event_lines"("layerId");

-- AddForeignKey — المفرد يحمل الفعل
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "non_deductible_vat_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "purchase_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "inventory_layers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey — ق-١٢٥٢: المركّبُ بجانب المفرد، بلا فعلٍ عند الحذف (المفردُ يحمله)
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_companyId_eventId_fkey" FOREIGN KEY ("companyId", "eventId") REFERENCES "non_deductible_vat_events"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_companyId_purchaseLineId_fkey" FOREIGN KEY ("companyId", "purchaseLineId") REFERENCES "purchase_lines"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_companyId_layerId_fkey" FOREIGN KEY ("companyId", "layerId") REFERENCES "inventory_layers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ القيود — ما يستطيعه CHECK بلا قراءة جدولٍ آخر ═══
-- الحدثُ = مجموعُ مواضعه الأربعة؛ والطبقةُ للموضع LAYER وحدَه، وحصّتاه (الرفُّ والمستهلَك) تجمعان إليه.
ALTER TABLE "non_deductible_vat_events" ADD CONSTRAINT "non_deductible_vat_events_split_sums"
    CHECK ("baseInventory" + "baseCogs" + "baseExpense" + "baseClearing" = "baseAmount");
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_layer_iff_placement"
    CHECK (("placement" = 'LAYER') = ("layerId" IS NOT NULL));
-- ومستندٌ بلا بنود حصّتُه الواحدة على حساب فئته — فالسطرُ الفارغ للموضع EXPENSE وحدَه.
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_line_unless_expense"
    CHECK ("purchaseLineId" IS NOT NULL OR "placement" = 'EXPENSE');
ALTER TABLE "non_deductible_vat_event_lines" ADD CONSTRAINT "non_deductible_vat_event_lines_split_sums"
    CHECK (
      ("placement" = 'LAYER' AND "baseInventory" + "baseCogs" = "baseAmount")
      OR ("placement" = 'COGS' AND "baseInventory" = 0 AND "baseCogs" = "baseAmount")
      OR ("placement" IN ('EXPENSE', 'CLEARING') AND "baseInventory" = 0 AND "baseCogs" = 0)
    );

-- ═══ عزلُ الصفوف — طبقةٌ ثانية فوق حقن النطاق (§6.1) ═══
ALTER TABLE "non_deductible_vat_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "non_deductible_vat_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_non_deductible_vat_events ON "non_deductible_vat_events"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "non_deductible_vat_event_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "non_deductible_vat_event_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_non_deductible_vat_event_lines ON "non_deductible_vat_event_lines"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
