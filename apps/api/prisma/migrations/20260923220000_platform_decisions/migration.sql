-- الفعلُ الحرجُ على المنصّة بيدين لا بيد (ق-١٣١٨ · ⑪A1).
--
-- العلّة (docs/domain-scan/11 · A1): «**محوُ بيانات منشأةٍ أو تغييرُ اشتراكها بيدٍ
-- واحدة يقع مرّةً ولا يُردّ**؛ والمالكُ اشترطه بنصّه».
--
-- والثلاثةُ من نصّ المسح: إغلاقٌ/محوٌ · تعديلُ اشتراكٍ يدويّ · ردُّ مال.
-- ⚠️ **وردُّ المال لا مسارَ له في المنتج بعد** — فالقيمةُ معلَنةٌ في التعداد ولا مستهلكَ لها،
-- ويُعلَن ذلك ولا يُدَّعى أنه محروس.

CREATE TYPE "PlatformDecisionAction" AS ENUM ('ACCOUNT_ERASURE', 'SUBSCRIPTION_CHANGE', 'REFUND');
CREATE TYPE "PlatformDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

CREATE TABLE "platform_decisions" (
    "id"            TEXT NOT NULL,
    "action"        "PlatformDecisionAction" NOT NULL,
    "status"        "PlatformDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "targetId"      TEXT NOT NULL,
    "summary"       TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt"   TIMESTAMP(3) NOT NULL DEFAULT now(),
    "decidedById"   TEXT,
    "decidedAt"     TIMESTAMP(3),
    "note"          TEXT,
    "executedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "platform_decisions_pkey" PRIMARY KEY ("id")
);

-- Restrict لا Cascade: **من طلب ومن أقرّ لا يُمحى أثرُه بحذف حسابه** — وهو الغرضُ نفسُه.
ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "platform_decisions_action_targetId_status_idx"
  ON "platform_decisions"("action", "targetId", "status");

-- ═══ اليدان في القاعدة لا في الخدمة ═══
-- **مسارٌ لا يمرّ بالخدمة لا يلتفّ عليه**: تحديثٌ خامٌّ يجعل المُقرَّ هو الطالب يُرفض هنا.
ALTER TABLE "platform_decisions" ADD CONSTRAINT "platform_decisions_two_hands"
  CHECK ("decidedById" IS NULL OR "decidedById" <> "requestedById");

-- ⚠️ **ولا عزلَ صفوفٍ عليه**: قرارٌ منصّيٌّ لا بيانَ مستأجر — لا عمودَ منشأةٍ فيه، ولا
-- يُقرأ إلا من مسارات المنصّة المحروسة بالدور (ق-١٣١٢).

-- ═══ القائمُ يُعلَن ═══
DO $$
DECLARE admin_count INT;
BEGIN
  SELECT count(*) INTO admin_count FROM "platform_admins";
  RAISE WARNING 'ل/⑪A1: % مديرَ منصّةٍ قائماً. ⛔ واليدان لا تعملان بواحد: الفعلُ الحرج يحتاج طالباً ومُقرّاً مختلفَين — فبحسابٍ واحدٍ يُردّ كلُّ إقرار، وهو المقصود لا عطل.', admin_count;
END $$;
