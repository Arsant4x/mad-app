-- ⚖️ ق-١٤٣١ — نوعُ صفّ البنك عمودٌ صريح: «صندوقٌ نقديّ» (CASH_BOX) أو «حسابٌ بنكيّ» (BANK_ACCOUNT) — لا يُستنبط.
--
-- بنصّ المالك: «① نوعُ الصفّ: عمودٌ صريح «صندوقٌ نقديّ» أو «حسابٌ بنكيّ»، لا يُستنبط. ⇒ والقائمُ يُوسَم «غيرَ معلَن»،
-- ولا يُنقل حتى يُعلَن، كتصنيف العقود. ⛔ ولا يُستنبط من وجود الآيبان، فالاستنباطُ تخمين.»
--
-- ⛔ لا استنباط: الصفوفُ القائمة لا تُصنَّف من فرعها ولا من آيبانها — تُعلَّم «غيرَ معلَن» (LEGACY_UNDECLARED)
-- تُعدّ ويُصرخ بها (WARNING لا NOTICE — ق-٦٩٥) ولا تُصحَّح رجعياً — يُعلنها التاجرُ بيده.
--
-- ⭐ والحبسُ في القاعدة لا في العادة (نمطُ ق-٨٩٨ لتصنيف العقود): قيدُ CHECK يمنع «غيرَ معلَن» على أيّ صفٍّ أُنشئ بعد
-- لحظة هذه الهجرة — اللحظةُ تُلتقط وقتَ التنفيذ (clock_timestamp بتوقيت UTC، كما يكتب Prisma createdAt) وتُثبَّت حرفياً.
--
-- ⚠️ الجدولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها ثم يُعاد.
-- والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١) — فعلى قاعدةٍ فارغة تصرخ الهجرةُ بصفر، والقيدُ يُضاف على الحالين.

-- CreateEnum
CREATE TYPE "BankKind" AS ENUM ('CASH_BOX', 'BANK_ACCOUNT', 'LEGACY_UNDECLARED');

-- AlterTable — يُضاف قابلاً للفراغ لحظةً واحدة، ثم يُملأ، ثم يُلزَم.
ALTER TABLE "banks" ADD COLUMN "kind" "BankKind";

ALTER TABLE "banks" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_total  integer;
  n_legacy integer;
  cutover  timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  SELECT count(*) INTO n_total FROM "banks";

  UPDATE "banks" SET "kind" = 'LEGACY_UNDECLARED' WHERE "kind" IS NULL;
  GET DIAGNOSTICS n_legacy = ROW_COUNT;

  -- الحبس: «غيرُ معلَن» لا يصحّ إلا لصفٍّ سبق لحظةَ الهجرة.
  EXECUTE format(
    'ALTER TABLE "banks" ADD CONSTRAINT "banks_legacy_kind_before_cutover" CHECK ("kind" <> ''LEGACY_UNDECLARED'' OR "createdAt" < %L)',
    cutover
  );

  RAISE WARNING 'ق-١٤٣١: % من % صفِّ بنكٍ قائمٍ عُلِّم «غيرُ معلَن» — لا يُستنبط نوعُه (لا من فرعه ولا من آيبانه) ولا يُنقل حتى يُعلَن؛ والقيمةُ محبوسةٌ على ما سبق % (لحظة الهجرة، UTC)',
    n_legacy, n_total, cutover;
END $$;

ALTER TABLE "banks" FORCE ROW LEVEL SECURITY;

-- الإلزام — بلا DEFAULT: الخادمُ يُلزَم أن يذكر النوعَ في كلِّ إنشاء.
ALTER TABLE "banks" ALTER COLUMN "kind" SET NOT NULL;
