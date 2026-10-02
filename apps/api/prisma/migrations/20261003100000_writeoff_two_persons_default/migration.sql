-- ⚖️ ق-١٥٨٣ (توجيه ٢٧٥، بحكم صاحب المشروع) — «شطبُ التالف يحتاج شخصين افتراضاً، والمنشأةُ ذاتُ الشخص الواحد تُطفئه بنفسها».
--
-- كان الافتراضُ الاعتمادَ الذاتيّ (`false`) ولا مفتاحَ له في الواجهة، فلم تختره منشأةٌ قطّ: القائمُ عليه افتراضٌ لا اختيار.
-- فيصير الافتراضُ `true` للجديد، والقائمُ يُقلب إليه ويُعدّ ويُعلَن (لا تاجرَ حقيقيٌّ بعد — القاعدة ٤)، ومفتاحُه في إعدادات المنشأة.
--
-- `companies` جذرُ المستأجر بلا عزلِ صفوف، فالعدُّ والقلبُ بلا سياقٍ يريان كلَّ منشأة. وعلى قاعدةٍ فارغة يُعلن صفراً ويعود.

ALTER TABLE "companies" ALTER COLUMN "writeOffRequiresTwoPersons" SET DEFAULT true;

DO $$
DECLARE
  n BIGINT;
BEGIN
  SELECT count(*) INTO n FROM companies WHERE "writeOffRequiresTwoPersons" = false;
  IF n = 0 THEN
    RAISE WARNING 'شطبُ التالف بشخصين (ق-١٥٨٣): لا منشأةَ قائمةٌ على الاعتماد الذاتيّ';
    RETURN;
  END IF;
  UPDATE companies SET "writeOffRequiresTwoPersons" = true WHERE "writeOffRequiresTwoPersons" = false;
  RAISE WARNING 'شطبُ التالف بشخصين (ق-١٥٨٣): % منشأة قُلبت من الاعتماد الذاتيّ إلى شخصين، وتُطفئه المنشأةُ من إعداداتها', n;
END $$;
