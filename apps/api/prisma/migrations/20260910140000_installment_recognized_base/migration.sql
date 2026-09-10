-- ═══ ما اعتُرف به من مقبوض القسط — عدّادُ انغلاق الالتزام (ق-٤٦٨) ═══
--
-- **الالتزامُ القائم = المقبوضُ − المعترَفُ به.** والتحوّلُ الشهريّ يقارن هدفَه
-- **التراكميّ** بهذا الرقم ويُرحّل الفرقَ وحده — **فتشغيلٌ مكرَّرٌ يُرحّل صفراً،
-- وشهرٌ فائتٌ يُعوَّض في التشغيل التالي بتاريخه هو**.
--
-- 🔴 **ولماذا يُعبَّأ بالمقبوض لا بالصفر — وهي علّةُ ازدواجٍ لا نقصُ بيان**:
--
--    مقبوضُ الأقساط القائمة **اعتُرف به إيراداً كاملاً بالقاعدة القديمة**
--    (`1000/4200` لحظةَ القبض). فلو بدأ العدّادُ من صفرٍ لرأى التحوّلُ الشهريّ
--    التزاماً لم يُنشأ قطّ، **فيُرحّل الإيرادَ نفسَه مرّةً ثانية** ويُنزل `2400`
--    إلى رصيدٍ سالبٍ لا مقابلَ له. ⇒ **فالتعبئةُ تقول الحقّ: قد اعتُرف بها**.
--
-- ⚠️ **ولا يُعاد ترحيلُ قيدٍ واحد** (ق-٤٦٧): الدفترُ لا يُمسّ — يُملأ عدّادٌ
--    يصف ما جرى فعلاً، **فتبقى العقودُ القائمة على قاعدتها القديمة معلَنةً**،
--    ويبدأ التقسيمُ ممّا يُقبض بعد هذا الترحيل.

-- AlterTable
ALTER TABLE "contract_installments" ADD COLUMN     "baseRecognized" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- ق-٢٦٢: الجدولان تحت `FORCE`، والترحيلُ يتّصل بـ`app_user` بلا `app.company_id` —
-- فبلا رفعٍ صريح **يمسّ التحديثُ صفرَ صفوفٍ بلا خطأٍ ولا تحذير**، ويبدأ العدّادُ
-- من صفرٍ كاذبٍ فيزدوج الإيراد.
ALTER TABLE "contract_installments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "rent_payments" NO FORCE ROW LEVEL SECURITY;

UPDATE "contract_installments" i
SET "baseRecognized" = COALESCE(
      (SELECT SUM(p."baseNetAmount") FROM "rent_payments" p WHERE p."installmentId" = i.id),
      0
    );

ALTER TABLE "contract_installments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rent_payments" FORCE ROW LEVEL SECURITY;
