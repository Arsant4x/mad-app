-- ⭐ `٣٠` الأرصدةُ الافتتاحية بالطبقات (ق-١١٧٧ · ق-١١٧٩): إعلانُ رصيد الرفّ بتكلفته وتاريخ اقتنائه —
-- رأسٌ لكلِّ إعلان (`stock_openings`) وسطورٌ تملك ما أُعلن وتشير إلى حركةٍ `IN`/`OPENING` وطبقةٍ `OPENING`
-- (`stock_opening_lines`)، وقيدٌ واحد للإعلان مدين `1300` / دائن `3900` مربوطٌ بالرأس.
--
-- ⚠️ الهجرةُ **لا تكتب بيانات**: تُنشئ الجدولين وتعدّ القائمَ وتصرخ به (`§8.28`) — طبقاتُ التسوية بمتبقٍّ
-- (افتتاحٌ مقنَّعٌ محتمَل — `ق-١١٧٨`: تُعدّ وتُعلَن ولا تُحوَّل) وحساباتُ `1300` ذاتُ رصيدٍ افتتاحيٍّ من شاشة الحسابات
-- (المصدرُ الثاني الذي يُغلق بابُه في الخدمة — `ق-١١٧٧/②`).
--
-- الفرقُ مولَّدٌ بـ`prisma migrate diff` على قاعدةٍ بمخطَّط `main` (صفرُ `DROP`) ثم أُضيفت القيودُ وعزلُ الصفوف بيدٍ.

-- CreateTable
CREATE TABLE "stock_openings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "openingDate" DATE NOT NULL,
    "declaredById" TEXT NOT NULL,
    "declaredByType" TEXT NOT NULL,
    "declaredByName" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_opening_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "acquiredAt" DATE NOT NULL,
    "evidenceRef" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidMovementId" TEXT,
    "voidJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_opening_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_openings_journalEntryId_key" ON "stock_openings"("journalEntryId");

-- CreateIndex
CREATE INDEX "stock_openings_companyId_openingDate_idx" ON "stock_openings"("companyId", "openingDate");

-- CreateIndex
CREATE UNIQUE INDEX "stock_openings_companyId_no_key" ON "stock_openings"("companyId", "no");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opening_lines_movementId_key" ON "stock_opening_lines"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opening_lines_layerId_key" ON "stock_opening_lines"("layerId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opening_lines_voidMovementId_key" ON "stock_opening_lines"("voidMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opening_lines_voidJournalEntryId_key" ON "stock_opening_lines"("voidJournalEntryId");

-- CreateIndex
CREATE INDEX "stock_opening_lines_companyId_openingId_idx" ON "stock_opening_lines"("companyId", "openingId");

-- CreateIndex
CREATE INDEX "stock_opening_lines_productId_warehouseId_idx" ON "stock_opening_lines"("productId", "warehouseId");

-- AddForeignKey
ALTER TABLE "stock_openings" ADD CONSTRAINT "stock_openings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_openings" ADD CONSTRAINT "stock_openings_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "stock_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "inventory_layers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_voidMovementId_fkey" FOREIGN KEY ("voidMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_voidJournalEntryId_fkey" FOREIGN KEY ("voidJournalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ القيود — ما لا تعبّر عنه Prisma ═══
-- كمّيةٌ موجبة، وتكلفةٌ غيرُ سالبة (الصفرُ الصريح مقبول — عيّناتٌ مجّانية)، والقيمةُ تتبع.
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_qty_positive" CHECK ("qty" > 0);
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_cost_nonneg" CHECK ("unitCost" >= 0 AND "baseAmount" >= 0);
-- الإلغاءُ ثلاثيٌّ معاً: وقتُه وحركتُه العاكسة — لا نصفُ إلغاء.
ALTER TABLE "stock_opening_lines" ADD CONSTRAINT "stock_opening_lines_void_complete"
    CHECK (("voidedAt" IS NULL AND "voidMovementId" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidMovementId" IS NOT NULL));

-- ═══ عزلُ الصفوف — يُكتب بيدٍ دائماً (§6.13) ═══
ALTER TABLE "stock_openings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_openings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_openings ON "stock_openings"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_opening_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_opening_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_opening_lines ON "stock_opening_lines"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- ═══ القائمُ يُعدّ ويُعلَن ولا يُخمَّن (ق-١١٧٨) ═══
-- طبقاتُ تسويةٍ بمتبقٍّ: قد تكون افتتاحاً مقنَّعاً (حركةٌ يدوية بتاريخ الحركة وبلا قيد) وقد لا تكون —
-- لا تُحوَّل ولا تُحسب في تقرير الافتتاح؛ وحساباتُ `1300` ذاتُ رصيدٍ افتتاحيٍّ من شاشة الحسابات: المصدرُ
-- الثاني الذي تردّه الخدمةُ من اليوم — ما سبق يبقى ويُعدّ.
-- ⚠️ الجداولُ تحت FORCE والهجرةُ بـapp_user: عدٌّ بلا سياقِ منشأةٍ يرى الغيابَ حيث لا غياب (§4 — قاعدةُ 2026-08-12)،
-- فتُقام كلُّ منشأةٍ في سياقها (set_config) وتُجمع الأعداد — كما في هجرة الاستلام (ق-٢٦٢).
DO $$
DECLARE
  c             record;
  companies_n   integer := 0;
  k             bigint;
  adj_layers    bigint := 0;
  adj_remaining bigint := 0;
  inv_openings  bigint := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    companies_n := companies_n + 1;
    PERFORM set_config('app.company_id', c.id, true);

    SELECT count(*) INTO k FROM inventory_layers WHERE "sourceType" = 'ADJUSTMENT';
    adj_layers := adj_layers + k;
    SELECT count(*) INTO k FROM inventory_layers WHERE "sourceType" = 'ADJUSTMENT' AND "qtyRemaining" > 0;
    adj_remaining := adj_remaining + k;
    SELECT count(*) INTO k FROM accounts WHERE "code" = '1300' AND "openingBalance" <> 0;
    inv_openings := inv_openings + k;
  END LOOP;

  IF companies_n = 0 THEN
    RAISE WARNING 'ق-١١٧٨: لا منشأةَ — قاعدةٌ فارغة، لا قائمَ يُعلَن';
  ELSIF adj_layers = 0 AND inv_openings = 0 THEN
    RAISE WARNING 'ق-١١٧٨: % منشأة — لا طبقاتِ تسويةٍ ولا أرصدةَ افتتاحيةً على 1300: لا قائمَ يُعلَن', companies_n;
  ELSE
    RAISE WARNING 'ق-١١٧٨: % منشأة — طبقاتُ تسويةٍ % (منها % بمتبقٍّ: افتتاحٌ مقنَّعٌ محتمَل، تُعدّ ولا تُحوَّل) · حساباتُ 1300 برصيدٍ افتتاحيٍّ من شاشة الحسابات % (تبقى وتُعدّ؛ والجديدُ يُرفض)',
      companies_n, adj_layers, adj_remaining, inv_openings;
  END IF;
END $$;
