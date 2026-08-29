-- ═══════════════════════════════════════════════════════════════════════
-- L0-4 — الدقة العشرية: توسيع الكميات وأسعار الوحدة
-- ═══════════════════════════════════════════════════════════════════════
--
-- ثمانية أعمدة، في أربعة جداول. الكمية إلى ثلاث خانات وسعر الوحدة الصافي
-- إلى ستّ — وفق جدول المقاييس في `src/common/money/rounding.ts`، وحارسٌ
-- يفحص تطابق الاثنين في الاتجاهين.
--
-- ## لماذا الآن بالضبط
--
-- توسيع عمود `numeric` **يعيد كتابة الجدول** تحت `AccessExclusiveLock`.
-- مقيسٌ لا مفترَض:
--
--   · `relfilenode` قبل ٢٥٦٠٢١ ← بعد ٢٥٦٠٢٧   (أي إعادة كتابة كاملة)
--   · مليون صف: ٩٢٥ مللي ثانية
--   · **والقراءة تُمنع لا تبطؤ**: `SELECT` متزامن سقط بمهلة أربع ثوانٍ،
--     وهو نفسه يعود في ٢٩ مللي بلا القفل.
--
-- أي أن هذا **انقطاع خدمة** عند الحجم، لا بطء. وحجم هذه الجداول اليوم على
-- خادم الاختبار **أربعة عشر صفاً مجتمعةً** — فالتنفيذ الآن يكلّف أقل من
-- مللي، وبعد سنةٍ من تاجرٍ نشط يكلّف نافذة صيانة.
--
-- ⚠️ **ولا تُرحَّل بيانات هنا**: توسيع الدقة لا يغيّر قيمةً قائمة. صفٌّ فيه
-- `100.13` يبقى `100.13` ويصير قادراً على حمل `100.125` بعدها.
--
-- ## ولماذا لم يُولَّد هذا الملف بـ`prisma migrate dev`
--
-- ⚠️ `prisma migrate diff` على هذه القاعدة يقترح **حذف** `tasks` و
-- `task_logs` و`delegation_logs` وفهرس `business_activities_companyId_sector_idx`
-- — لأنها أُنشئت بترحيلات SQL خام ولم تُضَف إلى `schema.prisma` (وتُقرأ
-- بـ`$queryRaw`). فالمسار الآلي كان سيكتب ترحيلاً يحذف ثلاثة جداول عاملة.
-- كُتب هذا الملف يدوياً بأربعة تعديلات لا غير، وبند التباعد مسجَّل مستقلاً.

ALTER TABLE "invoice_lines"
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
  ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,6);

ALTER TABLE "quote_lines"
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
  ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,6);

ALTER TABLE "stock_movements"
  ALTER COLUMN "qty" SET DATA TYPE DECIMAL(18,3);

ALTER TABLE "products"
  ALTER COLUMN "price" SET DATA TYPE DECIMAL(18,6),
  ALTER COLUMN "cost" SET DATA TYPE DECIMAL(18,6),
  ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(18,3);
