-- ㉘ الحركاتُ اليدوية عبر طبقات التكلفة (ق-١٠٦٣ · 2026-09-18)
--
-- ① قيمةٌ جديدة في مصدر الطبقة: التحويلُ ينقل الطبقةَ لا الكمّيةَ وحدَها، فالطبقةُ في
--    المستودع المقصِد تحمل مصدرَها `TRANSFER` وتاريخَ اقتناء أصلِها لا تاريخَ النقل.
-- ② والقائمُ يُعلَن ويُعدّ ولا يُرحَّل رجعياً بلا حكم المالك (الشرطُ الرابع): حركاتُ إدخالٍ
--    يدوية بلا طبقة · إخراجاتٌ بلا استهلاك · تحويلاتٌ تركت طبقاتِها في المصدر · استهلاكاتٌ
--    مؤقّتةٌ مفتوحة · منتجاتٌ بلا وحدة — تُعدّ وتصرخ بـWARNING (ق-٦٩١: لا NOTICE) ولا تكتب صفّاً.
--
-- ⚠️ الجداولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً للعدّ ثم يُعاد.

ALTER TYPE "LayerSource" ADD VALUE 'TRANSFER';

ALTER TABLE "stock_movements" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_layers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_consumptions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_manual_in_no_layer integer;
  n_out_no_consumption integer;
  n_transfers          integer;
  n_open_provisional   integer;
  n_products_no_unit   integer;
BEGIN
  SELECT count(*) INTO n_manual_in_no_layer
    FROM "stock_movements" m
    WHERE m."origin" = 'MANUAL' AND m."type" = 'IN'
      AND NOT EXISTS (SELECT 1 FROM "inventory_layers" l WHERE l."sourceMovementId" = m.id);
  SELECT count(*) INTO n_out_no_consumption
    FROM "stock_movements" m
    WHERE m."type" = 'OUT'
      AND NOT EXISTS (SELECT 1 FROM "inventory_consumptions" c WHERE c."movementId" = m.id);
  SELECT count(*) INTO n_transfers FROM "stock_movements" WHERE "type" = 'TRANSFER';
  SELECT count(*) INTO n_open_provisional
    FROM "inventory_consumptions" c
    WHERE c."layerId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "inventory_consumptions" s WHERE s."settlesId" = c.id);
  SELECT count(*) INTO n_products_no_unit FROM "products" WHERE "unit" IS NULL OR "unit" = '';
  RAISE WARNING 'ق-١٠٦٣: القائمُ يُعلَن ويُعدّ ولا يُرحَّل — إدخالٌ يدويّ بلا طبقة: % · إخراجٌ بلا استهلاك: % · تحويلاتٌ سابقةٌ لنقل الطبقات: % · استهلاكاتٌ مؤقّتة مفتوحة: % · منتجاتٌ بلا وحدة: %',
    n_manual_in_no_layer, n_out_no_consumption, n_transfers, n_open_provisional, n_products_no_unit;
END $$;

ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_layers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_consumptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
