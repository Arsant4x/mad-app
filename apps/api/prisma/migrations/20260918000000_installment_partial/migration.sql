-- ق-١٠٤٠ — السدادُ الجزئي للقسط: `PARTIAL` في التعداد، والحالةُ تُشتقّ من المقبوض مقابل الإجماليّ (SPEC 16.3).
--
-- كان مسارُ القبض يختم القسطَ `PAID` على أيّ دفعةٍ تحمله بلا مقارنة (contracts.service.ts) — فيخرج
-- الجزئيُّ من التذكيرات والتصعيد وتعدّه نسبةُ التحصيل محصَّلاً كاملاً؛ والدفترُ والأعمارُ والإقرارُ
-- صحيحةٌ بالبناء لأنها تقرأ صفوفَ نقطة الضريبة لا الحالة (ق-١٠٢٠). فالعلاجُ حقلُ حالةٍ يُشتقّ على
-- نمط الفاتورة (deriveSettlementStatus) — لا محرّكٌ يُبنى، ولا يُمسّ الاستحقاق.
--
-- ⛔ القائمُ يُعلَن ويُعدّ **ولا يُرحَّل رجعياً بلا حكم المالك** (شرطُه الرابع): أقساطٌ ختمها القديمُ
-- `PAID` بمقبوضٍ أقلَّ من مبلغها تُعدّ هنا ويُصرخ بعددها بـWARNING (لا NOTICE — ق-٦٩٥) ولا تُكتب —
-- التطوير 18 قسطاً (بقايا اختبار) · المنشور 0 (مقيسٌ في ق-١٠٢٠).
-- ⚠️ الجدولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً للعدّ ثم يُعاد.

-- AlterEnum — القيمةُ الجديدة (كما أُضيفت PARTIAL إلى InvoiceStatus في هجرة المقبوضات 4.5)
ALTER TYPE "InstallmentStatus" ADD VALUE 'PARTIAL';

ALTER TABLE "contract_installments" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_paid      integer;
  n_underpaid integer;
BEGIN
  SELECT count(*) INTO n_paid FROM "contract_installments" WHERE "status" = 'PAID';
  -- الإجماليُّ بالضريبة كما يقيسه الاستحقاق (rentAmountsOf): غيرُ الشامل الخاضع +15%، والباقي المبلغُ نفسُه.
  SELECT count(*) INTO n_underpaid
    FROM "contract_installments" i
    JOIN "contracts" c ON c.id = i."contractId"
    JOIN "units" u ON u.id = c."unitId"
    JOIN "properties" pr ON pr.id = u."propertyId"
    JOIN LATERAL (
      SELECT COALESCE(sum(r."netAmount" + r."discount"), 0) AS settled
        FROM "rent_payments" r WHERE r."installmentId" = i.id
    ) p ON true
   WHERE i."status" = 'PAID'
     AND p.settled < (CASE WHEN c."classification" = 'COMMERCIAL' AND c."vatInclusion" = 'EXCLUSIVE' AND pr."ownership" <> 'managed'
                           THEN round(i."amount" * 1.15, 2) ELSE i."amount" END) - 0.005;
  RAISE WARNING 'ق-١٠٤٠: أقساطٌ مختومةٌ PAID: % · منها مسدَّدةٌ بأقلَّ من مبلغها (تُترك كما هي — لا ترحيلَ رجعيّاً بلا حكم): %', n_paid, n_underpaid;
END $$;

ALTER TABLE "contract_installments" FORCE ROW LEVEL SECURITY;
