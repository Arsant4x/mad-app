-- ٥+٦ حكمُ المالك ③: مفتاحُ الدفعة صنفٌ ورقمٌ — بلا الانتهاء (ق-١٠٩٠ · 2026-09-18)
--
-- «الدفعةُ هويّةٌ، وما يُعلَّق عليه التاريخُ لا يتغيّر ⇒ وقبولُ دفعتين برقمٍ واحدٍ وانتهاءين يجعل الرقمَ لا يعني شيئاً»
-- — فيُسقَط المفتاحُ الرباعيُّ (الذي قبل البديلين حتى الحكم — ق-١٠٨٦) ويُوضع مفتاحٌ بالصنف والرقم. ⚠️ قبل ذلك تُعدّ
-- التعارضاتُ القائمة (رقمٌ واحد لصنفٍ بانتهاءين) **وتقف الهجرةُ إن وُجدت**: مفتاحٌ لا يُحسم فوق بياناتٍ متعارضة —
-- تُصحَّح بحركةٍ أوّلاً. على التطوير يومَ الحكم: صفرُ دفعات. ولا كتابةَ صفّ.
--
-- ⚠️ الجدولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً للعدّ ثم يُعاد.

ALTER TABLE "stock_batches" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_dup integer;
BEGIN
  SELECT count(*) INTO n_dup FROM (
    SELECT "companyId", "productId", "batchNo" FROM "stock_batches" GROUP BY "companyId", "productId", "batchNo" HAVING count(*) > 1
  ) d;
  IF n_dup > 0 THEN
    RAISE EXCEPTION 'ق-١٠٩٠: % رقمَ دفعةٍ مكرَّراً بانتهاءاتٍ مختلفة — لا يُحسم المفتاحُ فوق بياناتٍ متعارضة؛ تُصحَّح بحركةٍ أوّلاً', n_dup;
  END IF;
  RAISE WARNING 'ق-١٠٩٠: لا تعارضَ في أرقام الدفعات (%) — يُحسم المفتاحُ صنفاً ورقماً بلا الانتهاء', n_dup;
END $$;

ALTER TABLE "stock_batches" FORCE ROW LEVEL SECURITY;

DROP INDEX "stock_batches_companyId_productId_batchNo_expiryDate_key";
CREATE UNIQUE INDEX "stock_batches_companyId_productId_batchNo_key" ON "stock_batches"("companyId", "productId", "batchNo");
