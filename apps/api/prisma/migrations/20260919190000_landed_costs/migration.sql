-- ٧ — التكاليفُ المحمَّلة (ق-١١٤٥ · ق-١١٤٦): توزيعُ فاتورةٍ خدمية (شحنٌ · تخليصٌ · رسومٌ جمركية) على طبقاتٍ مسمّاة.
--
-- ما كان: الشراءُ الخدميّ يُرحَّل إلى حساب فئته مصروفاً، ولا طريقَ من فاتورة الناقل إلى طبقةٍ على الرفّ؛
-- والفرقُ الثاني (تكلفةٌ تصل بعد البيع — ق-١٠٧٥) لم يُبنَ. ما صار: `landed_cost_distributions` رأسٌ لكلِّ سطرِ
-- شراءٍ خدميّ موزَّع (الطريقةُ · التاريخُ · القيدُ · الإلغاء) و`landed_cost_lines` نصيبُ كلِّ طبقة، وحصّةُ الرفّ
-- (تُضاف إلى تكلفة الطبقة — مدين 1300) وحصّةُ ما استُهلك قبل الوصول (مدين 5100 في فترة التوزيع)، دائناً حسابَ
-- فئة الشراء. **لا نوعَ مستندٍ ثالث ولا رقمَ تسلسل** — فاتورةُ الناقل شراءٌ كما هي، والصفُّ يشير إليها.
--
-- نقطةُ التعليق **الطبقةُ** (ق-١١٤٦): سطرُ الاستلام ⟵ حركتُه ⟵ طبقتُه (1:1 مقيساً 219/219) — فالصفُّ يشير إلى
-- الطبقة ويُقرأ استلامُها وشراؤها من خلالها؛ ولا يُكتب هنا شيءٌ للقائم — لا بياناتَ تُهاجَر (لا WARNING إذن).
--
-- ⚠️ الجدولان تحت FORCE (ق-٦٩١) — كتلةُ RLS بيدٍ لأن Prisma لا تعبّر عنها (§6.13).

-- CreateEnum
CREATE TYPE "LandedCostMethod" AS ENUM ('VALUE', 'QUANTITY', 'MANUAL');

-- CreateTable
CREATE TABLE "landed_cost_distributions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "method" "LandedCostMethod" NOT NULL,
    "date" DATE NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "baseInventory" DECIMAL(18,2) NOT NULL,
    "baseCogs" DECIMAL(18,2) NOT NULL,
    "journalEntryId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidJournalEntryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landed_cost_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landed_cost_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "baseAmount" DECIMAL(18,2) NOT NULL,
    "baseInventory" DECIMAL(18,2) NOT NULL,
    "baseCogs" DECIMAL(18,2) NOT NULL,
    "qtyRemainingAt" DECIMAL(18,3) NOT NULL,
    "unitCostBefore" DECIMAL(18,6) NOT NULL,
    "unitCostAfter" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landed_cost_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "landed_cost_distributions_companyId_purchaseId_idx" ON "landed_cost_distributions"("companyId", "purchaseId");

-- CreateIndex
CREATE INDEX "landed_cost_distributions_purchaseLineId_idx" ON "landed_cost_distributions"("purchaseLineId");

-- توزيعٌ واحد فعّال لكلِّ سطر شراء — بالقيد لا بالانضباط (§6.6): فهرسٌ جزئيّ لا تعبّر Prisma عن شرطه
-- (كما `egs_units`)، والخدمةُ تردّ 409 باسمه قبل أن يصل القيدُ.
CREATE UNIQUE INDEX "landed_cost_distributions_one_active_per_line"
  ON "landed_cost_distributions" ("purchaseLineId") WHERE "voidedAt" IS NULL;

-- CreateIndex
CREATE INDEX "landed_cost_lines_distributionId_idx" ON "landed_cost_lines"("distributionId");

-- CreateIndex
CREATE INDEX "landed_cost_lines_layerId_idx" ON "landed_cost_lines"("layerId");

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "purchase_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_voidJournalEntryId_fkey" FOREIGN KEY ("voidJournalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "landed_cost_distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "inventory_layers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ القيود — ما يستطيعه CHECK بلا قراءة جدولٍ آخر ═══
-- ما وُزِّع لا يكون سالباً، وحصّتاه تجمعان إليه؛ ونصيبُ الطبقة كذلك.
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_amount_nonneg" CHECK ("baseAmount" >= 0);
ALTER TABLE "landed_cost_distributions" ADD CONSTRAINT "landed_cost_distributions_split_sums"
    CHECK ("baseInventory" >= 0 AND "baseCogs" >= 0 AND "baseInventory" + "baseCogs" = "baseAmount");
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_amount_nonneg" CHECK ("baseAmount" >= 0);
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_split_sums"
    CHECK ("baseInventory" >= 0 AND "baseCogs" >= 0 AND "baseInventory" + "baseCogs" = "baseAmount");
ALTER TABLE "landed_cost_lines" ADD CONSTRAINT "landed_cost_lines_qty_nonneg" CHECK ("qtyRemainingAt" >= 0);

-- ═══ عزلُ الصفوف — طبقةٌ ثانية فوق حقن النطاق (§6.1) ═══
ALTER TABLE "landed_cost_distributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "landed_cost_distributions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_landed_cost_distributions ON "landed_cost_distributions"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "landed_cost_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "landed_cost_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_landed_cost_lines ON "landed_cost_lines"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
