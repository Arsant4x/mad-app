-- ق-٦٥١ — المنشآتُ القائمة على قالبٍ نظاميٍّ تُنقل إلى القالب العامّ الشامل غيرِ النظاميّ.
--
-- التسجيلُ الذاتيُّ كان يأخذ «أوّلَ قالبٍ عامٍّ شامل» بترتيب الإنشاء، وقالبُ المطوّر
-- (isSystem) يسبق القالبَ العامّ في التأسيس — فركبت عليه ٢٤٠ من ٥١٤ في التطوير و٦ من ٦
-- في المنشور. أُصلح المسارُ (ق-٦٤٤)، وهذه الهجرةُ تُصحّح القديم.
--
-- شروطُ المالك الثلاثة:
--   ① الصلاحياتُ لا تُمسّ — يُنقل الوسمُ وحده: من شاملٍ نظاميٍّ إلى شاملٍ غيرِ نظاميّ،
--      ولا تُنقل منشأةٌ قالبُها النظاميُّ ليس شاملاً (لو وُجدت) — بل تُوقف الهجرةُ صارخةً.
--   ② مُثبَتٌ بالعدّ قبل وبعد — داخل الهجرة نفسِها: قبل = نُقل، وبعد = صفر، وإلا فشلت.
--   ③ على التطوير أولاً، والمنشورُ مع أوّل إعادة نشرٍ بهذه الهجرة — لا بيدٍ على صفوفه.
--
-- "companies" بلا RLS (لا companyId فيه) — فلا رفعَ لـFORCE هنا، والعدُّ يرى الصفوفَ كلَّها.
--
-- ⚠️ العدُّ قبل البحث عن الهدف (ق-٦٥٩): على قاعدةٍ فارغة (CI · نشرٌ من الصفر) لا قوالبَ
-- بعدُ لأن البذرة تلي الهجرات — وصياغةٌ أولى بحثت عن الهدف أولاً فصرخت على قاعدةٍ لا
-- منشأةَ فيها تُنقل، وأسقطت db-integration وplaywright في #325. فلا شيءَ يُنقل = لا
-- هدفَ يلزم؛ ولا هدفَ مع شيءٍ يُنقل = صراخ.
DO $$
DECLARE
  target_id    TEXT;
  before_count INTEGER;
  moved        INTEGER;
  after_count  INTEGER;
BEGIN
  SELECT count(*) INTO before_count
    FROM companies c JOIN permission_templates t ON t.id = c."permissionTemplateId"
   WHERE t."isSystem" = true;

  IF before_count = 0 THEN
    RAISE NOTICE 'ق-٦٥١: لا منشأةَ على قالبٍ نظاميّ — لا شيءَ يُنقل';
    RETURN;
  END IF;

  SELECT id INTO target_id
    FROM permission_templates
   WHERE "companyId" IS NULL AND "isSystem" = false AND "isAllScreens" = true
   ORDER BY "createdAt" ASC
   LIMIT 1;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'ق-٦٥١: % منشأة على قالبٍ نظاميّ ولا قالبَ عامّاً شاملاً غيرَ نظاميّ — لا تعبئةَ بالظنّ', before_count;
  END IF;

  UPDATE companies c
     SET "permissionTemplateId" = target_id
    FROM permission_templates t
   WHERE t.id = c."permissionTemplateId"
     AND t."isSystem" = true
     AND t."isAllScreens" = true;
  GET DIAGNOSTICS moved = ROW_COUNT;

  SELECT count(*) INTO after_count
    FROM companies c JOIN permission_templates t ON t.id = c."permissionTemplateId"
   WHERE t."isSystem" = true;

  IF moved <> before_count OR after_count <> 0 THEN
    RAISE EXCEPTION 'ق-٦٥١: العدُّ لا يطابق — قبل % · نُقل % · بعد % (منشأةٌ على قالبٍ نظاميٍّ غيرِ شامل؟ لا تُنقل بالظنّ)', before_count, moved, after_count;
  END IF;

  RAISE NOTICE 'ق-٦٥١: نُقلت % منشأة من القالب النظاميّ إلى %', moved, target_id;
END $$;
