-- ⚖️ ق-١٣٤٥ (الحزمة م①) — هويّةُ الموظف ورقمُ حسابه ورقمُ تأميناته: تُشفَّر في التطبيق من أوّل حقل.
--
-- بنصّ المالك: «فالنصُّ الصريح في القاعدة يصل كلَّ نسخةٍ ومقلب، والتشفيرُ لاحقاً لا يستعيد ما خرج» — فلا عمودَ نصٍّ صريحٍ
-- لهذه الثلاثة قطّ: كلُّ عمودٍ هنا نصٌّ مشفَّرٌ بصيغة `f1:<معرّفُ المفتاح>:…` يكتبه التطبيقُ وحدَه، وبصمةُ بحثٍ بمفتاحٍ منفصل
-- لرقم الهويّة (`b1:<معرّفُ المفتاح>:…`). والمفاتيحُ خارج القاعدة (`PII_ENCRYPTION_KEYS` · `PII_BLIND_INDEX_KEY`).
--
-- **والأسماءُ عامّةٌ لا سعودية** (`ق-١٣٥٠`): التأميناتُ الاجتماعية (`GOSI`) مثالُها السعوديّ.
-- لا بياناتَ تُهاجَر — الحقولُ جديدةٌ فلا قائمَ يُعدّ (لا WARNING إذن)؛ والجدولُ تحت RLS بـFORCE من قبل.

ALTER TABLE "employees" ADD COLUMN "nationalIdCipher" TEXT;
ALTER TABLE "employees" ADD COLUMN "nationalIdIndex" TEXT;
ALTER TABLE "employees" ADD COLUMN "salaryIbanCipher" TEXT;
ALTER TABLE "employees" ADD COLUMN "socialInsuranceNoCipher" TEXT;

-- البحثُ برقم الهويّة ببصمته داخل المنشأة.
CREATE INDEX "employees_companyId_nationalIdIndex_idx" ON "employees"("companyId", "nationalIdIndex");

-- ═══ القيود — ما يستطيعه CHECK بلا قراءة جدولٍ آخر ═══
-- ⛔ لا نصَّ صريحاً يُكتب في هذه الأعمدة ولو بمسارٍ يتجاوز التطبيق: كلُّ قيمةٍ بصيغة التشفير أو البصمة، والبصمةُ مع رقمها.
ALTER TABLE "employees" ADD CONSTRAINT "employees_identity_ciphertext_only" CHECK (
  ("nationalIdCipher" IS NULL OR "nationalIdCipher" LIKE 'f1:%')
  AND ("salaryIbanCipher" IS NULL OR "salaryIbanCipher" LIKE 'f1:%')
  AND ("socialInsuranceNoCipher" IS NULL OR "socialInsuranceNoCipher" LIKE 'f1:%')
  AND ("nationalIdIndex" IS NULL OR "nationalIdIndex" LIKE 'b1:%')
  AND (("nationalIdCipher" IS NULL) = ("nationalIdIndex" IS NULL))
);
