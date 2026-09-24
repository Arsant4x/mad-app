-- ⚖️ ق-١٣٦٤ — العيوبُ الثلاثة في رفع التكلفة تُصلَح، ومعها حارسٌ ثانٍ على التوزيع لا على المجموع.
--
-- بنصّ المالك (⑤): «التحويل: ما رُفع من تكلفة الطبقة يتبع الوحدةَ إلى طبقة المقصِد، ولا يُعدّ مستهلكاً. والإتلاف: حصّتُه إلى
-- حساب خسائر الإتلاف لا تكلفة المبيعات. ومرتجعُ البيع بعد الرفع: الدفترُ والطبقةُ يتطابقان بعده، والوحدةُ تعود بالتكلفة التي
-- خرجت بها، وما رُفع عليها بعد خروجها يُعاد من تكلفة المبيعات إلى المخزون. ⚠️ ومعها حارسٌ ثانٍ على التوزيع لا على المجموع.»
--
-- ما يُضاف:
--   ① inventory_layers.transferConsumptionId — طبقةٌ وُلدت بتحويل تعرف الشريحةَ التي جاءت منها، فيتبعها الرفع.
--   ② inventory_layers.exitedRaise + inventory_consumptions.exitedRaiseAtExit — ما رُفع على الوحدة الخارجة تراكميّاً، وقيمتُه لحظةَ
--      الخروج (يكتبها مُشغِّلٌ هنا لا الشيفرة) — فالعائدُ يستردّ الفرق.
--   ③ layer_cost_shares — أين ذهب كلُّ ريالٍ من كلِّ رفع: الرفّ أو مخارجُ الطبقة بأنواعها (مادّةُ الحارس الثاني).
--
-- **القائمُ يُعدّ ويُعلَن ولا يُحوَّل** (ق-١١٧٨): طبقاتُ التحويل القائمة بلا وصلة، وحصصُ خروجٍ قديمة ذهبت كلُّها إلى 5100 — تُعدّ
-- هنا ولا تُعاد قسمتُها. والعدُّ داخل سياق كلِّ منشأة (ق-١٣٢٥). ⚠️ الجدولُ الجديد تحت FORCE — كتلةُ RLS بيدٍ (§6.13).

-- CreateEnum
CREATE TYPE "LayerCostEvent" AS ENUM ('LANDED_COST', 'PRICE_NOTE', 'NON_DEDUCTIBLE_VAT', 'SETTLEMENT');

-- AlterTable
ALTER TABLE "inventory_consumptions" ADD COLUMN     "exitedRaiseAtExit" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "inventory_layers" ADD COLUMN     "exitedRaise" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "transferConsumptionId" TEXT;

-- CreateTable
CREATE TABLE "layer_cost_shares" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "parentId" TEXT,
    "event" "LayerCostEvent" NOT NULL,
    "landedCostDistributionId" TEXT,
    "nonDeductibleVatEventId" TEXT,
    "purchaseId" TEXT,
    "settlementId" TEXT,
    "qtyReceived" DECIMAL(18,3) NOT NULL,
    "qtyRemainingAt" DECIMAL(18,3) NOT NULL,
    "exitedQtyAt" DECIMAL(18,3) NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "baseShelf" DECIMAL(18,2) NOT NULL,
    "baseCogs" DECIMAL(18,2) NOT NULL,
    "baseWriteOff" DECIMAL(18,2) NOT NULL,
    "baseVariance" DECIMAL(18,2) NOT NULL,
    "baseFollow" DECIMAL(18,2) NOT NULL,
    "unitCostBefore" DECIMAL(18,6) NOT NULL,
    "unitCostAfter" DECIMAL(18,6) NOT NULL,
    "exitedRaiseBefore" DECIMAL(18,6) NOT NULL,
    "exitedRaiseAfter" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layer_cost_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "layer_cost_shares_layerId_idx" ON "layer_cost_shares"("layerId");
CREATE INDEX "layer_cost_shares_parentId_idx" ON "layer_cost_shares"("parentId");
CREATE INDEX "layer_cost_shares_landedCostDistributionId_idx" ON "layer_cost_shares"("landedCostDistributionId");
CREATE INDEX "layer_cost_shares_nonDeductibleVatEventId_idx" ON "layer_cost_shares"("nonDeductibleVatEventId");
CREATE INDEX "layer_cost_shares_purchaseId_idx" ON "layer_cost_shares"("purchaseId");
CREATE INDEX "layer_cost_shares_settlementId_idx" ON "layer_cost_shares"("settlementId");
CREATE UNIQUE INDEX "layer_cost_shares_companyId_id_key" ON "layer_cost_shares"("companyId", "id");
CREATE UNIQUE INDEX "inventory_layers_transferConsumptionId_key" ON "inventory_layers"("transferConsumptionId");

