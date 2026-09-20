-- ⑧ فئةُ ضريبة القيمة المضافة على الصنف وسطر المستند (ق-١٢١١ · ق-١٢١٢ · ق-١٢٢٣ · ق-١٢٢٥)
--
-- الفئةُ **تُعلَن على الصنف** (`S` · `Z` · `E` · `O` — معيارُ XML §11.2.4) **وتُنسخ إلى سطر الفاتورة
-- والعرض لحظةَ البيع** كما تُنسخ الوحدة؛ والنسبةُ مشتقّةٌ منها (مصدرٌ واحد في الشيفرة) لا مُدخَلة.
--
-- ⛔ القديمُ يُعلَن ولا يُصحَّح — لا في الأصناف ولا في السطور (حكم المالك، ق-١٢٢٥/②):
--   · كلُّ صنفٍ قائم يُختم `LEGACY_STANDARD` («كان يُرَنّ بالنسبة الأساسية قبل أن يوجد الحقل ولم يُعلن
--     التاجرُ فئتَه») — يُعدّ ويُصرخ به، وبطاقةُ الصنف تحمل لوحةَ الإعلان.
--   · كلُّ سطرٍ قائم كُتب بالنسبة الأساسية ⟵ `S` (إعلانٌ لا تخمين: النسبةُ الأساسية هي `S` بعينها)،
--     وكلُّ سطرٍ كُتب بصفرٍ ⟵ `LEGACY_ZERO` — لا يُعرف أزيروٌ هو أم معفىً أم خارج النطاق، فيُعدّ
--     في الإقرار ويُعلَن ولا يُنسب إلى خانة (أوّلُ صفٍّ يقول «لا أعرف» بدل أن يختار — ق-١٢٢٣).
--   · وسطرٌ بنسبةٍ ليست صفراً ولا الأساسية حالٌ لا تُعلَن بيدٍ هنا: تتوقّف الهجرةُ وتسمّي العدد.
--
-- ⭐ والحبسُ في القاعدة لا في العادة (سابقةُ ق-٨٩٢): قيدُ CHECK يمنع القيمةَ القديمة على أيّ صفٍّ
-- أُنشئ بعد لحظة هذه الهجرة — «قيمةٌ قديمة يقبلها الخادمُ لصفٍّ جديد افتراضٌ صامتٌ باسمٍ جديد».
-- اللحظةُ تُلتقط وقتَ التنفيذ (clock_timestamp بتوقيت UTC كما يكتب Prisma createdAt) وتُثبَّت حرفياً.
-- `LEGACY_STANDARD` على السطر **ليس محبوساً**: سطرٌ يُباع اليوم من صنفٍ لم يُعلَن يرثه كما هو
-- (استمرارٌ لا تصحيح) ويُعدّ في الإقرار «بيعٌ بقيمةٍ قديمة».
--
-- والاقترانُ بين الفئة والسبب والنسبة قيودُ CHECK هنا لا في الخدمة وحدها: سببٌ من القائمة إلزاميٌّ
-- لـ`Z`/`E`، و`VATEX-SA-OOS` بنصٍّ من ٣ إلى ٢٥٠ حرفاً بعد القصّ لـ`O` (ق-١٢٢٢)، ولا سببَ على `S`؛
-- والنسبةُ موجبةٌ للأساسية وصفرٌ لغيرها. (عضويةُ الرمز في قائمة الهيئة تُفحص في الخدمة من المصدر
-- الواحد `common/vat/exemption-reasons.ts` — قائمةٌ واحدة لا قائمتان.)
--
-- ⚠️ الجداولُ الثلاثة تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ
-- كلَّها ثم يُعاد. والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١) — فعلى قاعدةٍ فارغة تصرخ الهجرةُ بأصفار.

-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('S', 'Z', 'E', 'O', 'LEGACY_STANDARD', 'LEGACY_ZERO');

-- AlterTable — تُضاف قابلةً للفراغ لحظةً واحدة، ثم تُملأ، ثم تُلزَم.
ALTER TABLE "products" ADD COLUMN "taxCategory" "TaxCategory",
ADD COLUMN "taxExemptionReasonCode" TEXT,
ADD COLUMN "taxExemptionReason" TEXT;

