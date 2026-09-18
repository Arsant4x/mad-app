-- ① وحدةُ القياس مرمَّزةً (ق-١٠٦٩ · 2026-09-18)
--
-- ① `products.unitCode`: الوحدةُ الأساس رمزاً من القائمة المغلقة (UN/ECE Rec 20 — ما توصي به
--    الهيئة في `BT-130`). تُعلَن عند الإنشاء ولا تُفترض؛ والنصُّ القديم `unit` يبقى ولا يُخمَّن منه رمز.
-- ② وحدةُ الكمّية على سطر الفاتورة والعرض والشراء تُنسخ من الصنف لحظةَ الكتابة — فالمستندُ يذكر وحدتَه.
-- ③ والقائمُ يُعلَن ويُعدّ ولا يُرحَّل رجعياً بلا حكم المالك (الشرطُ الأول على ①): منتجاتٌ بلا وحدةٍ
--    معلَنة، ومنها ما يحمل نصّاً قديماً يُعلَن لا يُخمَّن؛ وأسطرٌ قائمة بلا وحدة — تُعدّ وتصرخ بـWARNING
--    (ق-٦٩١: لا NOTICE) ولا تكتب صفّاً.
--
-- ⚠️ الجداولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً للعدّ ثم يُعاد.

ALTER TABLE "products" ADD COLUMN "unitCode" TEXT;
ALTER TABLE "invoice_lines" ADD COLUMN "unitCode" TEXT;
ALTER TABLE "quote_lines" ADD COLUMN "unitCode" TEXT;
ALTER TABLE "purchase_lines" ADD COLUMN "unitCode" TEXT;

ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "quote_lines" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "purchase_lines" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_products_no_unit integer;
  n_products_text    integer;
  n_invoice_lines    integer;
  n_quote_lines      integer;
  n_purchase_lines   integer;
BEGIN
  SELECT count(*) INTO n_products_no_unit FROM "products" WHERE "unitCode" IS NULL;
  SELECT count(*) INTO n_products_text FROM "products" WHERE "unitCode" IS NULL AND "unit" IS NOT NULL AND btrim("unit") <> '';
  SELECT count(*) INTO n_invoice_lines FROM "invoice_lines" WHERE "unitCode" IS NULL;
  SELECT count(*) INTO n_quote_lines FROM "quote_lines" WHERE "unitCode" IS NULL;
  SELECT count(*) INTO n_purchase_lines FROM "purchase_lines" WHERE "unitCode" IS NULL;
  RAISE WARNING 'ق-١٠٦٩: القائمُ يُعلَن ويُعدّ ولا يُرحَّل — منتجاتٌ بلا وحدةٍ معلَنة: % (منها بنصٍّ قديم يُعلَن لا يُخمَّن: %) · أسطرٌ بلا وحدة: فواتير % · عروض % · مشتريات %',
    n_products_no_unit, n_products_text, n_invoice_lines, n_quote_lines, n_purchase_lines;
END $$;

ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "quote_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "purchase_lines" FORCE ROW LEVEL SECURITY;
