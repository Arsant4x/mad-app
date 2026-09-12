-- ق-٦٦٦ — هويّةُ الدخول تحمل منشأتَها: مصدرُ سياق المصادقة (المرحلة ② من إغلاق العائق).
--
-- الخيارُ (ب) بحكم المالك (التوجيه ١٤٧): لا دورَ يتجاوز العزل، ولا مفتاحَ ثانٍ في السياسة —
-- بل عمودٌ على الهويّة يُقرأ قبل أن يُعرف أيُّ سياق، ثم يُقرأ الملفُّ تحته.
--
-- ⚠️ المشغِّلُ شرطُ قبولٍ لا خطوةٌ ثانية: العمودُ تملؤه القاعدةُ عند كتابة صفِّ الملفّ،
-- ويُرفض إن خالف — فهويّةٌ واحدة لا تصل إلى منشأتين في القاعدة نفسِها.
--
-- ⚠️ الهويّةُ تتبع ملفَّها (ق-٦٦٨): حذفُ المنشأة يُسقط هويّاتِها (ON DELETE CASCADE)،
-- وحذفُ صفِّ حسابٍ فرعيّ يُسقط هويّتَه (مشغِّلٌ بعد الحذف) — فلا يتيمةَ جديدة تحجز اسمَها.
-- واليتيماتُ القائمة (138 تطويراً · 0 منشوراً) لا تُمسّ: تبقى بـNULL ويعدّها الحارس.
--
-- login_identities · companies · company_users بلا RLS — فلا رفعَ لـFORCE هنا.

-- AlterTable
ALTER TABLE "login_identities" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE INDEX "login_identities_companyId_idx" ON "login_identities"("companyId");

-- AddForeignKey
ALTER TABLE "login_identities" ADD CONSTRAINT "login_identities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── التعبئة — تعدّ قبل وبعد، وتمرّ على قاعدةٍ فارغة (ق-٦٥١ · ق-٦٥٩) ──────────────
DO $$
DECLARE
  owners_before   INTEGER;
  members_before  INTEGER;
  owners_moved    INTEGER;
  members_moved   INTEGER;
  left_unfilled   INTEGER;
  conflicts       INTEGER;
BEGIN
  -- ⛔ هويّةٌ لها ملفٌّ في جدولَين بمنشأتَين مختلفتَين لا تُعبَّأ بالظنّ — بل تُوقف الهجرةُ صارخةً.
  SELECT count(*) INTO conflicts
    FROM login_identities li
    JOIN companies c ON c."loginIdentityId" = li.id
    JOIN company_users cu ON cu."loginIdentityId" = li.id
   WHERE cu."companyId" <> c.id;
  IF conflicts > 0 THEN
    RAISE EXCEPTION 'ق-٦٦٦: % هويّة لها ملفٌّ في منشأتَين — لا تعبئةَ بالظنّ', conflicts;
  END IF;

  SELECT count(*) INTO owners_before
    FROM login_identities li JOIN companies c ON c."loginIdentityId" = li.id
   WHERE li."companyId" IS NULL;
  SELECT count(*) INTO members_before
    FROM login_identities li JOIN company_users cu ON cu."loginIdentityId" = li.id
   WHERE li."companyId" IS NULL;

  IF owners_before + members_before = 0 THEN
    RAISE NOTICE 'ق-٦٦٦: لا هويّةَ تُعبَّأ — قاعدةٌ فارغة أو معبَّأة';
  ELSE
    UPDATE login_identities li SET "companyId" = c.id
      FROM companies c
     WHERE c."loginIdentityId" = li.id AND li."companyId" IS NULL;
    GET DIAGNOSTICS owners_moved = ROW_COUNT;

    UPDATE login_identities li SET "companyId" = cu."companyId"
      FROM company_users cu
     WHERE cu."loginIdentityId" = li.id AND li."companyId" IS NULL;
    GET DIAGNOSTICS members_moved = ROW_COUNT;

    SELECT count(*) INTO left_unfilled
      FROM login_identities li
     WHERE li."companyId" IS NULL
       AND (EXISTS (SELECT 1 FROM companies c WHERE c."loginIdentityId" = li.id)
         OR EXISTS (SELECT 1 FROM company_users cu WHERE cu."loginIdentityId" = li.id));

    IF owners_moved <> owners_before OR members_moved <> members_before OR left_unfilled <> 0 THEN
      RAISE EXCEPTION 'ق-٦٦٦: العدُّ لا يطابق — مالكون قبل % نُقل % · حساباتٌ قبل % نُقل % · بقي بلا تعبئة %',
        owners_before, owners_moved, members_before, members_moved, left_unfilled;
    END IF;
    RAISE NOTICE 'ق-٦٦٦: عُبّئت % هويّة مالك و% هويّة حساب فرعيّ', owners_moved, members_moved;
  END IF;
