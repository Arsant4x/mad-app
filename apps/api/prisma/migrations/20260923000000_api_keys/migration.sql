-- مفاتيحُ الأنظمة الخارجية (ق-١٢٩١ · ي/⑫A3) — فاعلٌ خامس لا إنسانَ خلفه.
--
-- ولا كتابةَ بيانات هنا: جدولٌ جديد وقيمةُ تعداد — فلا `RAISE WARNING` (ق-٦٩١).

ALTER TYPE "ActorType" ADD VALUE IF NOT EXISTS 'INTEGRATION';

CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "permissionTemplateId" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- البادئةُ مفهرسةٌ فريدة: بها يُعثر على الصفّ في نداءٍ واحد قبل التحقّق من السرّ.
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");
CREATE INDEX "api_keys_companyId_idx" ON "api_keys"("companyId");
-- ق-١٢٥٢ — هدفُ المفاتيح المركّبة.
CREATE UNIQUE INDEX "api_keys_companyId_id_key" ON "api_keys"("companyId", "id");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_permissionTemplateId_fkey"
  FOREIGN KEY ("permissionTemplateId") REFERENCES "permission_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- عزلُ الصفوف — يُكتب بيدٍ دائماً (CLAUDE §6.13): مخطَّطُ Prisma لا يعبّر عنه فلا يولّده.
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_api_keys ON "api_keys"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- 🔴 **مسندُ المصادقة — قراءةٌ فقط، ومسارٌ واحد** (ق-١٢٩١ · ي/⑫A3)، على نمط `app.platform_admin` (ق-٦٧٥).
--
-- المفتاحُ يُقدَّم قبل أن يُعرف مستأجرُه — **فالسياقُ هو ما نبحث عنه ولا يمكن أن يسبقه**،
-- تماماً كقراءة الهويّة في الدخول. ولولا هذه السياسة لعادت القراءةُ **فارغةً بنجاح** تحت
-- `FORCE` فيُردّ كلُّ مفتاحٍ صحيحٍ بـ`401` — وهو ما وقع فعلاً في أوّل تشغيل.
--
-- وحدودُها الثلاثة: `FOR SELECT` فلا تكتب شيئاً · و`app.api_key_auth` تضبطه معاملةٌ واحدة
-- (`runAsApiKeyLookup`) لا يستدعيها إلا مسارُ المصادقة · **والبحثُ بالبادئة الفريدة** فلا
-- يُعيد إلا صفّاً واحداً، وكلُّ ما بعده يجري داخل سياق منشأة المفتاح.
CREATE POLICY api_key_authentication ON "api_keys"
  FOR SELECT
  USING (current_setting('app.api_key_auth', true) = 'true');
