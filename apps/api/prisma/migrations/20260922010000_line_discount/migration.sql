-- ق-١٢٦١ ب — ④B1 الخصمُ على السطر (BT-136): عمودُ خصمٍ مبلغاً على سطر الفاتورة وسطر العرض، صفرٌ افتراضاً — صادقٌ للقائم
-- (لم يكن ثمّة خصم) لا افتراضٌ. صافي السطر = الكمية × السعر − الخصم (BT-131) بدالّة المجاميع الواحدة. لا كتابةَ بيانات.

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "discount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quote_lines" ADD COLUMN     "discount" DECIMAL(18,2) NOT NULL DEFAULT 0;

