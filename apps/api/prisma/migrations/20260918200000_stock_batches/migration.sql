-- ٥+٦ الدفعةُ كياناً على الطبقة وFEFO سياسةً تُقرأ (ق-١٠٨٦ · 2026-09-18)
--
-- ① `products.expiryTracked`: علَمٌ ثنائيٌّ واحد «يُتتبَّع بالدفعة والانتهاء» (ق-١٠٨١) — يُعلَن عند الإنشاء ولا
--    يُخمَّن، والقائمُ `NULL` يُعدّ ويُعلَن عند لمس الصنف (ق-١٠٨٣).
-- ② `stock_batches`: الدفعةُ كيانٌ (رقمٌ وانتهاء) لصنفٍ في منشأة؛ والمفتاحُ الفريد يشمل الانتهاءَ عمداً كي يقبل
--    بديلَي `§٤/٣` من الموجز — فالحكمُ فيهما ينتظر المالك ولا يُحسم في المخطَّط.
-- ③ `inventory_layers.batchId`: الطبقةُ تشير إلى دفعتها؛ والقائمةُ بلا دفعة تبقى `NULL` وتُعدّ ولا تُخمَّن (ق-١٠٧٦/٣).
-- ④ `purchase_lines.batchNo/expiryDate`: سطرُ الشراء يحمل الدفعةَ — كان بلا حقلٍ أصلاً (ق-١٠٨٠).
-- ⑤ والقائمُ يُعدّ ويصرخ بـWARNING (ق-٦٩١: لا NOTICE) ولا يُكتب صفٌّ: منتجاتٌ بلا إعلان · طبقاتٌ بلا دفعة ·
--    حركاتٌ قديمة بدفعةٍ نصّاً (تبقى نصّاً وتُعدّ — `§٤/٥` ينتظر الحكم) · ومنها ما انتهى فعلاً.
--
-- ⚠️ الجداولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً للعدّ ثم يُعاد.

ALTER TABLE "products" ADD COLUMN "expiryTracked" BOOLEAN;

CREATE TABLE "stock_batches" (
    "id"         TEXT NOT NULL,
    "companyId"  TEXT NOT NULL,
    "productId"  TEXT NOT NULL,
    "batchNo"    TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_batches_companyId_productId_batchNo_expiryDate_key"
    ON "stock_batches"("companyId", "productId", "batchNo", "expiryDate");
CREATE INDEX "stock_batches_companyId_productId_expiryDate_idx"
    ON "stock_batches"("companyId", "productId", "expiryDate");
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_layers" ADD COLUMN "batchId" TEXT;
CREATE INDEX "inventory_layers_batchId_idx" ON "inventory_layers"("batchId");
ALTER TABLE "inventory_layers" ADD CONSTRAINT "inventory_layers_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_lines" ADD COLUMN "batchNo" TEXT;
ALTER TABLE "purchase_lines" ADD COLUMN "expiryDate" DATE;

-- العزلُ بطبقتيه على الجدول الجديد — يُكتب بيدٍ دائماً (§6.13).
ALTER TABLE "stock_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_batches ON "stock_batches"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_layers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_products_undeclared integer;
  n_layers_no_batch     integer;
  n_movements_text      integer;
  n_movements_expired   integer;
BEGIN
  SELECT count(*) INTO n_products_undeclared FROM "products" WHERE "expiryTracked" IS NULL;
  SELECT count(*) INTO n_layers_no_batch FROM "inventory_layers" WHERE "batchId" IS NULL;
  SELECT count(*) INTO n_movements_text FROM "stock_movements" WHERE "type" = 'IN' AND "batchNo" IS NOT NULL;
  SELECT count(*) INTO n_movements_expired FROM "stock_movements" WHERE "type" = 'IN' AND "batchNo" IS NOT NULL AND "expiryDate" IS NOT NULL AND "expiryDate" < CURRENT_DATE;
  RAISE WARNING 'ق-١٠٨٦: القائمُ يُعلَن ويُعدّ ولا يُخمَّن — منتجاتٌ بلا إعلانِ تتبّع: % · طبقاتٌ بلا دفعة: % · حركاتُ إدخالٍ قديمة بدفعةٍ نصّاً: % (منها منتهية: %)',
    n_products_undeclared, n_layers_no_batch, n_movements_text, n_movements_expired;
END $$;

ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_layers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
