-- ⚖️ ق-١٣٦١ — الضريبةُ بلا فاتورةٍ صحيحة (excludeFromVat) تدخل تكلفةَ ما اشتُري عند الشراء، كالمنسوب إلى المعفى.
--
-- بنصّ المالك: «⇒ فهي غيرُ مستردّة، والمعاييرُ لا تفرّق بسبب عدم الاسترداد. ⚠️ والتعليقُ في المخطَّط «تمسّ الإقرارَ وحده» يُصحَّح معه.»
--
-- لا عمودَ جديد ولا كتابة: الحكمُ في الشيفرة (`non-deductible-vat.util.ts` — المستندُ غيرُ المستردّ = منسوبٌ إلى المعفى **أو** بلا فاتورةٍ
-- صحيحة)، **والقائمُ يُعدّ ويُعلَن ولا يُحوَّل** (ق-١١٧٨): ما سبق هذه الهجرة من مستنداتٍ بلا فاتورةٍ صحيحة يبقى في 1250 ويعدّه الإقرار.
-- ⚠️ **ويُعدّ ما وُلد متتبَّعاً بعد `ق-١٣٤٢` بلا حدث** (العمودُ `nonDeductibleTracked` افتراضُه true) — فأوّلُ تعديلٍ عليه يرحّله بتاريخ التعديل
-- لا الشراء. **مقيسٌ صفراً قبل الهجرة** على التطوير والنظيفة (الشراءان بلا فاتورةٍ صحيحة على كلٍّ ملغيان) — فيُعدّ ويُعلَن ولا يُكتب
-- (كتابةٌ على جدولٍ تحت FORCE ترفع الحماية صراحةً — ق-٢٦٢ — ولا داعيَ لها على صفر). والعدُّ داخل سياق كلِّ منشأة (ق-١٣٢٥).

DO $$
DECLARE
  c RECORD;
  k INTEGER;
  v NUMERIC;
  companies_n INTEGER := 0;
  tracked_no_event INTEGER := 0;
  legacy INTEGER := 0;
  legacy_vat NUMERIC := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*) INTO k
      FROM "purchases" p
     WHERE p."excludeFromVat" AND p."nonDeductibleTracked" AND NOT p."exempt" AND p."baseTaxAmount" > 0 AND p."voidedAt" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "non_deductible_vat_events" e WHERE e."purchaseId" = p.id);
    tracked_no_event := tracked_no_event + k;

    SELECT count(*), COALESCE(sum("baseTaxAmount"), 0) INTO k, v
      FROM "purchases"
     WHERE "excludeFromVat" AND NOT "nonDeductibleTracked" AND NOT "exempt" AND "baseTaxAmount" > 0 AND "voidedAt" IS NULL;
    legacy := legacy + k;
    legacy_vat := legacy_vat + v;
  END LOOP;

  RAISE WARNING 'ق-١٣٦١: % منشأة — مستنداتٌ قائمة بلا فاتورةٍ ضريبيةٍ صحيحة بضريبة: % بمجموع % — تبقى في 1250 ولا تُحوَّل، ويعدّها الإقرارُ غيرَ مرحَّلة؛ ومتتبَّعةٌ وُلدت بعد ق-١٣٤٢ بلا حدث: % (يرحّلها أوّلُ تعديلٍ بتاريخه)',
    companies_n, legacy, legacy_vat, tracked_no_event;
END $$;
