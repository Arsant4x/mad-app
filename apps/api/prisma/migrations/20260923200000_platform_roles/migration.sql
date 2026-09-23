-- دورُ مدير المنصّة — والفصلُ بين من يدعم ومن يمحو (ق-١٣١٢ · ⑪A2).
--
-- العلّة (docs/domain-scan/11 · A2): دورٌ واحدٌ يرى كلَّ شيءٍ ويفعل كلَّ شيء —
-- **أوّلُ موظفِ دعمٍ يُعيَّن يرث صلاحيةَ المالك، وما رآه أو فعله لا يُستردّ**.
--
-- والخمسةُ من نصّ المسح: مالكٌ · دعمٌ · ماليةٌ · تشغيلٌ · امتثال.

CREATE TYPE "PlatformRole" AS ENUM ('OWNER', 'SUPPORT', 'FINANCE', 'OPERATIONS', 'COMPLIANCE');

-- الافتراضُ `OWNER` **قراءةٌ لا تخمين**: كلُّ من في الجدول اليوم هو المالكُ نفسُه أو من
-- أنشأه بصلاحيته الكاملة — فلا أحدَ **يفقد** ما كان يملكه بهذه الهجرة. والتضييقُ يقع
-- على **من يُعيَّن بعدها**، وهو الغرض.
ALTER TABLE "platform_admins" ADD COLUMN "role" "PlatformRole" NOT NULL DEFAULT 'OWNER';

-- كتابةُ بيانات ⇒ تُعلَن (ق-٦٩١).
DO $$
DECLARE admin_count INT;
BEGIN
  SELECT count(*) INTO admin_count FROM "platform_admins";
  RAISE WARNING 'ل/⑪A2: % مديرَ منصّةٍ قائماً أُعطي الدورَ OWNER — لأنه ما كان يملكه فعلاً، فلا أحدَ يفقد صلاحيةً بهذه الهجرة. والتضييقُ على من يُعيَّن بعدها.', admin_count;
END $$;
