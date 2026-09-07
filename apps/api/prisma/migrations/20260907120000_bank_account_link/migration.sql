-- ═══ حسابٌ لكل بنك — الدفعة (ب١) من الكتلة المحاسبية (ق-٢٥٣ · ق-٢٧٦ · ق-٢٧٧) ═══
--
-- العطلُ الذي تُغلقه: **البنوكُ خارج الأستاذ**. حركةُ البنك لا تُنتج قيداً،
-- و`Bank.balance` يُحرَّك بيدٍ في ستة مواضع، **والمقبوضُ على بنكٍ يُرحَّل إلى
-- `1000`** — فالأستاذ يحمل نقدَ البنك في حساب الصندوق، ورصيدَ البنك في عمودٍ
-- خارجه. وهو عائقُ إطلاقٍ مسجَّل (`SPEC 7.6`).
--
-- هذه الدفعةُ تربط وتُنشئ فقط: **حسابٌ لكل بنكٍ قائم** برمزٍ في نطاق
-- `1100`–`1199` (`MAX+1` داخل النطاق، والفجوةُ لا تُعاد تعبئتُها — ق-١٩٨).
-- والترحيلُ الفعليّ للحركات في الدفعة (ب٢).
--
-- ⚠️ **والحسابُ يُنشأ لكل بنك — بما فيها المحذوفة والمؤرشفة**: العمودُ إلزاميّ،
--    وبنكٌ محذوفٌ قد يُستعاد من السلة فيحتاج مقابلَه. **وحسابٌ بصفرٍ ليس حساباً
--    بلا رصيد** (ق-٢٧٧): الأولُ يستقبل الحركة من أول يوم، والثاني تذهب حركتُه
--    إلى `1000` — وهو العطلُ نفسه.
--
-- ⚠️ **والرصيدُ الافتتاحي يُنسخ إلى الحساب في العمودَين** (`openingBalance`
--    و`balance`) — **بالشكل الذي تتوقّعه أداةُ التسوية القائمة**
--    (`backfillCompanyOpeningEntries`): تقرأ حساباً برصيدٍ افتتاحيّ **بلا قيد**،
--    فتُنشئ القيدَ مقابل `3900` ثم تُنقص `balance` كي لا يُحتسب مرتَين. فلا
--    مسارَ ثانياً للافتتاحي، ولا قيدَ يُكتب بيدٍ في SQL.

-- AlterTable — يُضاف قابلاً للفراغ ثم يُملأ ثم يصير إلزامياً.
ALTER TABLE "banks" ADD COLUMN     "accountId" TEXT;

-- ---------------------------------------------------------------------------
-- ⚠️ الترحيلات تتّصل بـ`app_user` **غيرِ الخارق**، و`accounts` و`banks` تحتهما
--    `FORCE ROW LEVEL SECURITY`. وبلا `app.company_id` تكون **كلُّ الصفوف غيرَ
--    مرئية**: الإدراجُ يسقط والتحديثُ يمسّ صفراً **صامتاً** (ق-٢٦٢، وحارسُها
--    `migration-rls-read.spec.ts`). فتُرفع مدةَ التعبئة وحدها ثم تُعاد.
-- ---------------------------------------------------------------------------
ALTER TABLE "accounts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "banks" NO FORCE ROW LEVEL SECURITY;

CREATE TEMPORARY TABLE "tmp_bank_accounts" ON COMMIT DROP AS
WITH numbered AS (
    SELECT b."id" AS bank_id,
           b."companyId",
           b."name",
           b."openingBalance",
           ROW_NUMBER() OVER (PARTITION BY b."companyId" ORDER BY b."createdAt", b."id") - 1 AS idx
    FROM "banks" b
)
SELECT n.bank_id,
       n."companyId",
       n."name",
       n."openingBalance",
       -- `MAX+1` داخل النطاق لا عدّ الصفوف (ق-١٩٨): حسابٌ يدويٌّ في النطاق يدفع التاليَ فوقه.
       (COALESCE((SELECT MAX(a."code"::int) FROM "accounts" a
                  WHERE a."companyId" = n."companyId"
                    AND a."code" ~ '^[0-9]+$'
                    AND a."code"::int BETWEEN 1100 AND 1199), 1099) + 1 + n.idx)::text AS "code",
       gen_random_uuid()::text AS "accountId"
FROM numbered n;

INSERT INTO "accounts" ("id", "companyId", "code", "name", "type", "openingBalance", "balance", "createdAt", "updatedAt")
SELECT t."accountId",
       t."companyId",
       t."code",
       -- `حساب X` لا `بنك X`: أسماءُ البنوك عندنا تبدأ بـ«بنك» أو «صندوق» أصلاً،
       -- فقُرئت «بنك بنك الرياض» في أول تشغيلٍ مقيس.
       'حساب ' || t."name",
       'asset',
       t."openingBalance",
       t."openingBalance",
       NOW(),
       NOW()
FROM "tmp_bank_accounts" t;

UPDATE "banks" b SET "accountId" = t."accountId" FROM "tmp_bank_accounts" t WHERE b."id" = t.bank_id;

ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "banks" FORCE ROW LEVEL SECURITY;

-- وبعد التعبئة يصير إلزامياً: بنكٌ بلا حسابٍ يعني نقداً خارج الأستاذ.
ALTER TABLE "banks" ALTER COLUMN "accountId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "banks_accountId_key" ON "banks"("accountId");

-- AddForeignKey
ALTER TABLE "banks" ADD CONSTRAINT "banks_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
