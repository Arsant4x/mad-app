-- المصادقةُ المتعدّدة (TOTP) لمدير المنصّة والمالك (ق-١٣١٨ · ⑨A1).
--
-- العلّة (docs/domain-scan/09 · A1): «اختراقُ حسابٍ بكلمةٍ واحدة **يقع مرّةً ولا يُردّ**:
-- مديرُ المنصّة يرى كلَّ المنشآت، والمالكُ يرى دفترَ منشأته كلَّه؛ **وبياناتٌ سُرّبت لا
-- تعود**، وهي بياناتٌ شخصية (PDPL) وسجلّاتٌ ضريبية».
--
-- ولمَ TOTP لا رسالةٌ نصّية: **لا ينتظر مزوّداً** (`§10`) — فيُبنى اليوم لا بعد عقد.

ALTER TABLE "login_identities"
  ADD COLUMN "mfaSecret"         TEXT,
  ADD COLUMN "mfaEnrolledAt"     TIMESTAMP(3),
  ADD COLUMN "mfaLastStep"       INTEGER,
  ADD COLUMN "mfaRecoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ⚠️ **ولا أحدَ يُطالَب برمزٍ بهذه الهجرة**: `mfaEnrolledAt` فارغٌ للجميع — **والتسجيلُ فعلٌ
-- يقوم به صاحبُه**، فلا يُحبس أحدٌ خارج حسابه بترحيلٍ صامت.
DO $$
DECLARE identity_count INT;
BEGIN
  SELECT count(*) INTO identity_count FROM "login_identities";
  RAISE WARNING 'ل/⑨A1: % هويّةَ دخولٍ قائمة — ولا واحدةَ مسجَّلةٌ في المصادقة المتعدّدة (mfaEnrolledAt فارغ). والتسجيلُ فعلُ صاحبه، والإلزامُ علَمٌ مطفأٌ افتراضياً.', identity_count;
END $$;
