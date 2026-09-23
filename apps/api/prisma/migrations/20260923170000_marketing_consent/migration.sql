-- الموافقةُ التسويقية — وقائعُ تُلحَق ولا تُعدَّل (ق-١٣٠٣ · ك/⑰A1).
--
-- النصُّ الذي فرض الشكل:
--   • النظام م٢٥ — لا تُستعمل وسائلُ الاتصال الشخصية لإرسال موادَّ دعائيةٍ أو توعوية إلا
--     بموافقة المتلقّي المستهدف، ومع آليةٍ واضحة للتوقّف.
--   • النظام م٥/٢ — الرجوعُ عن الموافقة في أيّ وقت.
--   • اللائحة م٢٨ — لكلِّ قناةٍ خيارُها · والموافقةُ تُوثَّق بوسيلةٍ للتحقّق مستقبلاً
--     ويُحتفظ بإثباتها · والتوقّفُ فور الطلب وبلا مقابل.
--
-- ولماذا ملحقٌ فقط في القاعدة لا في الخدمة: «يُحتفظ بإثبات الموافقة» (م٢٨/٣) — وصفٌّ
-- يُدهَس أو يُحذف يمحو الإثباتَ الذي توجبه المادة. والمنعُ في الخدمة يمرّ عليه
-- `deleteMany` و`DELETE` خاماً — وهي المسارات نفسُها التي أُثبتت حيّاً على `task_logs`،
-- فيُستعمل المسارُ المُثبَت لا مسارٌ ثانٍ.

CREATE TABLE "marketing_consents" (
    "id"         TEXT NOT NULL,
    "companyId"  TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    -- القناةُ من كتالوج `MARKETING_CHANNELS` — قيدٌ لا تعداد: القنواتُ تُضاف بمحوِّلٍ جديد.
    "channel"    TEXT NOT NULL,
    -- موافقةٌ أم رجوعٌ عنها. والرجوعُ صفٌّ جديد لا حذفٌ للأوّل.
    "granted"    BOOLEAN NOT NULL,
    -- كيف وصلت — من كتالوج `CONSENT_SOURCES`.
    "source"     TEXT NOT NULL,
    "note"       TEXT,
    -- متى وقعت كما يعلنها التاجر (قد يسجّلها بعد يوم) — ولا تُقبل من المستقبل.
    "at"         TIMESTAMP(3) NOT NULL,
    -- ومن سجّلها — فالإثباتُ بلا مسجِّلٍ دعوى.
    "actorType"  TEXT NOT NULL,
    "actorId"    TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "marketing_consents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Cascade على العميل: إثباتُ موافقةٍ عن شخصٍ مُحي هو بيانٌ عنه بلا صاحب — فيذهب معه.
ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "marketing_consents_companyId_customerId_channel_at_idx"
  ON "marketing_consents"("companyId", "customerId", "channel", "at");

-- القناةُ والمصدرُ: قائمتان مقيَّدتان — وحارسٌ يقابلهما بالكتالوج في الشيفرة.
ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_channel_check"
  CHECK ("channel" IN ('SMS', 'EMAIL', 'WHATSAPP'));
ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_source_check"
  CHECK ("source" IN ('IN_PERSON', 'PHONE', 'WEB_FORM', 'WRITTEN', 'IMPORTED'));

-- ═══ الزمن من الخادم — يُدهس ما يرسله العميل ═══
-- `DEFAULT now()` وحده لا يكفي: قيمةٌ صريحة في INSERT تتجاوزه.
CREATE OR REPLACE FUNCTION marketing_consents_stamp_server_time() RETURNS trigger AS $$
BEGIN
    NEW."createdAt" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_consents_insert_guard
    BEFORE INSERT ON "marketing_consents"
    FOR EACH ROW EXECUTE FUNCTION marketing_consents_stamp_server_time();

-- ═══ ملحقٌ فقط: لا حذف ولا تعديل ═══
-- الرجوعُ عن الموافقة **واقعةٌ تالية** لا تعديلٌ للأولى — وهو ما يجعل الإثباتَ إثباتاً.
CREATE OR REPLACE FUNCTION marketing_consents_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'سجل الموافقة التسويقية ملحقٌ فقط — لا يُحذف منه صفّ (اللائحة م٢٨/٣: يُحتفظ بإثبات الموافقة).';
    END IF;
    RAISE EXCEPTION 'سجل الموافقة التسويقية لا يُعدَّل — الرجوعُ عن الموافقة صفٌّ جديد.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_consents_append_only_guard
    BEFORE UPDATE OR DELETE ON "marketing_consents"
    FOR EACH ROW EXECUTE FUNCTION marketing_consents_append_only();

-- ═══ عزل المستأجر — ENABLE وFORCE معاً ═══
ALTER TABLE "marketing_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_marketing_consents ON "marketing_consents"
    USING ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ═══ القائمُ يُعلَن ولا يُخمَّن له ═══
-- لا موافقةَ تُشتقّ لعميلٍ قائم: الصمتُ ليس موافقةً (م٢٥)، ووجودُ البطاقة ليس تعاملاً
-- مسبقاً (م٢٨/١ — والاستنباطُ من وجود صفٍّ هو §8.7/الوجه العاشر).
DO $$
DECLARE customer_count INT;
BEGIN
  SELECT count(*) INTO customer_count FROM "customers" WHERE "deletedAt" IS NULL;
  RAISE WARNING 'ك/⑰A1: % عميلاً قائماً **بلا أيّ موافقةٍ تسويقية** — ولا تُشتقّ لهم: الصمتُ ليس موافقة (م٢٥)، ووجودُ البطاقة ليس تعاملاً مسبقاً (اللائحة م٢٨/١).', customer_count;
END $$;
