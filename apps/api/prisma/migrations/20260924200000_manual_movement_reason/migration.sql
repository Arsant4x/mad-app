-- ⭐ ق-١٣٧٧ — سببُ الحركة اليدوية إلزاميٌّ من اليوم.
--
-- بنصّ المالك: «والأسبابُ القائمةُ للحركات اليدوية كلُّها فارغة: فالسببُ يصير حقلاً إلزامياً من اليوم.»
-- القياسُ قبل البناء (ق-١٣٧٣): التطوير 409 حركةً يدويةً في منشأتين كلُّها بلا سبب · النظيفة 13 كلُّها بلا سبب — فالحقلُ الاختياريّ لم يُملأ قطّ.
--
-- طبقتان (§6.6): الخدمةُ ترفض برسالةٍ مسمّاة، وهذا القيدُ يحبس الإلزامَ في القاعدة **على ما بعد لحظة الهجرة** (نمطُ ق-٨٩٨):
-- فالقائمُ بلا سبب يبقى كما هو ويُعدّ ويُعلَن **ولا يُملأ بسببٍ مخترَع**، وما بعد اللحظة لا يُكتب بلا سبب ولو بغير الخدمة.
-- واللحظةُ تُلتقط وقتَ التنفيذ (clock_timestamp بتوقيت UTC، كما يكتب Prisma createdAt) وتُثبَّت حرفياً في نصّ القيد.
-- والعدُّ داخل سياق كلِّ منشأة (ق-١٣٢٥)، والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١). ولا كتابةَ على صفّ.

DO $$
DECLARE
  c RECORD;
  k INTEGER;
  companies_n INTEGER := 0;
  blank INTEGER := 0;
  cutover timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*) INTO k FROM "stock_movements"
     WHERE "companyId" = c.id AND origin = 'MANUAL' AND ("reason" IS NULL OR btrim("reason") = '');
    blank := blank + k;
  END LOOP;

  -- الحبس: حركةٌ يدويةٌ بلا سبب لا تصحّ إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_manual_reason_required" CHECK (origin <> ''MANUAL'' OR "createdAt" < %L OR ("reason" IS NOT NULL AND btrim("reason") <> ''''))',
    cutover
  );

  RAISE WARNING 'ق-١٣٧٧: % منشأة — حركاتٌ يدويةٌ قائمة بلا سبب: % — تبقى كما هي ولا تُملأ بسببٍ مخترَع؛ والسببُ إلزاميٌّ لكلِّ حركةٍ يدويةٍ بعد % (لحظة الهجرة، UTC)',
    companies_n, blank, cutover;
END $$;
