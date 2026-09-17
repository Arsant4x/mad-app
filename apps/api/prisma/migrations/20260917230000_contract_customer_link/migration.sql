-- ق-١٠٢٨ · ق-١٠٢٩/② — ربطُ المستأجر بالعميل بالمعرّف لا بالاسم (§6.3 · ق-٤٩٧).
--
-- ① القيدُ الفريد على اسم العميل يسقط ويصير فهرساً عادياً (ق-١٠٢٨/⑤ — حكمُ المالك): غرضُه كان منعَ
--    التكرار الضمنيّ حين كان العقدُ يُنشئ عميلَه بالاسم، وقد زال بالربط الصريح؛ فيبقى ضررُه وحدَه —
--    شخصان حقيقيان بالاسم نفسِه لا يكونان عميلين. والتنبيهُ «يوجد عميلٌ بهذا الاسم، أهو نفسُه؟» يقع في
--    الخدمة عند الإنشاء (409 مسمّىً حتى يُؤكَّد) لا في القاعدة. ⛔ ولا توسيعَ بالهاتف — مفتاحٌ ضعيفٌ آخر.
--    مَن كان يعتمد على القيد — مقيسٌ قبل إسقاطه: بذرةُ التطوير (upsert بالمفتاح المركّب — صارت findFirst
--    ثم create)، وفحصُ الخدمة (صار تنبيهاً مؤكَّداً)، واختبارٌ واحد كان يتوقّع 409 (صار يتوقّع التنبيهَ ثم
--    القبول)، ولا معالجَ P2002 ولا إحالةَ باسم الفهرس في الشيفرة.
-- ② قيدُ CHECK: عقدٌ حيٌّ (غيرُ مسوّدة) لا يكون بلا عميل — فالخادمُ يُلزَم بالمعرّف في كل إنشاء، والقاعدةُ
--    تحبس ما قد يفلت (§6.6: طبقتان). المسوّداتُ التي سبقت هذه الهجرة بلا عميل (التطوير 33 · المنشور 0)
--    لا تخالفه؛ والمسوّدةُ الجديدة تُربط عند الإنشاء (ق-١٠٢٨/②).
-- ③ لا كتابةَ بيانات: الاسمُ المفترقُ على المنشور (EJ-2026-0003) يُصحَّح بالاشتقاق — العميلُ مصدرُ الحقيقة
--    والحقلُ مشتقٌّ منه عند القراءة وعند كل كتابة — لا بهجرةٍ تكتبه (ق-١٠٢٨/⑥).
-- والعدُّ يُعلَن بـWARNING لا NOTICE (ق-٦٩٥) — والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١).
-- ⚠️ الجدولان تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE عن contracts مؤقّتاً للعدّ ثم يُعاد.

-- ① الفرادةُ على الاسم تسقط، ويبقى فهرسُ البحث
DROP INDEX IF EXISTS "customers_companyId_name_key";
CREATE INDEX IF NOT EXISTS "customers_companyId_name_idx" ON "customers"("companyId", "name");

-- ② العقدُ الحيّ لا يكون بلا عميل — ويُعدّ ما يخالفه (يجب أن يكون صفراً) وما يُترك من مسوّدات
ALTER TABLE "contracts" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_live_unlinked  integer;
  n_draft_unlinked integer;
BEGIN
  SELECT count(*) INTO n_live_unlinked  FROM "contracts" WHERE "status" <> 'DRAFT' AND "customerId" IS NULL;
  SELECT count(*) INTO n_draft_unlinked FROM "contracts" WHERE "status" =  'DRAFT' AND "customerId" IS NULL;
  IF n_live_unlinked > 0 THEN
    RAISE EXCEPTION 'ق-١٠٢٩/②: % عقداً حيّاً بلا عميل — لا يُحبَس قيدُ العقد الحيّ فوق صفوفٍ تخالفه؛ تُربط بيدٍ أولاً', n_live_unlinked;
  END IF;
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_live_contract_has_customer" CHECK ("status" = 'DRAFT' OR "customerId" IS NOT NULL);
  RAISE WARNING 'ق-١٠٢٩/②: عقدٌ حيٌّ بلا عميل: % (يجب 0) · مسوّداتٌ بلا عميل تُترك كما هي: % · فرادةُ اسم العميل أُسقطت وصارت تنبيهاً في الخدمة', n_live_unlinked, n_draft_unlinked;
END $$;

ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;
