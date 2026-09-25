-- ⚖️ رقمُ السطر في مستنده — ترتيبٌ معلَنٌ لا مصادَف (ق-١٤١٢ · مكسورُ اليوم ب في التوجيه ٢٦٣)
--
-- كانت سطورُ الفاتورة والعرض تُقرأ **بلا ترتيب** (`lines: true`) فتأتي بترتيبها على القرص، وهو يتبدّل بما
-- يُحذف ويُكتب حولها: فأسقط اختبارَ الخصم متقطّعاً (`line-discount ③` — `[0,20]` بدل `[20,0]`)، **ومستندٌ
-- يُختم يكتب `cbc:ID` بترتيب القراءة** فيمكن أن تُطبع فاتورةٌ بترتيبٍ غيرِ ما خُتمت به. ولا عمودَ يحمل
-- الترتيب: `createdAt` واحدٌ لسطور المستند كلِّها (بدايةُ المعاملة — مقيسٌ: ٢٢٤ فاتورةً متعددةَ السطور
-- على التطوير كلُّها متعادلة) و`id` عشوائيّ.
--
-- ⟸ `lineNo` على `invoice_lines` و`quote_lines` — **بلا DEFAULT**: الخادمُ يُلزَم أن يذكره في كل إنشاء
-- (`numberLines`)، ومكرَّرُه في المستند الواحد يُرفض بفريدٍ هو نفسُه الفهرسُ الذي تقرأ به السطورُ مستندَها
-- (لم يكن على `invoice_lines."invoiceId"` فهرسٌ قطّ).
--
-- ⛔ القائمُ يُعلَن ولا يُخمَّن له أصل: **ترتيبُ الإدخال لم يُحفظ قطّ**، فالرقمُ للقائم يُكتب من ترتيبه على
-- القرص لحظةَ الهجرة (`ctid`) — وهو ما كانت الشاشاتُ تعرضه غالباً — ويُعدّ ما كان منه متعددَ السطور
-- ويُصرخ به. **ومستندٌ مختومٌ بأكثر من سطر حالٌ لا تُكتب بيدٍ هنا**: حجّةُ ترتيبه `cbc:ID` في XML الموقَّع
-- ولم يُبنَ استخراجُه (مقيسٌ صفراً على التطوير والمنشور 2026-09-24) — فتتوقّف الهجرةُ وتسمّي العدد.
--
-- ⚠️ الجداولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها
-- (و`invoices` معها — فعدُّ المختوم بلا رؤيتها صفرٌ كاذب) ثم يُعاد. والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١).

-- AlterTable — تُضاف قابلةً للفراغ لحظةً واحدة، ثم تُملأ، ثم تُلزَم.
ALTER TABLE "invoice_lines" ADD COLUMN "lineNo" INTEGER;
ALTER TABLE "quote_lines" ADD COLUMN "lineNo" INTEGER;

ALTER TABLE "invoices" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "quote_lines" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_stamped_multi integer;
  n_inv_lines     integer;
  n_inv_multi     integer;
  n_quote_lines   integer;
  n_quote_multi   integer;
BEGIN
  -- ① المختومُ متعددُ السطور: ترتيبُه في XML الموقَّع لا على القرص — لا يُكتب هنا.
  SELECT count(*) INTO n_stamped_multi
    FROM "invoices" AS i
   WHERE i."zatcaSignedXml" IS NOT NULL
     AND (SELECT count(*) FROM "invoice_lines" AS l WHERE l."invoiceId" = i.id) > 1;
  IF n_stamped_multi > 0 THEN
    RAISE EXCEPTION 'ق-١٤١٢: % مستندٍ مختومٍ بأكثر من سطر — حجّةُ ترتيب سطوره cbc:ID في XML الموقَّع ولم يُبنَ استخراجُه؛ يُحكم فيه قبل الترقية', n_stamped_multi;
  END IF;

  -- ② سطورُ الفواتير: الرقمُ من الترتيب على القرص لحظةَ الهجرة — ويُعدّ المتعدد.
  SELECT count(*) INTO n_inv_multi FROM (SELECT "invoiceId" FROM "invoice_lines" GROUP BY "invoiceId" HAVING count(*) > 1) AS t;
  UPDATE "invoice_lines" AS l
     SET "lineNo" = n.rn
    FROM (SELECT id, row_number() OVER (PARTITION BY "invoiceId" ORDER BY ctid) AS rn FROM "invoice_lines") AS n
   WHERE n.id = l.id;
  GET DIAGNOSTICS n_inv_lines = ROW_COUNT;

  -- ③ سطورُ العروض: كذلك.
  SELECT count(*) INTO n_quote_multi FROM (SELECT "quoteId" FROM "quote_lines" GROUP BY "quoteId" HAVING count(*) > 1) AS t;
  UPDATE "quote_lines" AS l
     SET "lineNo" = n.rn
    FROM (SELECT id, row_number() OVER (PARTITION BY "quoteId" ORDER BY ctid) AS rn FROM "quote_lines") AS n
   WHERE n.id = l.id;
  GET DIAGNOSTICS n_quote_lines = ROW_COUNT;

  RAISE WARNING 'ق-١٤١٢: رقمُ السطر كُتب لـ% سطرَ فاتورة و% سطرَ عرض؛ منها % فاتورةً و% عرضاً بأكثر من سطر — ترتيبُها المعلَن من اليوم ترتيبُها على القرص لحظةَ الهجرة (ما كانت تعرضه الشاشاتُ غالباً، لا ترتيبُ إدخالٍ محفوظ): يُعدّ ولا يُخمَّن غيرُه',
    n_inv_lines, n_quote_lines, n_inv_multi, n_quote_multi;
END $$;

ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "quote_lines" FORCE ROW LEVEL SECURITY;

-- الإلزام — بلا DEFAULT: الخادمُ يُلزَم أن يذكر رقمَ السطر في كل إنشاء.
ALTER TABLE "invoice_lines" ALTER COLUMN "lineNo" SET NOT NULL;
ALTER TABLE "quote_lines" ALTER COLUMN "lineNo" SET NOT NULL;

-- CreateIndex — الفريدُ في المستند، وهو فهرسُ القراءة بالترتيب.
CREATE UNIQUE INDEX "invoice_lines_invoiceId_lineNo_key" ON "invoice_lines"("invoiceId", "lineNo");
CREATE UNIQUE INDEX "quote_lines_quoteId_lineNo_key" ON "quote_lines"("quoteId", "lineNo");
