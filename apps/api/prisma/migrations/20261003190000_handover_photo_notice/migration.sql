-- ⚖️ ق-١٦٠٠ · ق-١٦٠٩/د — إعلامُ المستأجر بحفظ صور نموذج التسليم (السؤال ٢٤٣، بحكم صاحب المشروع: «يُسأل المستشارُ عن
-- «مستندٍ عائدٍ للعقار»؛ وإلى جوابه تبقى الصورُ بمدّة النموذج ويُعلَم المستأجر»).
--
-- نموذجٌ عليه صورٌ لا يُوقَّع إلا بإقرار الموقِّع أن المستأجرَ أُعلم، وتُختم المدّةُ المعلنة يومَها ووقتُ الإعلام مع التوقيع.
-- والعمودان معاً أو لا شيء، والمدّةُ موجبة.
--
-- ⛔ القديمُ يُعلَن ولا يُصحَّح رجعيّاً (ق-٨٩٨ بروحه): النماذجُ الموقَّعة قبل هذه الهجرة وعليها صورٌ لم يُختم عليها إعلام،
-- ولا يُكتب عنها إعلامٌ لم يقع؛ فتُعدّ ويُصرخ بها (WARNING لا NOTICE · ق-٦٩٥)، والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١).
--
-- ⚠️ الجدولان تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها (وإلا أعاد العدُّ صفراً
-- بلا خطأ، §8.5) ثم يُعاد.

-- AlterTable
ALTER TABLE "contract_handovers" ADD COLUMN "photoNoticeYears" INTEGER,
ADD COLUMN "photoNoticeAt" TIMESTAMP(3);

ALTER TABLE "contract_handovers" ADD CONSTRAINT "contract_handovers_photo_notice_paired" CHECK (
  ("photoNoticeYears" IS NULL) = ("photoNoticeAt" IS NULL) AND ("photoNoticeYears" IS NULL OR "photoNoticeYears" > 0)
);

ALTER TABLE "contract_handovers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "handover_photos" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_forms  integer;
  n_photos integer;
BEGIN
  SELECT count(DISTINCT h."id"), count(p."id") INTO n_forms, n_photos
  FROM "contract_handovers" h
  JOIN "handover_photos" p ON p."handoverId" = h."id"
  WHERE h."status" = 'SIGNED';

  RAISE WARNING 'السؤال ٢٤٣ (ق-١٦٠٠): % نموذجاً موقَّعاً قبل هذه الهجرة عليها % صورةً بلا إعلامٍ مختوم؛ تبقى كما وُقّعت ولا يُكتب عنها إعلامٌ لم يقع',
    n_forms, n_photos;
END $$;

ALTER TABLE "handover_photos" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contract_handovers" FORCE ROW LEVEL SECURITY;
