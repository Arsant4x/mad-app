-- ⚖️ ق-١٣٦٣ — الحركةُ اليدوية يُقيَّد لها قيد: حسابُ فروقات المخزون مقابل حساب المخزون، في الاتجاهين.
--
-- بنصّ المالك: «ويُنقض القرارُ القديم بحجّة. ⇒ فحركةٌ تُحرّك قيمةَ المخزون ولا تصل الدفتر تجعل الدفترَ لا يطابق ما على الرفّ، وهذا عينُ
-- ما بُني الحارسُ ليمنعه. … ⇒ ويسقط استثناءُ «اليدويّ» من معادلة الحارس، فيصير صارماً.»
--
-- المنقوض: «ولا قيدَ في الدفتر — كما لم يكن للحركة اليدوية قيد» (قراءةُ ㉘ المعلَنة — ق-١٠٦٣). والحركةُ تحمل قيدَها (journalEntryId)؛
-- **والقائمُ يُعدّ ويُعلَن ولا يُحوَّل** (ق-١١٧٨): حركاتٌ يدويةٌ سبقت البناء بلا قيد تبقى كما هي ويعدّها حارسُ المطابقة رقماً معلَناً.
-- والحسابُ `5810 فروقات المخزون` يُنشأ عند أوّل حاجة (نمط 1300/5800) — فلا كتابةَ هنا. والعدُّ داخل سياق كلِّ منشأة (ق-١٣٢٥).

ALTER TABLE "stock_movements" ADD COLUMN "journalEntryId" TEXT;
CREATE INDEX "stock_movements_journalEntryId_idx" ON "stock_movements"("journalEntryId");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- ق-١٢٥٢ — حارسُ الكتابة عبر المنشآت.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

DO $$
DECLARE
  c RECORD;
  k INTEGER;
  v NUMERIC;
  companies_n INTEGER := 0;
  legacy INTEGER := 0;
  legacy_in NUMERIC := 0;
  legacy_out NUMERIC := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*) INTO k FROM "stock_movements" WHERE "companyId" = c.id AND origin = 'MANUAL' AND type <> 'TRANSFER';
    legacy := legacy + k;

    SELECT COALESCE(sum(l."qtyReceived" * l."unitCost"), 0) INTO v
      FROM "inventory_layers" l JOIN "stock_movements" m ON m.id = l."sourceMovementId"
     WHERE m."companyId" = c.id AND l."sourceType" = 'ADJUSTMENT' AND m.origin = 'MANUAL';
    legacy_in := legacy_in + v;

    SELECT COALESCE(sum(ic.qty * ic."unitCost"), 0) INTO v
      FROM "inventory_consumptions" ic JOIN "stock_movements" m ON m.id = ic."movementId"
     WHERE m."companyId" = c.id AND m.origin = 'MANUAL' AND m.type <> 'TRANSFER';
    legacy_out := legacy_out + v;
  END LOOP;

  RAISE WARNING 'ق-١٣٦٣: % منشأة — حركاتٌ يدويةٌ قائمة (بلا تحويل) بلا قيد: % — طبقاتٌ أدخلتها بقيمة % واستهلاكاتٌ أخرجتها بقيمة %: تبقى بلا قيدٍ ولا تُحوَّل، ويعدّها حارسُ المطابقة «قديماً بلا قيد»؛ وما بعد اليوم يُقيَّد على 5810',
    companies_n, legacy, legacy_in, legacy_out;
END $$;
