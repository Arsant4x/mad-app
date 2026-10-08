-- ⚖️ توجيه ٢٨٦ (البندان ٨ و٤) — معرّفُ المشتري البديل (BR-KSA-14) ورقمُ هويّة المستأجر: يُشفَّران في التطبيق
-- بنمط هويّة الموظف (ق-١٣٤٥). المرحلةُ الأولى من اثنتين.
--
-- كان `customers.otherId` نصّاً صريحاً (هويّةٌ وطنية · إقامة · جواز · سجلٌّ تجاريّ) يصل كلَّ نسخةٍ ومقلبٍ وتصدير. فيُضاف:
--   • `otherIdCipher` نصٌّ مشفَّرٌ `f1:<معرّفُ المفتاح>:…` مربوطٌ بـ`companyId|customers.otherId|customerId`.
--   • `otherIdIndex` بصمةُ بحثٍ `b1:<معرّفُ المفتاح>:…` بمفتاحٍ منفصل، مجالُها المنشأة.
--   • وعلى العقد `tenantIdCipher`/`tenantIdIndex` بالشكل نفسِه (حكمُ صاحب المشروع على السؤال ٩٤٨، الخيار «ب»).
--
-- ⛔ **والتشفيرُ لا يقع هنا**: المفتاحُ خارج القاعدة (`PII_ENCRYPTION_KEYS`)، فلا تستطيع هجرةٌ أن تكتب نصّاً مشفَّراً.
-- فالصفوفُ القائمة تُشفَّر بسكربتٍ في التطبيق (`scripts/backfill-customer-id-encryption.ts`) يكتب النصَّ والبصمة **ويمحو
-- الصريحَ في التحديث نفسِه**؛ ثم تُسقط الهجرةُ الثانية (`20261008120000_customer_id_plaintext_dropped`) العمودَ الصريح
-- **وترفض بخطأٍ صاخب إن بقي فيه رقمٌ واحد** — فلا يُسقط عمودٌ قبل أن تُنقل بياناتُه.
--
-- ⚠️ **ترتيبُ النشر** (DEPLOY.md §6): على قاعدةٍ فيها أرقامٌ صريحة تسقط الثانيةُ ولا تكتب شيئاً، فيُشغَّل السكربتُ ثم
-- `migrate resolve --rolled-back 20261008120000_customer_id_plaintext_dropped` ثم يُعاد النشر — مسارُ (ج) في §6. وعلى قاعدةٍ
-- بلا أرقام (السيرُ والتطوير النظيف) تمرّ الاثنتان معاً. والعمودُ الصريح باقٍ بين المرحلتين، والقيدُ الانتقاليّ أدناه يقبل
-- الزوجَ صريحاً أو مشفَّراً — فالشيفرةُ الجديدة (تكتب المشفَّرَ وحدَه) تعمل على القاعدة في الحالين.
--
-- لا بياناتَ تُكتب هنا (لا UPDATE) — والعدُّ يُعلَن بـWARNING (ق-٦٩٥) ليُعرف قبل الثانية كم ينتظر السكربت.

ALTER TABLE "customers" ADD COLUMN "otherIdCipher" TEXT;
ALTER TABLE "customers" ADD COLUMN "otherIdIndex" TEXT;
CREATE INDEX "customers_companyId_otherIdIndex_idx" ON "customers"("companyId", "otherIdIndex");

ALTER TABLE "contracts" ADD COLUMN "tenantIdCipher" TEXT;
ALTER TABLE "contracts" ADD COLUMN "tenantIdIndex" TEXT;
CREATE INDEX "contracts_companyId_tenantIdIndex_idx" ON "contracts"("companyId", "tenantIdIndex");

-- ═══ القيود — لا نصَّ صريحاً في الأعمدة الجديدة ولو بمسارٍ يتجاوز التطبيق ═══
ALTER TABLE "customers" ADD CONSTRAINT "customers_other_id_ciphertext_only" CHECK (
  ("otherIdCipher" IS NULL OR "otherIdCipher" LIKE 'f1:%')
  AND ("otherIdIndex" IS NULL OR "otherIdIndex" LIKE 'b1:%')
  AND (("otherIdCipher" IS NULL) = ("otherIdIndex" IS NULL))
);
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_ciphertext_only" CHECK (
  ("tenantIdCipher" IS NULL OR "tenantIdCipher" LIKE 'f1:%')
  AND ("tenantIdIndex" IS NULL OR "tenantIdIndex" LIKE 'b1:%')
  AND (("tenantIdCipher" IS NULL) = ("tenantIdIndex" IS NULL))
);

-- الزوجُ في المرحلة الانتقالية: المخطّطُ مع رقمٍ — صريحٍ قديم أو مشفَّرٍ جديد — لا مع الاثنين ولا بلا أحدهما.
-- (القيدُ القديم `customers_other_id_pair` يشترط الصريحَ مع المخطّط، فيرفض ما تكتبه الشيفرةُ الجديدة.)
ALTER TABLE "customers" DROP CONSTRAINT "customers_other_id_pair";
ALTER TABLE "customers" ADD CONSTRAINT "customers_other_id_pair_transition" CHECK (
  ("otherIdScheme" IS NULL) = (COALESCE("otherId", "otherIdCipher") IS NULL)
  AND NOT ("otherId" IS NOT NULL AND "otherIdCipher" IS NOT NULL)
);

-- العدُّ تحت FORCE يرى صفراً لدور التطبيق (ق-٢٦٢) — يُرفع مؤقّتاً ليرى المالكُ الصفوفَ كلَّها ثم يُعاد.
ALTER TABLE "customers" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_plain integer;
BEGIN
  SELECT count(*) INTO n_plain FROM "customers" WHERE "otherId" IS NOT NULL;
  RAISE WARNING 'توجيه ٢٨٦: % عميلاً يحمل معرّفاً بديلاً صريحاً — يُشفَّر بـscripts/backfill-customer-id-encryption.ts قبل أن تُسقط الهجرةُ التالية العمودَ (وتسقط هي إن بقي واحد)',
    n_plain;
END $$;

ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
