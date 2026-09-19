-- ٢٥ — الاستلامُ المستقلّ (ق-١١٢١ · ق-١١٢٢ · ق-١١٣١): كيانُ استلامٍ فوق الشراء لا بدلَه.
--
-- ما كان: الاستلامُ ضمنيٌّ داخل إنشاء الشراء — لا جدولَ ولا رقمَ ولا استلامَ جزئيّ، والطبقةُ بتاريخ
-- فاتورة المورّد. ما صار: `goods_receipts` بسطوره (`GR-YYYY-NNNN` · مستودعٌ · `receivedAt` = تاريخُ الطبقة)،
-- والحركةُ تحمل سطرَ الاستلام **وسطرَ الشراء معاً** فلا ينكسر ما يقرأ `purchaseLineId`. والوسيطُ
-- (بضاعةٌ مستلَمة غيرُ مفوترة) حسابٌ يُنشأ عند الحاجة برمزٍ مشتقٍّ، وتشير إليه المنشأةُ بالمعرّف.
--
-- ⚠️ القائمُ يُعلَن ويُكتب له ما يُقرأ لا ما يُخمَّن (ق-١١٢٢/③): كلُّ سطرِ شراءٍ حيٍّ استُلم ضمنيّاً قبل
-- البناء (له حركةُ `IN`/`RECEIPT` بلا سطرِ استلام) يُكتب له استلامٌ ضمنيٌّ **من حركته**: تاريخُ الحركة
-- ومستودعُها وكمّيتُها؛ وطبقاتُه لا تُمسّ، وقيودُه تبقى على `1300` مباشرةً (`journalEntryId` فارغ).
-- والعدُّ يُعلَن بـWARNING لا NOTICE (ق-٦٩٥)، والصفرُ يُعلَن (ق-٦٩١)؛ والتكرارُ لا يُعيد كتابةَ سطرٍ كُتب.
--
-- ⚠️ الجداولُ تحت FORCE والهجرةُ بـapp_user (ق-٢٦٢): تُقام كلُّ منشأةٍ في سياقها (set_config) — كما
-- في ق-٨٧٣ — فيُقرأ ويُكتب تحته ما يقرؤه التطبيق.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "receiptClearingAccountId" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "goodsReceiptLineId" TEXT;

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "branchId" TEXT,
    "receivedAt" DATE NOT NULL,
    "implicit" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseId_idx" ON "goods_receipts"("purchaseId");