-- AddForeignKey — المفرد يحمل الفعل
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_transferConsumptionId_fkey" FOREIGN KEY ("transferConsumptionId") REFERENCES "inventory_consumptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "inventory_layers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "layer_cost_shares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_landedCostDistributionId_fkey" FOREIGN KEY ("landedCostDistributionId") REFERENCES "landed_cost_distributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_nonDeductibleVatEventId_fkey" FOREIGN KEY ("nonDeductibleVatEventId") REFERENCES "non_deductible_vat_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "inventory_consumptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey — ق-١٢٥٢: المركّبُ بجانب المفرد، بلا فعلٍ عند الحذف (المفردُ يحمله)
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_companyId_transferConsumptionId_fkey" FOREIGN KEY ("companyId", "transferConsumptionId") REFERENCES "inventory_consumptions"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_companyId_layerId_fkey" FOREIGN KEY ("companyId", "layerId") REFERENCES "inventory_layers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "layer_cost_shares"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_companyId_landedCostDistributionId_fkey" FOREIGN KEY ("companyId", "landedCostDistributionId") REFERENCES "landed_cost_distributions"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_companyId_nonDeductibleVatEventId_fkey" FOREIGN KEY ("companyId", "nonDeductibleVatEventId") REFERENCES "non_deductible_vat_events"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_companyId_purchaseId_fkey" FOREIGN KEY ("companyId", "purchaseId") REFERENCES "purchases"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_companyId_settlementId_fkey" FOREIGN KEY ("companyId", "settlementId") REFERENCES "inventory_consumptions"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ القيود — ما يستطيعه CHECK بلا قراءة جدولٍ آخر ═══
-- الحصّةُ = مواضعُها الخمسة؛ وما خرج = ما استُلم − ما بقي؛ والحدثُ بمفتاحه وحدَه (واحدٌ لا غير، يطابق النوع).
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_split_sums"
    CHECK ("baseShelf" + "baseCogs" + "baseWriteOff" + "baseVariance" + "baseFollow" = "baseAmount");
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_exited_qty"
    CHECK ("exitedQtyAt" = "qtyReceived" - "qtyRemainingAt");
ALTER TABLE "layer_cost_shares" ADD CONSTRAINT "layer_cost_shares_one_event"
    CHECK (
      ("event" = 'LANDED_COST') = ("landedCostDistributionId" IS NOT NULL)
      AND ("event" = 'NON_DEDUCTIBLE_VAT') = ("nonDeductibleVatEventId" IS NOT NULL)
      AND ("event" = 'PRICE_NOTE') = ("purchaseId" IS NOT NULL)
      AND ("event" = 'SETTLEMENT') = ("settlementId" IS NOT NULL)
    );

-- ═══ عزلُ الصفوف — طبقةٌ ثانية فوق حقن النطاق (§6.1) ═══
ALTER TABLE "layer_cost_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "layer_cost_shares" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_layer_cost_shares ON "layer_cost_shares"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ═══ ② ما رُفع على الوحدة لحظةَ خروجها — يكتبه المُشغِّل فلا ينساه مسارُ استهلاكٍ جديد ═══
-- (الشيفرةُ ستّةُ مواضع تُنشئ استهلاكاً: الصرفُ · الإقفالُ بعينه · إعادةُ المورّد · التسوية …؛ وحارسٌ في موضعٍ واحد يغني عنها.)
CREATE OR REPLACE FUNCTION inventory_consumption_exited_raise() RETURNS trigger AS $$
DECLARE
  raised NUMERIC;
BEGIN
  IF NEW."layerId" IS NULL THEN
    NEW."exitedRaiseAtExit" := 0;
    RETURN NEW;
  END IF;
  SELECT l."exitedRaise" INTO raised FROM "inventory_layers" l WHERE l.id = NEW."layerId";
  NEW."exitedRaiseAtExit" := COALESCE(raised, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_consumption_exited_raise_trg
  BEFORE INSERT ON "inventory_consumptions"
  FOR EACH ROW EXECUTE FUNCTION inventory_consumption_exited_raise();

-- ═══ القائمُ يُعدّ ويُعلَن ولا يُحوَّل ═══
DO $$
DECLARE
  c RECORD;
  k INTEGER;
  v NUMERIC;
  companies_n INTEGER := 0;
  unlinked INTEGER := 0;
  raises INTEGER := 0;
  raised_exits NUMERIC := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*) INTO k FROM "inventory_layers" WHERE "companyId" = c.id AND "sourceType" = 'TRANSFER';
    unlinked := unlinked + k;

    SELECT count(*), COALESCE(sum(x."baseCogs"), 0) INTO k, v FROM (
      SELECT l."baseCogs" FROM "landed_cost_lines" l JOIN "landed_cost_distributions" d ON d.id = l."distributionId"
       WHERE l."companyId" = c.id AND d."voidedAt" IS NULL AND l."baseCogs" <> 0
      UNION ALL
      SELECT e."baseCogs" FROM "non_deductible_vat_event_lines" e
       WHERE e."companyId" = c.id AND e."placement" = 'LAYER' AND e."baseCogs" <> 0
    ) x;
    raises := raises + k;
    raised_exits := raised_exits + v;
  END LOOP;

  RAISE WARNING 'ق-١٣٦٤: % منشأة — طبقاتٌ قائمة وُلدت بتحويلٍ بلا وصلة: % (لا يتبعها رفعٌ لاحق — يُعدّ قديماً) · حصصُ خروجٍ قائمة ذهبت كلُّها إلى 5100: % بمجموع % (لا تُعاد قسمتُها على المخارج)؛ وما بعد اليوم يُقسَم ويُسجَّل في layer_cost_shares',
    companies_n, unlinked, raises, raised_exits;
END $$;