END $$;

-- ── المشغِّلات — شرطُ القبول ─────────────────────────────────────────────────────
-- ① صفُّ منشأة: يملأ هويّةَ مالكها إن كانت فارغة، ويرفض إن كانت لمنشأةٍ أخرى.
CREATE OR REPLACE FUNCTION identity_follows_company() RETURNS trigger AS $$
DECLARE
  current_company TEXT;
BEGIN
  SELECT "companyId" INTO current_company FROM login_identities WHERE id = NEW."loginIdentityId";
  IF NOT FOUND THEN
    RETURN NEW; -- لا هويّة ⇒ لا شيءَ يُملأ (المفتاحُ الأجنبيُّ يمسك الغياب)
  END IF;
  IF current_company IS NULL THEN
    UPDATE login_identities SET "companyId" = NEW.id WHERE id = NEW."loginIdentityId";
  ELSIF current_company <> NEW.id THEN
    RAISE EXCEPTION 'ق-٦٦٦: هويّةُ الدخول % تنتمي إلى منشأةٍ أخرى — لا تكون مالكةً لمنشأتَين', NEW."loginIdentityId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "companies_identity_follows" ON "companies";
CREATE TRIGGER "companies_identity_follows"
  AFTER INSERT OR UPDATE OF "loginIdentityId" ON "companies"
  FOR EACH ROW EXECUTE FUNCTION identity_follows_company();

-- ② صفُّ حسابٍ فرعيّ: يملأ هويّتَه إن كانت فارغة، ويرفض إن كانت لمنشأةٍ أخرى.
CREATE OR REPLACE FUNCTION identity_follows_company_user() RETURNS trigger AS $$
DECLARE
  current_company TEXT;
BEGIN
  SELECT "companyId" INTO current_company FROM login_identities WHERE id = NEW."loginIdentityId";
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF current_company IS NULL THEN
    UPDATE login_identities SET "companyId" = NEW."companyId" WHERE id = NEW."loginIdentityId";
  ELSIF current_company <> NEW."companyId" THEN
    RAISE EXCEPTION 'ق-٦٦٦: هويّةُ الدخول % تنتمي إلى منشأةٍ أخرى — لا حسابَ في منشأتَين', NEW."loginIdentityId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "company_users_identity_follows" ON "company_users";
CREATE TRIGGER "company_users_identity_follows"
  AFTER INSERT OR UPDATE OF "companyId", "loginIdentityId" ON "company_users"
  FOR EACH ROW EXECUTE FUNCTION identity_follows_company_user();

-- ③ تعديلُ العمود بيدٍ: لا يُقبل ما يخالف ملفَّ الهويّة القائم.
CREATE OR REPLACE FUNCTION identity_company_matches_profile() RETURNS trigger AS $$
DECLARE
  profile_company TEXT;
BEGIN
  IF NEW."companyId" IS NOT DISTINCT FROM OLD."companyId" THEN
    RETURN NEW;
  END IF;
  SELECT c.id INTO profile_company FROM companies c WHERE c."loginIdentityId" = NEW.id;
  IF NOT FOUND THEN
    SELECT cu."companyId" INTO profile_company FROM company_users cu WHERE cu."loginIdentityId" = NEW.id;
  END IF;
  IF FOUND AND NEW."companyId" IS DISTINCT FROM profile_company THEN
    RAISE EXCEPTION 'ق-٦٦٦: منشأةُ الهويّة % تخالف ملفَّها (%)', NEW.id, profile_company
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "login_identities_company_matches_profile" ON "login_identities";
CREATE TRIGGER "login_identities_company_matches_profile"
  BEFORE UPDATE OF "companyId" ON "login_identities"
  FOR EACH ROW EXECUTE FUNCTION identity_company_matches_profile();

-- ④ الهويّةُ تتبع ملفَّها في الحذف (ق-٦٦٨): حذفُ صفِّ حسابٍ فرعيّ يُسقط هويّتَه.
--    (حذفُ المنشأة يُسقط هويّاتِها بالمفتاح الأجنبيّ أعلاه.) الحذفُ الآتي من الهويّة نفسِها
--    يجد الصفَّ قد زال فلا يفعل شيئاً — لا دورانَ.
CREATE OR REPLACE FUNCTION identity_dies_with_company_user() RETURNS trigger AS $$
BEGIN
  DELETE FROM login_identities WHERE id = OLD."loginIdentityId";
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "company_users_identity_dies" ON "company_users";
CREATE TRIGGER "company_users_identity_dies"
  AFTER DELETE ON "company_users"
  FOR EACH ROW EXECUTE FUNCTION identity_dies_with_company_user();