-- CreateIndex
CREATE INDEX "goods_receipts_companyId_receivedAt_idx" ON "goods_receipts"("companyId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_companyId_no_key" ON "goods_receipts"("companyId", "no");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goodsReceiptId_idx" ON "goods_receipt_lines"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseLineId_idx" ON "goods_receipt_lines"("purchaseLineId");

-- (لا فهرسَ فريداً على companies.receiptClearingAccountId عمداً — انظر المخطَّط: تحديثُ عمودٍ في فهرسٍ فريد يقفل
--  صفَّ المنشأة FOR UPDATE فيقف عدّادُ المستندات على منفذه الخاصّ حتى مهلة المعاملة. الواحدُ لواحد بالبناء.)

-- CreateIndex
CREATE INDEX "stock_movements_goodsReceiptLineId_idx" ON "stock_movements"("goodsReceiptLineId");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_receiptClearingAccountId_fkey" FOREIGN KEY ("receiptClearingAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "purchase_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "goods_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ القيود — ما يستطيعه CHECK بلا قراءة جدولٍ آخر ═══
-- كمّيةُ الاستلام موجبة، وما رُحِّل له لا يكون سالباً.
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_amount_nonneg" CHECK ("baseAmount" >= 0);
-- سطرُ الاستلام على حركة استلامٍ وحدَها — ومعه سطرُ الشراء (الذي يوجبه قيدُ الأصل والمصدر القائم).
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_line_only_on_receipt"
    CHECK ("goodsReceiptLineId" IS NULL OR ("origin" = 'RECEIPT' AND "purchaseLineId" IS NOT NULL));

-- ═══ المُشغِّل — ما لا يستطيعه CHECK: سطرُ الاستلام على سطر الشراء نفسِه ═══
-- يُوسَّع مُشغِّلُ الأصل (م٤): بعد التحقّق من الصنف، إن حملت الحركةُ سطرَ استلامٍ وجب أن يكون سطرُ
-- الشراء الذي يشير إليه هو سطرَ الحركة — وإلا كُتب استلامُ سطرٍ على بضاعة سطرٍ آخر بلا خطأ.
CREATE OR REPLACE FUNCTION stock_movement_source_consistency() RETURNS trigger AS $$
DECLARE
  line_product TEXT;
  receipt_purchase_line TEXT;
BEGIN
  IF NEW."invoiceLineId" IS NOT NULL THEN
    SELECT "productId" INTO line_product FROM "invoice_lines" WHERE "id" = NEW."invoiceLineId";
  ELSIF NEW."purchaseLineId" IS NOT NULL THEN
    SELECT "productId" INTO line_product FROM "purchase_lines" WHERE "id" = NEW."purchaseLineId";
  ELSE
    RETURN NEW;
  END IF;

  IF line_product IS NULL THEN
    RAISE EXCEPTION 'حركة مخزون تشير إلى سطر مستند بلا صنف — لا يُعرف ماذا تحرّك (movement=%, origin=%)',
      NEW."id", NEW."origin";
  END IF;

  IF line_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'صنف الحركة يخالف صنف سطر المستند: الحركة % والسطر % (movement=%)',
      NEW."productId", line_product, NEW."id";
  END IF;

  IF NEW."goodsReceiptLineId" IS NOT NULL THEN
    SELECT "purchaseLineId" INTO receipt_purchase_line FROM "goods_receipt_lines" WHERE "id" = NEW."goodsReceiptLineId";
    IF receipt_purchase_line IS DISTINCT FROM NEW."purchaseLineId" THEN
      RAISE EXCEPTION 'سطر الاستلام على سطر شراءٍ غير سطر الحركة: الاستلام على % والحركة على % (movement=%)',
        receipt_purchase_line, NEW."purchaseLineId", NEW."id";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movement_source_consistency_trg ON "stock_movements";
CREATE TRIGGER stock_movement_source_consistency_trg
  BEFORE INSERT OR UPDATE OF "productId", "invoiceLineId", "purchaseLineId", "goodsReceiptLineId" ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_source_consistency();

-- ═══ عزلُ المستأجر — ENABLE وFORCE معاً (§6.13: تُكتب بيد، فالمخطَّط لا يعبّر عنها) ═══
ALTER TABLE "goods_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_goods_receipts ON "goods_receipts"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "goods_receipt_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipt_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_goods_receipt_lines ON "goods_receipt_lines"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ═══ القائمُ يُكتب له ما يُقرأ من حركاته — منشأةً منشأةً في سياقها، بعدٍّ وإعلان ═══
DO $$
DECLARE
  c               record;
  g               record;
  companies_n     integer := 0;
  n_receipts      integer := 0;
  n_lines         integer := 0;
  n_movements     integer := 0;
  n_no_movement   integer := 0;
  k               integer;
  cur_year        integer := 0;
  seq             integer := 0;
  rid             text;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);
    cur_year := 0;
    seq := 0;

    -- استلامٌ لكلِّ (شراءٍ · مستودعٍ · تاريخِ حركة) من حركات الإدخال التي بلا سطرِ استلام — على أسطرٍ حيّة
    -- لمشترياتٍ غيرِ ملغاة. والترتيبُ بالسنة ثم التاريخ ثم الإنشاء فيتسلسل الرقمُ كما لو صدر يومَه.
    FOR g IN
      SELECT pl."purchaseId", m."warehouseId", m."date", p."branchId",
             EXTRACT(YEAR FROM m."date")::integer AS yr, p."createdAt"
        FROM stock_movements m
        JOIN purchase_lines pl ON pl."id" = m."purchaseLineId"
        JOIN purchases p ON p."id" = pl."purchaseId"
       WHERE m."type" = 'IN' AND m."origin" = 'RECEIPT' AND m."goodsReceiptLineId" IS NULL
         AND pl."supersededAt" IS NULL AND p."voidedAt" IS NULL
       GROUP BY pl."purchaseId", m."warehouseId", m."date", p."branchId", p."createdAt"
       ORDER BY EXTRACT(YEAR FROM m."date"), m."date", p."createdAt"
    LOOP
      IF g.yr <> cur_year THEN
        cur_year := g.yr;
        seq := 0;
      END IF;
      seq := seq + 1;
      rid := gen_random_uuid()::text;

      INSERT INTO goods_receipts ("id", "companyId", "no", "purchaseId", "warehouseId", "branchId", "receivedAt", "implicit", "notes", "journalEntryId", "voidedAt", "createdAt", "updatedAt")
      VALUES (rid, c.id, 'GR-' || cur_year || '-' || lpad(seq::text, 4, '0'), g."purchaseId", g."warehouseId", g."branchId", g."date", true,
              'استلامٌ ضمنيٌّ سبق البناء — كُتب من حركة الإدخال (ق-١١٣١)', NULL, NULL, now(), now());
      n_receipts := n_receipts + 1;

      -- سطرٌ لكلِّ حركةِ إدخالٍ في المجموعة: كمّيتُها كما هي، وما رُحِّل لها = كمّية × سعر السطر × سعر الصرف.
      INSERT INTO goods_receipt_lines ("id", "companyId", "goodsReceiptId", "purchaseLineId", "quantity", "baseAmount", "createdAt")
      SELECT gen_random_uuid()::text, c.id, rid, pl."id", m."qty", round(m."qty" * pl."unitPrice" * p."exchangeRate", 2), now()
        FROM stock_movements m
        JOIN purchase_lines pl ON pl."id" = m."purchaseLineId"
        JOIN purchases p ON p."id" = pl."purchaseId"
       WHERE m."type" = 'IN' AND m."origin" = 'RECEIPT' AND m."goodsReceiptLineId" IS NULL
         AND pl."supersededAt" IS NULL AND p."voidedAt" IS NULL
         AND pl."purchaseId" = g."purchaseId" AND m."warehouseId" = g."warehouseId" AND m."date" = g."date";
      GET DIAGNOSTICS k = ROW_COUNT; n_lines := n_lines + k;

      -- والحركةُ تشير إلى سطرها — فيقرأ الجديدُ والقديمُ بمسارٍ واحد.
      UPDATE stock_movements m SET "goodsReceiptLineId" = grl."id"
        FROM goods_receipt_lines grl
       WHERE grl."goodsReceiptId" = rid AND grl."purchaseLineId" = m."purchaseLineId"
         AND m."type" = 'IN' AND m."origin" = 'RECEIPT' AND m."goodsReceiptLineId" IS NULL
         AND m."warehouseId" = g."warehouseId" AND m."date" = g."date";
      GET DIAGNOSTICS k = ROW_COUNT; n_movements := n_movements + k;
    END LOOP;

    -- سطرٌ مخزنيٌّ حيٌّ بلا حركةِ استلامٍ أصلاً (سبق طبقاتِ م٤) — يُعدّ ولا يُخمَّن له استلام:
    -- لا طبقةَ له فلا رفَّ، ويبقى خارج مطابقة الوسيط لأن قيدَه لم يمرّ بالوسيط.
    SELECT count(*) INTO k
      FROM purchase_lines pl
      JOIN purchases p ON p."id" = pl."purchaseId"
     WHERE pl."productId" IS NOT NULL AND pl."supersededAt" IS NULL AND p."voidedAt" IS NULL
       AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m."purchaseLineId" = pl."id" AND m."type" = 'IN' AND m."origin" = 'RECEIPT');
    n_no_movement := n_no_movement + k;
  END LOOP;

  IF companies_n = 0 THEN
    RAISE WARNING 'ق-١١٣١: لا منشأةَ — قاعدةٌ فارغة، لا استلامَ يُكتب';
  ELSE
    RAISE WARNING 'ق-١١٣١: % منشأة — كُتب للقائم: استلاماتٌ ضمنية % · سطورُها % · حركاتٌ وُصلت بسطرها % · وأسطرٌ مخزنية حيّة بلا حركةِ استلامٍ أصلاً (سبقت طبقاتِ م٤ — تُعدّ ولا يُخمَّن لها استلام): %',
      companies_n, n_receipts, n_lines, n_movements, n_no_movement;
  END IF;
END $$;
