-- 🔴 ق-١٣٦٨ — الدولةُ صفةٌ للمنشأة لا افتراضٌ في الشيفرة: أربعةُ حقولٍ على `companies` — الدولة · المنطقةُ الزمنية · اللغة · عملةُ الأساس.
--
-- بنصّ المالك: «فالمسحُ قال إن ما لا يُعكَس هو ضياعُ الفرق بين «سعوديٌّ مُعلَن» و«سعوديٌّ بالافتراض». والقائمُ يُعبَّأ «السعودية»
-- معلَناً في الهجرة، لأن المنصّةَ لم تخدم غيرها.»
--
-- ⚠️ **بلا افتراضٍ في القاعدة للأربعة**: الثلاثةُ الجديدة تُعبَّأ هنا صراحةً ثم تصير `NOT NULL` بلا `DEFAULT`، و`baseCurrency` يُسقَط
-- افتراضُه (`'SAR'` — كان «ريالاً بالافتراض»: لا تكتبه الشيفرة أبداً). فالمنشأةُ التالية تولد بما يكتبه سجلُّ الأقاليم (`regions.ts`)
-- **أو لا تولد** — صفٌّ بلا دولةٍ يُرفض بالقيد، لا يُسقَط إلى السعودية بصمت.
-- و`companies` بلا عزل صفوف (مقيس: `relrowsecurity = f`) فالتعبئةُ لا تحتاج سياقَ منشأة؛ ومُشغِّلُه الوحيد على `loginIdentityId` لا يُطلَق هنا.

ALTER TABLE "companies" ADD COLUMN "country" TEXT;
ALTER TABLE "companies" ADD COLUMN "timeZone" TEXT;
ALTER TABLE "companies" ADD COLUMN "locale" TEXT;

DO $$
DECLARE
  n_total int;
  n_non_sar int;
BEGIN
  SELECT count(*) INTO n_total FROM "companies";
  SELECT count(*) INTO n_non_sar FROM "companies" WHERE "baseCurrency" <> 'SAR';
  UPDATE "companies" SET "country" = 'SA', "timeZone" = 'Asia/Riyadh', "locale" = 'ar-SA';
  RAISE WARNING 'ق-١٣٦٨: % منشأةً قائمة عُبّئت «السعودية» معلَنةً (country=SA · timeZone=Asia/Riyadh · locale=ar-SA) لأن المنصّة لم تخدم غيرها؛ وعملةُ الأساس تبقى كما هي (غيرُ الريال: %)؛ والافتراضُ «SAR» أُسقط فلا يولد صفٌّ سعوديٌّ بالافتراض', n_total, n_non_sar;
END $$;

ALTER TABLE "companies" ALTER COLUMN "country" SET NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "timeZone" SET NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "locale" SET NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "baseCurrency" DROP DEFAULT;

-- ═══ الشكلُ في القاعدة — ما يستطيعه CHECK بلا جدولٍ آخر ═══
ALTER TABLE "companies" ADD CONSTRAINT "companies_country_iso" CHECK ("country" ~ '^[A-Z]{2}$');
ALTER TABLE "companies" ADD CONSTRAINT "companies_base_currency_iso" CHECK ("baseCurrency" ~ '^[A-Z]{3}$');
