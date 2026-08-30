-- ═══════════════════════════════════════════════════════════════════════
-- L0-2 — طبقات التكلفة، والمنع البنيوي على مصدر الحركة
-- ═══════════════════════════════════════════════════════════════════════
--
-- قرار المالك (ق-١): **FIFO بطبقات هو البنية الأساس**، والمتوسط المرجّح دالة
-- استهلاك فوقها لا مخطَّط بديل. والحجّة: الأدقّ يُبنى أولاً والأبسط دالةٌ
-- فوقه، **والعكس مستحيل** — من بدأ بالمتوسط لا يملك بياناتٍ يبني منها
-- الطبقات، فالدفعات ذابت في رقم واحد.
--
-- ⛔ وLIFO لا يُبنى: المعايير المعتمدة في المملكة تجيز FIFO والمتوسط فقط.
--
-- ## ولماذا عمودان لا مرجعٌ متعدّد الأشكال
--
-- عدد أنواع السطور التي تسبّب حركةَ مخزون **اثنان** — مقيس لا مقدَّر:
-- `productId` يرد على أربعة نماذج، و`QuoteLine` عرضٌ لا حركة،
-- و`StockMovement` هو نفسه. والإشعار الدائن **يشارك جدول الفواتير**
-- (`docType = CREDIT_NOTE`) فسطوره `InvoiceLine`، والصيانة لا تستهلك قطعاً.
--
-- ومفتاحان أجنبيان حقيقيان **يجعلان المرجع غير القابل للحلّ مستحيلاً**: لا
-- سطرَ محذوف (`RESTRICT`) ولا نوعَ مجهول. بينما `sourceLineId` نصّي كان
-- سيفرض `CASE` على نوعٍ **يُكتب خطأً فيصمت** — وهو الميل المرفوض.
--
-- ⚠️ ولو صار الاستلام كياناً مستقلاً في `م٥` صار العدد ثلاثة: يُضاف عمود
-- ويُوسَّع الشرط. **وإضافة عمود لا تعيد كتابة الجدول** (مقيس في `م٢`:
-- `relfilenode` ثابت · ٢ مللي لمليون صف).
--
-- ## ولماذا كُتب هذا الملف يدوياً
--
-- ⚠️ `prisma migrate diff` يقترح حذف `tasks` و`task_logs` و`delegation_logs`
-- وفهرساً — لأنها أُنشئت بترحيلات SQL خام ولم تُضَف إلى `schema.prisma`.
-- فالمسار الآلي كان سيكتب ترحيلاً يحذف ثلاثة جداول عاملة.

-- ═══ ① الأنواع ═══
CREATE TYPE "MovementOrigin" AS ENUM ('MANUAL', 'SALE', 'RECEIPT', 'TRANSFER', 'OPENING');
CREATE TYPE "CostingMethod"  AS ENUM ('FIFO', 'WEIGHTED_AVERAGE', 'SPECIFIC');
CREATE TYPE "LayerSource"    AS ENUM ('GOODS_RECEIPT', 'OPENING', 'RETURN', 'ADJUSTMENT');

-- ═══ ② مصدر الحركة على `stock_movements` ═══
-- الافتراضي `MANUAL` مقصود: الصفوف القائمة أُنشئت من شاشة المخزون أو من
-- الكاشير قبل `م١`، ولا سبيل لنسبتها الآن — وهو حدٌّ مُعلَن في `§9`.
ALTER TABLE "stock_movements"
  ADD COLUMN "origin"         "MovementOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "invoiceLineId"  TEXT,
  ADD COLUMN "purchaseLineId" TEXT;

