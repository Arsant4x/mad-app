-- ⚖️ البند ٥٩٩ (توجيه ٢٨٦ · القاعدة ٣٧ · ق-١٥٨١) — مرآةُ البنك تحمل فرعَ سندها.
-- صفوفُ الحركة البنكية التي يكتبها الترحيلُ مرآةً لسند (قبضٌ · صرفٌ · تسويةُ شبكة · نقلُ صندوق · قبضُ إيجار)
-- كانت تُكتب بلا فرع، وقائمةُ الحركات تُدخل ما بلا فرع لكلِّ مقيَّد، فرأى المقيَّدُ بفرعٍ حركاتِ صناديق غيره
-- (مقيسٌ حيّاً قبل الإصلاح في bank-mirror-branch.e2e-spec.ts). والشيفرةُ تكتب الفرعَ من اليوم؛ وهذه تملأ القائم:
--   ① من قيد المرآة نفسِه (entryNo ⟵ journal_entries.no)، فالقيدُ يحمل فرعَ سنده؛
--   ② وما بقي بلا فرع: فرعُ الصندوق الذي تحرّك.
-- وما يبقى بعدهما بلا فرع حركةُ بنكٍ على مستوى المنشأة. ولا تُمسّ السطورُ اليدوية (entryNo فارغ — ق-٢٨١):
-- فرعُها يختاره كاتبُها.
--
-- ⚠️ الجداولُ الثلاثة تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): يُرفع FORCE مؤقّتاً ليرى المالكُ الصفوفَ كلَّها ثم
-- يُعاد. والعددُ يُعلَن بـWARNING لا NOTICE (ق-٦٩٥)، والصفرُ يُعلَن كما يُعلَن العدد (ق-٦٩١).

ALTER TABLE "bank_transactions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "banks" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_null      integer;
  n_by_entry  integer := 0;
  n_by_box    integer := 0;
  n_left      integer;
BEGIN
  SELECT count(*) INTO n_null FROM "bank_transactions" WHERE "branchId" IS NULL AND "entryNo" IS NOT NULL;

  IF n_null > 0 THEN
    UPDATE "bank_transactions" bt
       SET "branchId" = je."branchId"
      FROM "journal_entries" je
     WHERE bt."branchId" IS NULL
       AND bt."entryNo" IS NOT NULL
       AND je."companyId" = bt."companyId"
       AND je."no" = bt."entryNo"
       AND je."branchId" IS NOT NULL;
    GET DIAGNOSTICS n_by_entry = ROW_COUNT;

    UPDATE "bank_transactions" bt
       SET "branchId" = b."branchId"
      FROM "banks" b
     WHERE bt."branchId" IS NULL
       AND bt."entryNo" IS NOT NULL
       AND b."id" = bt."bankId"
       AND b."companyId" = bt."companyId"
       AND b."branchId" IS NOT NULL;
    GET DIAGNOSTICS n_by_box = ROW_COUNT;
  END IF;

  SELECT count(*) INTO n_left FROM "bank_transactions" WHERE "branchId" IS NULL AND "entryNo" IS NOT NULL;

  RAISE WARNING 'البند ٥٩٩: % مرآةً بلا فرع؛ أخذت % فرعَ قيدها و% فرعَ صندوقها، وبقيت % على مستوى المنشأة (بنكٌ بلا فرع وقيدٌ بلا فرع)',
    n_null, n_by_entry, n_by_box, n_left;
END $$;

ALTER TABLE "banks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "bank_transactions" FORCE ROW LEVEL SECURITY;