ALTER TABLE "invoice_lines" ADD COLUMN "taxCategory" "TaxCategory",
ADD COLUMN "taxExemptionReasonCode" TEXT,
ADD COLUMN "taxExemptionReason" TEXT;

-- سطرُ العرض كان بلا `createdAt` — يُضاف هنا ليحبس القيدُ القيمةَ القديمة على ما سبق الهجرة كما في
-- سطر الفاتورة؛ والقائمُ يأخذ بدايةَ معاملة الهجرة وهي أسبقُ من لحظة الالتقاط أدناه.
ALTER TABLE "quote_lines" ADD COLUMN "taxCategory" "TaxCategory",
ADD COLUMN "taxExemptionReasonCode" TEXT,
ADD COLUMN "taxExemptionReason" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "quote_lines" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_products        integer;
  n_products_legacy integer;
  n_inv_other       integer;
  n_inv_standard    integer;
  n_inv_zero        integer;
  n_quote_other     integer;
  n_quote_standard  integer;
  n_quote_zero      integer;
  cutover           timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  -- ① الأصناف: كلُّ قائمٍ «قديمٌ بالنسبة الأساسية» — يُعدّ ولا يُصحَّح.
  SELECT count(*) INTO n_products FROM "products";
  UPDATE "products" SET "taxCategory" = 'LEGACY_STANDARD' WHERE "taxCategory" IS NULL;
  GET DIAGNOSTICS n_products_legacy = ROW_COUNT;

  -- ② سطورُ الفواتير: نسبةٌ ليست صفراً ولا الأساسية حالٌ لا تُعلَن هنا — تتوقّف الهجرة وتسمّي العدد.
  -- (الرقمُ 15 هنا تاريخٌ لا مصدرٌ للنسبة: هو ما كُتب على السطور القائمة يومَ كُتبت.)
  SELECT count(*) INTO n_inv_other FROM "invoice_lines" WHERE "taxCategory" IS NULL AND "taxRate" <> 0 AND "taxRate" <> 15;
  IF n_inv_other > 0 THEN
    RAISE EXCEPTION 'ق-١٢٢٥: % سطرَ فاتورةٍ بنسبةٍ ليست صفراً ولا الأساسية — لا تُعلَن فئتُها بالهجرة؛ يُحكم فيها قبل الترقية', n_inv_other;
  END IF;
  UPDATE "invoice_lines" SET "taxCategory" = 'S' WHERE "taxCategory" IS NULL AND "taxRate" = 15;
  GET DIAGNOSTICS n_inv_standard = ROW_COUNT;
  UPDATE "invoice_lines" SET "taxCategory" = 'LEGACY_ZERO' WHERE "taxCategory" IS NULL AND "taxRate" = 0;
  GET DIAGNOSTICS n_inv_zero = ROW_COUNT;

  -- ③ سطورُ العروض: كذلك.
  SELECT count(*) INTO n_quote_other FROM "quote_lines" WHERE "taxCategory" IS NULL AND "taxRate" <> 0 AND "taxRate" <> 15;
  IF n_quote_other > 0 THEN
    RAISE EXCEPTION 'ق-١٢٢٥: % سطرَ عرضٍ بنسبةٍ ليست صفراً ولا الأساسية — لا تُعلَن فئتُها بالهجرة؛ يُحكم فيها قبل الترقية', n_quote_other;
  END IF;
  UPDATE "quote_lines" SET "taxCategory" = 'S' WHERE "taxCategory" IS NULL AND "taxRate" = 15;
  GET DIAGNOSTICS n_quote_standard = ROW_COUNT;
  UPDATE "quote_lines" SET "taxCategory" = 'LEGACY_ZERO' WHERE "taxCategory" IS NULL AND "taxRate" = 0;
  GET DIAGNOSTICS n_quote_zero = ROW_COUNT;

  -- ④ الحبس: القيمةُ القديمة لا تصحّ إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "products" ADD CONSTRAINT "products_legacy_tax_category_before_cutover" CHECK ("taxCategory" <> ''LEGACY_STANDARD'' OR "createdAt" < %L)',
    cutover
  );
  EXECUTE format(
    'ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_legacy_zero_before_cutover" CHECK ("taxCategory" <> ''LEGACY_ZERO'' OR "createdAt" < %L)',
    cutover
  );
  EXECUTE format(
    'ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_legacy_zero_before_cutover" CHECK ("taxCategory" <> ''LEGACY_ZERO'' OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'ق-١٢٢٥: % من % صنفاً قائماً خُتم «قديمٌ بالنسبة الأساسية» (LEGACY_STANDARD)؛ وسطورُ الفواتير: % بالأساسية ⟵ S و% بصفرٍ ⟵ LEGACY_ZERO؛ وسطورُ العروض: % ⟵ S و% ⟵ LEGACY_ZERO — تُعدّ ولا تُصحَّح رجعياً؛ والقيمُ القديمة محبوسةٌ على ما سبق % (لحظة الهجرة، UTC)',
    n_products_legacy, n_products, n_inv_standard, n_inv_zero, n_quote_standard, n_quote_zero, cutover;
END $$;

ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "quote_lines" FORCE ROW LEVEL SECURITY;

-- الاقترانُ بين الفئة والسبب — في القاعدة لا في العادة.
ALTER TABLE "products" ADD CONSTRAINT "products_tax_category_not_legacy_zero" CHECK ("taxCategory" <> 'LEGACY_ZERO');
ALTER TABLE "products" ADD CONSTRAINT "products_tax_reason_coupling" CHECK (
  ("taxCategory" IN ('S', 'LEGACY_STANDARD') AND "taxExemptionReasonCode" IS NULL AND "taxExemptionReason" IS NULL)
  OR ("taxCategory" IN ('Z', 'E') AND "taxExemptionReasonCode" IS NOT NULL AND "taxExemptionReason" IS NULL)
  OR ("taxCategory" = 'O' AND "taxExemptionReasonCode" = 'VATEX-SA-OOS' AND "taxExemptionReason" IS NOT NULL
      AND char_length(btrim("taxExemptionReason")) BETWEEN 3 AND 250)
);

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tax_reason_coupling" CHECK (
  ("taxCategory" IN ('S', 'LEGACY_STANDARD', 'LEGACY_ZERO') AND "taxExemptionReasonCode" IS NULL AND "taxExemptionReason" IS NULL)
  OR ("taxCategory" IN ('Z', 'E') AND "taxExemptionReasonCode" IS NOT NULL AND "taxExemptionReason" IS NULL)
  OR ("taxCategory" = 'O' AND "taxExemptionReasonCode" = 'VATEX-SA-OOS' AND "taxExemptionReason" IS NOT NULL
      AND char_length(btrim("taxExemptionReason")) BETWEEN 3 AND 250)
);
-- النسبةُ تتبع الفئة: موجبةٌ للأساسية وصفرٌ لغيرها (قيمتُها من المصدر الواحد في الشيفرة).
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tax_rate_matches_category" CHECK (
  ("taxCategory" IN ('S', 'LEGACY_STANDARD') AND "taxRate" > 0)
  OR ("taxCategory" NOT IN ('S', 'LEGACY_STANDARD') AND "taxRate" = 0)
);

ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tax_reason_coupling" CHECK (
  ("taxCategory" IN ('S', 'LEGACY_STANDARD', 'LEGACY_ZERO') AND "taxExemptionReasonCode" IS NULL AND "taxExemptionReason" IS NULL)
  OR ("taxCategory" IN ('Z', 'E') AND "taxExemptionReasonCode" IS NOT NULL AND "taxExemptionReason" IS NULL)
  OR ("taxCategory" = 'O' AND "taxExemptionReasonCode" = 'VATEX-SA-OOS' AND "taxExemptionReason" IS NOT NULL
      AND char_length(btrim("taxExemptionReason")) BETWEEN 3 AND 250)
);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tax_rate_matches_category" CHECK (
  ("taxCategory" IN ('S', 'LEGACY_STANDARD') AND "taxRate" > 0)
  OR ("taxCategory" NOT IN ('S', 'LEGACY_STANDARD') AND "taxRate" = 0)
);

-- الإلزام — بلا DEFAULT: الخادمُ يُلزَم أن يذكر الفئةَ في كل إنشاء.
ALTER TABLE "products" ALTER COLUMN "taxCategory" SET NOT NULL;
ALTER TABLE "invoice_lines" ALTER COLUMN "taxCategory" SET NOT NULL;
ALTER TABLE "quote_lines" ALTER COLUMN "taxCategory" SET NOT NULL;
