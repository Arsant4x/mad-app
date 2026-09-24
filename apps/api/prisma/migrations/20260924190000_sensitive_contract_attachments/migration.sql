-- ⚖️ ق-١٣٦٥ — مرفقاتُ العقود حسّاسةٌ الآن: تُغلَّف في المخزن الحسّاس وتُنزَّل عبر الخادم مفكوكةً، لا برابطٍ موقَّع.
--
-- بنصّ المالك (⑥): «مرفقاتُ العقود حسّاسةٌ الآن، ومستنداتُ الموظف حين تُبنى. ولا مخزنَ لهويّات النزلاء والمستأجرين، والحارسُ القائم
-- يبقى. والحساسيةُ بالمخزن لا بسؤال الرافع. والتنزيلُ من المخزن الحسّاس عبر الخادم يفكّ ويبثّ، لا برابطٍ موقَّع.»
--
-- لا عمودَ ولا كتابة: الحساسيةُ **بموضع الكائن** (companies/<id>/sensitive/…) لا بعلَمٍ في الصفّ — والشيفرةُ تكتب إليه وتفكّ منه.
-- **والقائمُ يُعدّ ويُعلَن ولا يُحوَّل** (ق-١١٧٨): مرفقاتٌ رُفعت قبل الغلاف تبقى في المخزن العاديّ بلا تشفير، وتُبثّ عبر الخادم مثلَها
-- (لا رابطَ موقَّعاً لمرفق عقدٍ بعد اليوم). والعدُّ داخل سياق كلِّ منشأة (ق-١٣٢٥).

DO $$
DECLARE
  c RECORD;
  k INTEGER;
  v BIGINT;
  companies_n INTEGER := 0;
  plain INTEGER := 0;
  plain_bytes BIGINT := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*), COALESCE(sum("size"), 0) INTO k, v FROM "contract_attachments"
     WHERE "companyId" = c.id AND "fileKey" NOT LIKE 'companies/%/sensitive/%';
    plain := plain + k;
    plain_bytes := plain_bytes + v;
  END LOOP;

  RAISE WARNING 'ق-١٣٦٥: % منشأة — مرفقاتُ عقودٍ قائمة قبل الغلاف: % (% بايت) — تبقى في المخزن العاديّ بلا تشفيرٍ ولا تُحوَّل، وتُبثّ عبر الخادم؛ وما بعد اليوم يُغلَّف في المخزن الحسّاس',
    companies_n, plain, plain_bytes;
END $$;
