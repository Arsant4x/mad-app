-- ⚖️ ق-١٤٦٦ (التوجيه ٢٦٦ §٤ب) — «يُرفض المستندُ برسالة ولا يمرّ بلا قيد، **وأعلن عددَ القائم بلا قيد**».
--
-- هجرةٌ **تعدّ ولا تكتب**: ما حُفظ قبل هذا البناء بلا قيدٍ لغياب حسابٍ في الدليل (كان الترحيلُ «يتخطّى ناعماً») يُعلَن
-- عددُه على كلّ قاعدةٍ لحظةَ نشرها — لا يُصلَح هنا ولا يُرحَّل رجعياً (قرارُ ما يُفعل به للمالك).
--
-- ⚠️ الجداولُ تحت FORCE: العدُّ **داخل سياق كلّ منشأة** (set_config) — بلا سياقٍ يعود كلُّ عدٍّ صفراً بنجاح (قاعدة
-- 2026-08-12)؛ والسياقُ يُقرأ بعد ضبطه (الآليةُ لا الأثر). وعلى قاعدةٍ فارغة يُعلن أصفاراً ولا يرمي.
-- والمعيارُ ما يُتوقَّع له قيد: المبلغُ موجب (أو غيرُ صفرٍ للسندات) — فالصفرُ لا قيدَ له مشروعاً.

DO $$
DECLARE
  c RECORD;
  seen TEXT;
  inv BIGINT := 0; pur BIGINT := 0; pay BIGINT := 0; spay BIGINT := 0; rent BIGINT := 0; keym BIGINT := 0; maint BIGINT := 0;
  companies_with INTEGER := 0;
  k BIGINT;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    PERFORM set_config('app.company_id', c.id, true);
    seen := current_setting('app.company_id', true);
    IF seen IS DISTINCT FROM c.id THEN RAISE EXCEPTION 'السياقُ لم يُضبط للمنشأة %', c.id; END IF;
    k := 0;
    inv   := inv   + (SELECT count(*) FROM invoices WHERE "journalEntryId" IS NULL AND "baseTotal" > 0);
    pur   := pur   + (SELECT count(*) FROM purchases WHERE "journalEntryId" IS NULL AND "baseTotal" > 0);
    pay   := pay   + (SELECT count(*) FROM payments WHERE "journalEntryId" IS NULL AND amount <> 0);
    spay  := spay  + (SELECT count(*) FROM supplier_payments WHERE "journalEntryId" IS NULL AND amount <> 0);
    rent  := rent  + (SELECT count(*) FROM rent_payments WHERE "journalEntryId" IS NULL AND "netAmount" > 0);
    keym  := keym  + (SELECT count(*) FROM contract_key_money WHERE "journalEntryId" IS NULL AND "baseAmount" > 0);
    maint := maint + (SELECT count(*) FROM maintenance_requests WHERE "journalEntryId" IS NULL AND "baseCost" > 0);
    SELECT (SELECT count(*) FROM invoices WHERE "journalEntryId" IS NULL AND "baseTotal" > 0)
         + (SELECT count(*) FROM purchases WHERE "journalEntryId" IS NULL AND "baseTotal" > 0)
         + (SELECT count(*) FROM payments WHERE "journalEntryId" IS NULL AND amount <> 0)
         + (SELECT count(*) FROM supplier_payments WHERE "journalEntryId" IS NULL AND amount <> 0)
         + (SELECT count(*) FROM rent_payments WHERE "journalEntryId" IS NULL AND "netAmount" > 0)
         + (SELECT count(*) FROM contract_key_money WHERE "journalEntryId" IS NULL AND "baseAmount" > 0)
         + (SELECT count(*) FROM maintenance_requests WHERE "journalEntryId" IS NULL AND "baseCost" > 0)
      INTO k;
    IF k > 0 THEN companies_with := companies_with + 1; END IF;
  END LOOP;
  PERFORM set_config('app.company_id', '', true);

  RAISE WARNING 'مستنداتٌ قائمةٌ بلا قيد (ق-١٤٦٦) في % منشأة — فواتير: % · مشتريات: % · سندات قبض: % · سندات صرف: % · دفعات إيجار: % · خلوّ: % · صيانة: %',
    companies_with, inv, pur, pay, spay, rent, keym, maint;
END $$;
