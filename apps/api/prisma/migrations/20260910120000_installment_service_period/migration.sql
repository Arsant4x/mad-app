-- ═══ فترةُ الخدمة على القسط — أساسُ الإيراد المؤجَّل (ق-٤٧٤ · ق-٤٧٥) ═══
--
-- **المحدِّد ليس اسمَ الدورة بل العلاقةَ بين تاريخِ القبض وفترةِ الخدمة.** فالقسطُ
-- يستحقّ في **أوّلِ** فترته لا في آخرها (`generateInstallmentSchedule` يضع أولَه في
-- `start` نفسِه) — **فكلُّ قبضِ إيجارٍ قبضٌ عن خدمةٍ لم تُقدَّم بعد، بالبناء لا
-- بالصدفة**. ولا يلزم عقدٌ ربعيٌّ ولا سنويّ ليقع الخطأ: **يكفي مستأجرٌ يدفع مبكّراً
-- بيومٍ واحدٍ عبر حدِّ الشهر** — وقد وقع في **٢٤ من ١١٤ دفعة (٢١٪)** في البيانات
-- القائمة.
--
-- **ولماذا تُخزَّن ولا تُشتقّ** (ق-٤٧٥/②): اشتقاقُها من `dueDate` والدورة ممكنٌ
-- اليوم، **لكنه يكذب متى عُدِّلت الدورةُ أو المدّةُ بعد التوليد** — فيعيد كتابة
-- تاريخِ خدمةٍ لقيدٍ مُرحَّل (ق-١٢٧).
--
-- ⚠️ **والتعبئةُ اشتقاقٌ من الجدول نفسِه لا تخمين**: بدايةُ القسط تاريخُ استحقاقه،
--    ونهايتُه اليومُ السابقُ للقسط التالي — أو نهايةُ العقد للأخير، **كما يبتلع
--    الأخيرُ باقيَ التقريب في المبلغ**. **ولا يُعاد ترحيلُ قيدٍ واحد** (ق-٤٦٧):
--    العمودُ يُملأ، والدفترُ لا يُمسّ.

-- AlterTable
ALTER TABLE "contract_installments" ADD COLUMN     "serviceStart" DATE;
ALTER TABLE "contract_installments" ADD COLUMN     "serviceEnd" DATE;

-- ق-٢٦٢: الجدولان تحت `FORCE`، والترحيلُ يتّصل بـ`app_user` بلا `app.company_id` —
-- فبلا رفعٍ صريح **يمسّ التحديثُ صفرَ صفوفٍ بلا خطأٍ ولا تحذير**.
ALTER TABLE "contract_installments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "contracts" NO FORCE ROW LEVEL SECURITY;

UPDATE "contract_installments" i
SET "serviceStart" = i."dueDate",
    "serviceEnd" = GREATEST(
      i."dueDate",
      COALESCE(
        (SELECT MIN(n."dueDate") - 1
           FROM "contract_installments" n
          WHERE n."contractId" = i."contractId" AND n."dueDate" > i."dueDate"),
        (SELECT c."end" FROM "contracts" c WHERE c.id = i."contractId")
      )
    );

ALTER TABLE "contract_installments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;