-- ═══ ③ الطبقات والاستهلاك ═══
CREATE TABLE "inventory_layers" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "productId"        TEXT NOT NULL,
    "warehouseId"      TEXT NOT NULL,
    "qtyReceived"      DECIMAL(18,3) NOT NULL,
    "qtyRemaining"     DECIMAL(18,3) NOT NULL,
    "unitCost"         DECIMAL(18,6) NOT NULL,
    "acquiredAt"       TIMESTAMP(3)  NOT NULL,
    "sourceType"       "LayerSource" NOT NULL,
    "sourceMovementId" TEXT,
    "costingMethod"    "CostingMethod" NOT NULL DEFAULT 'FIFO',
    "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_layers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_consumptions" (
    "id"            TEXT NOT NULL,
    "companyId"     TEXT NOT NULL,
    -- ⚠️ **فارغٌ = مؤقّت.** ولا علَم `isProvisional`: علَمٌ يستطيع أن يخالف
    -- الواقع فيلزم من يحكم أيّهما يكذب — وهو `lineType: SERVICE` بعينه.
    -- و«مؤقّت» ليس وصفاً يُضاف بل **غياب الطبقة نفسه**.
    "layerId"       TEXT,
    "movementId"    TEXT NOT NULL,
    "qty"           DECIMAL(18,3) NOT NULL,
    "unitCost"      DECIMAL(18,6) NOT NULL,
    -- والتسوية صفٌّ جديد يشير إلى الأصل — **وقائع لا حالات**.
    "settlesId"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_consumptions_pkey" PRIMARY KEY ("id")
);

-- ═══ ④ الفهارس ═══
-- ترتيب الاستهلاك: `acquiredAt` ثم `createdAt` — والثاني فاصلٌ حاسم كي لا
-- يعتمد ترتيب FIFO على الصدفة حين تتساوى التواريخ.
CREATE INDEX "inventory_layers_companyId_productId_warehouseId_acquiredAt_idx"
    ON "inventory_layers"("companyId", "productId", "warehouseId", "acquiredAt", "createdAt");
-- تسويةٌ واحدة لكل مؤقّت — والفريد يمنع تسويتين تُضاعفان التصحيح.
CREATE UNIQUE INDEX "inventory_consumptions_settlesId_key" ON "inventory_consumptions"("settlesId");
CREATE INDEX "inventory_consumptions_companyId_layerId_idx"    ON "inventory_consumptions"("companyId", "layerId");
CREATE INDEX "inventory_consumptions_companyId_movementId_idx" ON "inventory_consumptions"("companyId", "movementId");
-- تقرير المؤقّتة المفتوحة — **فما لا يُرى لا يُسوَّى**. وفهرسٌ جزئي على
-- `layerId IS NULL` لأن التعريف هو الغياب، فلا عمودَ حالةٍ يُفهرَس.
CREATE INDEX "inventory_consumptions_open_provisional_idx"
    ON "inventory_consumptions"("companyId", "createdAt") WHERE "layerId" IS NULL;
CREATE INDEX "stock_movements_companyId_productId_warehouseId_idx" ON "stock_movements"("companyId", "productId", "warehouseId");
CREATE INDEX "stock_movements_invoiceLineId_idx"  ON "stock_movements"("invoiceLineId");
CREATE INDEX "stock_movements_purchaseLineId_idx" ON "stock_movements"("purchaseLineId");

