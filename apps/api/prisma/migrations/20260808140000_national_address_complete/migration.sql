-- العنوان الوطني السعودي مكتملاً (2.3): الحقلان الرسميان الأخيران.
-- إضافة محضة — لا يمسّ هذا الملف أي عمود قائم (وُلِّد الفرق آلياً فاقترح
-- حذف أعمدة إشعارات ZATCA لأن القاعدة المستنسخة كانت أحدث من هذا الفرع؛
-- حُذف ذلك الاقتراح عمداً — الهجرة تضيف ولا تُنقص).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "additionalNumber" TEXT,
                        ADD COLUMN IF NOT EXISTS "unitNumber" TEXT;
