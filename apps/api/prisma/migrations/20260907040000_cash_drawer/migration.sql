-- ═══ درجُ الكاشير كياناً وحساباً — الدفعةُ الأولى من الكتلة المحاسبية (ق-٢١٨ · ق-٢٥٣ · ق-٢٦١) ═══
--
-- كان الدرج **ضمنياً**: زوجُ (فرع، كاشير) على المناوبة، بلا كيانٍ ولا حساب — وكلُّ
-- نقدٍ يُرحَّل إلى `1000` وحده، فسؤالُ «أيُّ درجٍ عجز؟» بلا جوابٍ رجعيّ. وحكمُ صاحب
-- المشروع: «المفصَّل يُجمَّع دائماً والمجمَّع لا يُفصَّل أبداً».
--
-- ورمزُ الحساب في نطاق `1010`–`1099` (ق-٢٥٣)، ويُولَّد بـ`MAX+1` تحت قيدٍ فريد
-- (`accounts_companyId_code_key`) — لا بـ`count()` (ق-١٩٨ وحارسها).
--
-- ⚠️ **والمناوبات القائمة**: تُنسب إلى **درجٍ افتراضيٍّ واحدٍ لكل فرعٍ له مناوبات**،
--    **ولا يُخترع درجٌ لكل كاشير**: الزوجُ (فرع، كاشير) **مجسٌّ لا هويّة** — الكاشيرُ
--    ليس درجاً، وقد يتناوب اثنان على درجٍ واحد أو يفتح واحدٌ درجَين. فالتفصيلُ يبدأ
--    من أول درجٍ يُنشئه التاجر، وما قبله **يبقى مجمَّعاً معلَناً** (ق-٢٦١).

-- CreateTable
CREATE TABLE "cash_drawers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_drawers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_drawers_accountId_key" ON "cash_drawers"("accountId");

-- CreateIndex
CREATE INDEX "cash_drawers_companyId_isActive_idx" ON "cash_drawers"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cash_drawers_companyId_branchId_name_key" ON "cash_drawers"("companyId", "branchId", "name");

-- AlterTable
ALTER TABLE "pos_shifts" ADD COLUMN     "drawerId" TEXT;

-- CreateIndex
CREATE INDEX "pos_shifts_drawerId_idx" ON "pos_shifts"("drawerId");

-- AddForeignKey
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_drawerId_fkey" FOREIGN KEY ("drawerId") REFERENCES "cash_drawers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- تعبئةُ الأدراج الافتراضية للمناوبات القائمة.
--
-- ⚠️ الترحيلات تتّصل بـ`app_user` — **غيرِ خارقٍ وبلا BYPASSRLS** — و`accounts`
--    و`pos_shifts` تحتها `FORCE ROW LEVEL SECURITY`. وبلا `app.company_id` تكون
--    **كلُّ الصفوف غيرَ مرئية**، فالإدراجُ يسقط والتحديثُ يمسّ صفراً صامتاً.
--    فيُرفع `FORCE` لمالك الجدول **مدةَ التعبئة وحدها** ثم يُعاد فوراً — كما في
--    ترحيل 20260803120000، ولا يتغيّر ضمانُ العزل بعد انتهاء هذا الترحيل.
-- ---------------------------------------------------------------------------

-- ⚠️ و`branches` معها — **وقد كشفه القياس**: بلا رفعها يعود `LEFT JOIN` على الفرع
--    **فارغاً بلا خطأ**، فيُسمّى درجُ الفرع «درج المنشأة» كأنه بلا فرع. صفٌّ غيرُ
--    مرئيّ يُقرأ صفّاً غيرَ موجود (§8.7)، والاسمُ الخاطئ يمرّ صامتاً.
--    مُقاسٌ بحالتَين على قاعدةٍ حقيقية: تحت `FORCE` يرى `app_user` **صفرَ** فروع،
--    وبعد الرفع **ستّة**، وبعد التراجع صفراً.
ALTER TABLE "accounts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "pos_shifts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "branches" NO FORCE ROW LEVEL SECURITY;

CREATE TEMPORARY TABLE "tmp_default_drawers" ON COMMIT DROP AS
WITH pairs AS (
    SELECT DISTINCT s."companyId", s."branchId" FROM "pos_shifts" s
),
numbered AS (
    SELECT p."companyId",
           p."branchId",
           ROW_NUMBER() OVER (PARTITION BY p."companyId" ORDER BY p."branchId" NULLS FIRST) - 1 AS idx
    FROM pairs p
)
SELECT n."companyId",
       n."branchId",
       -- `MAX+1` داخل نطاق العائلة، لا `count()` — والفجوةُ لا تُعاد تعبئتُها.
       (COALESCE((SELECT MAX(a."code"::int) FROM "accounts" a
                  WHERE a."companyId" = n."companyId"
                    AND a."code" ~ '^[0-9]+$'
                    AND a."code"::int BETWEEN 1010 AND 1099), 1009) + 1 + n.idx)::text AS "code",
       gen_random_uuid()::text AS "accountId",
       gen_random_uuid()::text AS "drawerId",
       br."name" AS "branchName"
FROM numbered n
LEFT JOIN "branches" br ON br."id" = n."branchId";

INSERT INTO "accounts" ("id", "companyId", "code", "name", "type", "openingBalance", "balance", "createdAt", "updatedAt")
SELECT d."accountId",
       d."companyId",
       d."code",
       'درج ' || COALESCE(d."branchName", 'المنشأة') || ' — الافتراضي',
       'asset',
       0,
       0,
       NOW(),
       NOW()
FROM "tmp_default_drawers" d;

INSERT INTO "cash_drawers" ("id", "companyId", "branchId", "name", "isActive", "isDefault", "accountId", "createdAt", "updatedAt")
SELECT d."drawerId", d."companyId", d."branchId", 'الدرج الافتراضي', true, true, d."accountId", NOW(), NOW()
FROM "tmp_default_drawers" d;

-- `IS NOT DISTINCT FROM` لا `=`: الفرعُ يقبل الفراغ، و`NULL = NULL` تعود فراغاً
-- فتترك مناوبات المنشآت بلا فروع **بلا درج** — وهي بالضبط الحالة التي يُنشأ لها.
UPDATE "pos_shifts" s
   SET "drawerId" = d."drawerId"
  FROM "tmp_default_drawers" d
 WHERE s."companyId" = d."companyId"
   AND s."branchId" IS NOT DISTINCT FROM d."branchId";

ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "pos_shifts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;

-- ═══ عزل المستأجر — الطبقة الثانية (rls-coverage.live.spec يوجبها لكل جدولٍ يملكه المستأجر) ═══
ALTER TABLE "cash_drawers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_drawers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cash_drawers ON "cash_drawers"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