-- ═══ ⑤ المفاتيح الأجنبية ═══
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_invoiceLineId_fkey"
    FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseLineId_fkey"
    FOREIGN KEY ("purchaseLineId") REFERENCES "purchase_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_sourceMovementId_fkey"
    FOREIGN KEY ("sourceMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_layerId_fkey"
    FOREIGN KEY ("layerId") REFERENCES "inventory_layers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_movementId_fkey"
    FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_settlesId_fkey"
    FOREIGN KEY ("settlesId") REFERENCES "inventory_consumptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ ⑥ قيود صحّة الطبقة ═══
-- المتبقّي لا يتجاوز المستلَم ولا ينزل تحت الصفر: الرصيد السالب مسموح على
-- **مستوى الصنف** (سياسة قائمة: الكاشير لا يتوقف)، ولا معنى له داخل طبقةٍ
-- بعينها — طبقةٌ متبقّيها سالب تعني استهلاكاً حُسب مرّتين.
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_remaining_range"
    CHECK ("qtyRemaining" >= 0 AND "qtyRemaining" <= "qtyReceived");
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_received_positive"
    CHECK ("qtyReceived" > 0);
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_qty_positive"
    CHECK ("qty" > 0);
-- ⚠️ **والتسوية لا تُسوّي إلا مؤقّتاً** — أي صفّاً بلا طبقة. وصفُّ التسوية
-- نفسه يحمل طبقته، فهو استهلاكٌ حقيقي يحلّ محلّ التقدير.
--
-- والقيد يمنع الحالتين اللتين تُفرغان المعنى: تسويةٌ بلا طبقة (تقديرٌ يُسوّي
-- تقديراً)، وصفٌّ يشير إلى نفسه.
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_settlement_has_layer"
    CHECK ("settlesId" IS NULL OR "layerId" IS NOT NULL);
ALTER TABLE "inventory_consumptions" ADD CONSTRAINT "inventory_consumptions_settles_not_self"
    CHECK ("settlesId" IS NULL OR "settlesId" <> "id");

-- ═══ ⑦ المنع البنيوي — سطرٌ واحد على الأكثر، ومصدرٌ يطابقه ═══
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_one_source_line"
    CHECK (num_nonnulls("invoiceLineId", "purchaseLineId") <= 1);

-- والربط بين السبب والسطر — ما يستطيعه `CHECK` بلا قراءة جدولٍ آخر:
--   بيعٌ ⇒ سطر فاتورة · استلامٌ ⇒ سطر شراء · وما عداهما ⇒ بلا سطر.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_origin_matches_source"
    CHECK (
      CASE "origin"
        WHEN 'SALE'    THEN "invoiceLineId"  IS NOT NULL AND "purchaseLineId" IS NULL
        WHEN 'RECEIPT' THEN "purchaseLineId" IS NOT NULL AND "invoiceLineId"  IS NULL
        ELSE "invoiceLineId" IS NULL AND "purchaseLineId" IS NULL
      END
    );

-- ═══ ⑧ المُشغِّل — ما لا يستطيعه `CHECK`: مساواة الصنف عبر جدولين ═══
--
-- ⚠️ **ولماذا مُشغِّل لا حارسٌ في الشيفرة**: الحارس النصّي يُخدَع بالشكل
-- (§8.21)، والنوع في TypeScript يتجاوزه `as any` **ولا أثر له في القاعدة**.
-- والمُشغِّل **تحت الشيفرة كلها**: يصطدم به من كتب بأي مسار، وحتى من `psql`.
--
-- والحالة التي يمنعها ليست فرضية: الكاشير كان يعرف الصنف ثم يحتفظ باسمه
-- وحده، فتخرج البضاعة من الرفّ ولا يقول المستند ماذا خرج.
CREATE OR REPLACE FUNCTION stock_movement_source_consistency() RETURNS trigger AS $$
DECLARE
  line_product TEXT;
BEGIN
  IF NEW."invoiceLineId" IS NOT NULL THEN
    SELECT "productId" INTO line_product FROM "invoice_lines" WHERE "id" = NEW."invoiceLineId";
  ELSIF NEW."purchaseLineId" IS NOT NULL THEN
    SELECT "productId" INTO line_product FROM "purchase_lines" WHERE "id" = NEW."purchaseLineId";
  ELSE
    RETURN NEW;
  END IF;

  IF line_product IS NULL THEN
    RAISE EXCEPTION 'حركة مخزون تشير إلى سطر مستند بلا صنف — لا يُعرف ماذا تحرّك (movement=%, origin=%)',
      NEW."id", NEW."origin";
  END IF;

  IF line_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'صنف الحركة يخالف صنف سطر المستند: الحركة % والسطر % (movement=%)',
      NEW."productId", line_product, NEW."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movement_source_consistency_trg
  BEFORE INSERT OR UPDATE OF "productId", "invoiceLineId", "purchaseLineId" ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_source_consistency();

-- ═══ ⑨ عزل المستأجر — ENABLE وFORCE معاً ═══
-- ⚠️ **FORCE شرطٌ لا تفصيل**: مالك الجدول يتجاوز السياسة بدونه، والاتصال
-- الذي تُشغَّل به الترحيلات هو المالك. وحارس `rls-coverage.live.spec.ts`
-- يقرأ `pg_class.relforcerowsecurity` ويسقط على أي جدولٍ مستأجرٍ بلا الاثنين.
ALTER TABLE "inventory_layers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_layers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_layers ON "inventory_layers"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "inventory_consumptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_consumptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_consumptions ON "inventory_consumptions"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
