-- ⚖️ ق-١٤٦٨ (التوجيه ٢٦٦ §٤د) — «كلُّ الفروع» علَمٌ صريح، والقائمةُ الفارغةُ لا شيء.
--
-- كان الحارسُ يقرأ صفرَ صفوفِ الإسناد «كلَّ الفروع» (`tenant.guard.ts`) — فكلُّ طريقٍ يُفرغ الإسنادَ (نقرةٌ تُزيل آخرَ
-- فرع · قراءةٌ عمياء تحت FORCE · حذفُ فرعٍ خارج الخدمة) يوسّع الصلاحيةَ إلى أقصاها بصمت: مفتوحٌ عند الفشل.
--
-- ① العمود بافتراض false — فالجديدُ بلا فروعٍ لا يرى فرعاً.
-- ② القائمون بلا إسنادٍ يُوسَمون true فيبقى سلوكُهم — **والحمايةُ تُرفع صراحةً عن الجدولين ثم تُعاد** (ق-٢٦٢): بلا رفعٍ
--    يمسّ الـUPDATE صفراً صامتاً فيفقد كلُّ القائمين «الكلّ»، ويعود NOT EXISTS على إسنادٍ غيرِ مرئيٍّ صادقاً فيُوسَم المقيَّدُ true.
-- ③ والعدُّ يُعلَن بـ RAISE WARNING (§8.28) — وعلى قاعدةٍ فارغة يُعلن أصفاراً ولا يرمي.

ALTER TABLE "company_users" ADD COLUMN "allBranches" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "company_users" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "company_user_branches" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  flagged INTEGER := 0;
  restricted INTEGER := 0;
  companies_n INTEGER := 0;
BEGIN
  UPDATE "company_users" cu SET "allBranches" = true
   WHERE NOT EXISTS (SELECT 1 FROM "company_user_branches" b WHERE b."companyUserId" = cu.id);
  GET DIAGNOSTICS flagged = ROW_COUNT;

  SELECT count(*) INTO restricted FROM "company_users" cu
   WHERE EXISTS (SELECT 1 FROM "company_user_branches" b WHERE b."companyUserId" = cu.id);
  SELECT count(DISTINCT "companyId") INTO companies_n FROM "company_users";

  RAISE WARNING 'allBranches (ق-١٤٦٨): حساباتٌ في % منشأة — بلا إسنادٍ صارت «كلَّ الفروع» صراحةً: % · مقيَّدةٌ بإسنادٍ بقيت كما هي: %',
    companies_n, flagged, restricted;
END $$;

ALTER TABLE "company_users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "company_user_branches" FORCE ROW LEVEL SECURITY;
