-- ق-٨٧٣ — بُعدُ الطرف على سطر القيد، بحدّه الأدنى: عمودان اختياريان (customerId · supplierId)
-- يُملآن من resolveDimensions() لا بيد، وترحيلٌ رجعيّ من المستندات بعدٍّ وإعلان.
--
-- لماذا: 2100 (و1200) مجمَّعان ولا يُعرف لمن ندين؛ وحصّةُ مالك العقار تُقيَّد بلا مستندِ شراءٍ
-- تُخصَّص عليه — فسطرُ القيد وحدَه يعرفها. والذمّةُ التي لا تُنسب لا تُدفع.
--
-- الترحيلُ الرجعيّ: كلُّ قيدٍ يشير إليه مستندٌ له طرف — فاتورةٌ/سندُ قبض ⇒ عميلُه، شراءٌ/سندُ صرف
-- ⇒ مورّدُه، وما يتبع عقداً له عميلٌ مسجَّل (تسويةٌ · مطالبةٌ · تأمينٌ · دفعةُ إيجار · خلوّ) ⇒ عميلُ
-- العقد — تُختم أسطرُه كلُّها بالطرف (كما تُختم الأبعادُ الأخرى على كل سطر). وما لا مستندَ له
-- بطرف (قيدٌ يدويّ · افتتاحيّ · عقدٌ بلا عميل مسجَّل) يبقى بلا طرفٍ ويُعلَن عددُه — لا يُلفَّق.
--
-- ⚠️ الجداولُ كلُّها تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): فبدل رفع FORCE عن عشرة جداول، تُقام
-- كلُّ منشأةٍ في سياقها (set_config على app.company_id) وتُعبَّأ أسطرُها تحته — كما يقرؤها التطبيق.
-- والعدُّ يُعلَن بـWARNING لا NOTICE (ق-٦٩٥)، والصفرُ يُعاد (ق-٦٩١)، والتكرارُ لا يُعيد ملءَ سطرٍ مُلئ.

-- AlterTable
ALTER TABLE "journal_lines" ADD COLUMN "customerId" TEXT,
ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "journal_lines_companyId_customerId_idx" ON "journal_lines"("companyId", "customerId");
CREATE INDEX "journal_lines_companyId_supplierId_idx" ON "journal_lines"("companyId", "supplierId");

-- AddForeignKey — Restrict: الدفترُ سجلُّ واقعة، وطرفٌ له سطور لا يُحذف (كالوحدة والعقار).
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── الترحيلُ الرجعيّ من المستندات — منشأةً منشأةً في سياقها، بعدٍّ وإعلان ────────────────────
DO $$
DECLARE
  c               record;
  companies_n     integer := 0;
  n               integer;
  n_invoices      integer := 0;
  n_payments      integer := 0;
  n_purchases     integer := 0;
  n_supplier_pays integer := 0;
  n_contracts     integer := 0;
  left_1200       integer := 0;
  left_2100       integer := 0;
  k               integer;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    -- ① الفواتير والإشعارات ⇒ عميلُها.
    UPDATE journal_lines l SET "customerId" = i."customerId"
      FROM invoices i
     WHERE i."journalEntryId" = l."journalEntryId" AND l."customerId" IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; n_invoices := n_invoices + n;

    -- ② سنداتُ القبض والردّ ⇒ عميلُها.
    UPDATE journal_lines l SET "customerId" = p."customerId"
      FROM payments p
     WHERE p."journalEntryId" = l."journalEntryId" AND l."customerId" IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; n_payments := n_payments + n;

    -- ③ المشتريات ⇒ مورّدُها.
    UPDATE journal_lines l SET "supplierId" = pu."supplierId"
      FROM purchases pu
     WHERE pu."journalEntryId" = l."journalEntryId" AND l."supplierId" IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; n_purchases := n_purchases + n;

    -- ④ سنداتُ الصرف ⇒ مورّدُها.
    UPDATE journal_lines l SET "supplierId" = sp."supplierId"
      FROM supplier_payments sp
     WHERE sp."journalEntryId" = l."journalEntryId" AND l."supplierId" IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; n_supplier_pays := n_supplier_pays + n;

    -- ⑤ ما يتبع عقداً له عميلٌ مسجَّل ⇒ عميلُ العقد. العقدُ بلا عميلٍ يبقى بلا طرفٍ ويُعدّ أدناه.
    WITH contract_entries AS (
      SELECT ct."settlementEntryId" AS entry_id, ct."customerId" FROM contracts ct WHERE ct."settlementEntryId" IS NOT NULL
      UNION SELECT r."journalEntryId", ct."customerId" FROM rent_payments r JOIN contracts ct ON ct.id = r."contractId" WHERE r."journalEntryId" IS NOT NULL
      UNION SELECT d."journalEntryId", ct."customerId" FROM contract_deposits d JOIN contracts ct ON ct.id = d."contractId" WHERE d."journalEntryId" IS NOT NULL
      UNION SELECT d."settlementEntryId", ct."customerId" FROM contract_deposits d JOIN contracts ct ON ct.id = d."contractId" WHERE d."settlementEntryId" IS NOT NULL
      UNION SELECT k."journalEntryId", ct."customerId" FROM contract_claims k JOIN contracts ct ON ct.id = k."contractId" WHERE k."journalEntryId" IS NOT NULL
      UNION SELECT k."settlementEntryId", ct."customerId" FROM contract_claims k JOIN contracts ct ON ct.id = k."contractId" WHERE k."settlementEntryId" IS NOT NULL
      UNION SELECT m."journalEntryId", ct."customerId" FROM contract_key_money m JOIN contracts ct ON ct.id = m."contractId" WHERE m."journalEntryId" IS NOT NULL
    )
    UPDATE journal_lines l SET "customerId" = ce."customerId"
      FROM contract_entries ce
     WHERE ce.entry_id = l."journalEntryId" AND ce."customerId" IS NOT NULL AND l."customerId" IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; n_contracts := n_contracts + n;

    SELECT count(*) INTO k FROM journal_lines l JOIN accounts a ON a.id = l."accountId" WHERE a.code = '1200' AND l."customerId" IS NULL;
    left_1200 := left_1200 + k;
    SELECT count(*) INTO k FROM journal_lines l JOIN accounts a ON a.id = l."accountId" WHERE a.code = '2100' AND l."supplierId" IS NULL;
    left_2100 := left_2100 + k;
  END LOOP;

  IF companies_n = 0 THEN
    RAISE WARNING 'ق-٨٧٣: لا منشأةَ — قاعدةٌ فارغة، لا سطرَ يُنسب';
  ELSE
    RAISE WARNING 'ق-٨٧٣: % منشأة — نُسب: فواتير % · سندات قبض % · مشتريات % · سندات صرف % · عقود %؛ وبقي بلا طرف: على 1200 % · على 2100 % (قيودٌ يدوية أو افتتاحية أو عقودٌ بلا عميل مسجَّل — لا تُلفَّق)',
      companies_n, n_invoices, n_payments, n_purchases, n_supplier_pays, n_contracts, left_1200, left_2100;
  END IF;
END $$;
