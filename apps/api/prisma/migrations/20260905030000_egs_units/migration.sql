-- CreateEnum
CREATE TYPE "EgsUnitKind" AS ENUM ('DEFAULT_WEB', 'POS_TERMINAL');

-- CreateEnum
CREATE TYPE "EgsUnitStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- AlterTable
ALTER TABLE "zatca_credentials" ADD COLUMN     "egsUnitId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "egsUnitId" TEXT;

-- CreateTable
CREATE TABLE "egs_units" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "kind" "EgsUnitKind" NOT NULL,
    "status" "EgsUnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "egs_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "egs_units_serial_key" ON "egs_units"("serial");

-- CreateIndex
CREATE INDEX "egs_units_companyId_kind_idx" ON "egs_units"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "zatca_credentials_egsUnitId_key" ON "zatca_credentials"("egsUnitId");

-- AddForeignKey
ALTER TABLE "zatca_credentials" ADD CONSTRAINT "zatca_credentials_egsUnitId_fkey" FOREIGN KEY ("egsUnitId") REFERENCES "egs_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egs_units" ADD CONSTRAINT "egs_units_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_egsUnitId_fkey" FOREIGN KEY ("egsUnitId") REFERENCES "egs_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══ وحدةٌ افتراضية واحدة لكل منشأة — بالقيد لا بالانضباط (ق-١٦٩) ═══
-- Prisma لا تعبّر عن فهرسٍ جزئي، فيُكتب هنا: منشأتان لا، ووحدتان افتراضيتان لا.
CREATE UNIQUE INDEX "egs_units_one_default_per_company"
  ON "egs_units" ("companyId") WHERE "kind" = 'DEFAULT_WEB';


-- ═══ التعبئة — الدفعة (أ) بلا تغيير سلوك (ق-١٧١) ═══
--
-- كل منشأةٍ لها صفُّ شهادة تأخذ وحدةً افتراضية **بالتسلسلي الذي في طلب شهادتها
-- نفسه**: `1-mad-app|2-web|3-<companyId>` (انظر `zatca-onboarding.service.ts`
-- — `SOLUTION_NAME = 'mad-app'`). فالشهادة الصادرة **تبقى صالحة بلا إعادة ربط**.
--
-- ⚠️ **الجداول المُعبَّأة تحت FORCE RLS**، والهجرات تعمل بلا `app.company_id` —
-- فـUPDATE عاديّ يطابق **صفر صفٍّ بلا خطأ**. يُرفع FORCE لهذه العبارات وحدها
-- ثم يُعاد، كما في `20260719231124_journal`.
ALTER TABLE "zatca_credentials" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoices" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "egs_units" ("id", "companyId", "serial", "kind", "status", "label", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."companyId",
  '1-mad-app|2-web|3-' || c."companyId",
  'DEFAULT_WEB',
  'ACTIVE',
  'الويب الإداري',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "zatca_credentials" c;

UPDATE "zatca_credentials" c
SET "egsUnitId" = u."id"
FROM "egs_units" u
WHERE u."companyId" = c."companyId" AND u."kind" = 'DEFAULT_WEB' AND c."egsUnitId" IS NULL;

-- كل مستندٍ دخل السلسلة (يحمل ICV) يُنسب إلى الوحدة الافتراضية لمنشأته.
-- **ولا تُفكَّك السلسلة رجعياً**: التجزئات المقبولة تبقى كما هي.
UPDATE "invoices" i
SET "egsUnitId" = u."id"
FROM "egs_units" u
WHERE u."companyId" = i."companyId" AND u."kind" = 'DEFAULT_WEB'
  AND i."zatcaIcv" IS NOT NULL AND i."egsUnitId" IS NULL;

ALTER TABLE "zatca_credentials" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;


-- ═══ عزل المستأجر — ENABLE وFORCE معاً (بعد التعبئة، فالإدراج أعلاه بلا سياق) ═══
-- وحارس `activities/rls-probe.live.spec.ts` يقرأ `relforcerowsecurity` من كتالوج
-- القاعدة الحيّ ويسقط على أي جدولٍ مستأجرٍ بلا الاثنين. (أربع هجراتٍ سابقة تسمّيه
-- `rls-coverage.live.spec.ts` — اسمٌ لا يوجد ملفٌ به؛ الحارس الحقيقي هذا.)
ALTER TABLE "egs_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "egs_units" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_egs_units ON "egs_units"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

