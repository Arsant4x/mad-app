-- CreateEnum
CREATE TYPE "WriteOffStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "MovementOrigin" ADD VALUE 'WRITEOFF';

-- CreateTable
CREATE TABLE "inventory_write_offs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" DATE NOT NULL,
    "status" "WriteOffStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "recordedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "baseCost" DECIMAL(18,2),
    "movementId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_write_offs_movementId_key" ON "inventory_write_offs"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_write_offs_journalEntryId_key" ON "inventory_write_offs"("journalEntryId");

-- CreateIndex
CREATE INDEX "inventory_write_offs_companyId_status_idx" ON "inventory_write_offs"("companyId", "status");

-- CreateIndex
CREATE INDEX "inventory_write_offs_companyId_productId_warehouseId_idx" ON "inventory_write_offs"("companyId", "productId", "warehouseId");

-- CreateIndex
CREATE INDEX "inventory_write_offs_companyId_occurredAt_idx" ON "inventory_write_offs"("companyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_write_offs_companyId_no_key" ON "inventory_write_offs"("companyId", "no");

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══ عزل المستأجر — ENABLE وFORCE معاً ═══
-- ⚠️ **FORCE شرطٌ لا تفصيل**: مالك الجدول يتجاوز السياسة بدونه، والاتصال الذي
-- تُشغَّل به الترحيلات هو المالك. وحارس `rls-coverage.live.spec.ts` يقرأ
-- `pg_class.relforcerowsecurity` ويسقط على أي جدولٍ مستأجرٍ بلا الاثنين.
ALTER TABLE "inventory_write_offs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_write_offs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_write_offs ON "inventory_write_offs"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));


-- ═══ قيدٌ في القاعدة: الاعتماد يحمل أثرَيه، والرفض يحمل سببه ═══
--
-- ⚠️ **ولماذا `CHECK` لا فحصٌ في الخدمة**: الحالة الوسطى (`APPROVED` بلا قيد)
-- **تكذب على تقرير التلف** — واقعةٌ تبدو معتمَدةً والدفتر لا يعرفها. وفحصُ
-- الخدمة يحمي مسارها وحده، ومن كتب بـ`psql` أو بمسارٍ يُكتب غداً يمرّ منه.
ALTER TABLE "inventory_write_offs"
  ADD CONSTRAINT "write_off_approved_has_effects" CHECK (
    CASE "status"
      -- ⚠️ **والقيد يجوز غيابه بشرطٍ واحد معلَن: تكلفةٌ صفر.** بضاعةٌ لا طبقةَ
      -- لها بتكلفة (بيعٌ سبق استلامه، أو صنفٌ بتكلفة صفر) **تُشطب فعلاً**
      -- وحركتُها تقع، ولا شيء يُرحَّل — و`createJournalEntry` نفسها ترفض قيداً
      -- مجموعُه صفر. فالشرط يقول ذلك صراحةً بدل أن يُترك للخدمة.
      WHEN 'APPROVED' THEN "movementId" IS NOT NULL AND "baseCost" IS NOT NULL AND "reviewedById" IS NOT NULL
                            AND ("journalEntryId" IS NOT NULL OR "baseCost" = 0)
      WHEN 'REJECTED' THEN "rejectionReason" IS NOT NULL AND "reviewedById" IS NOT NULL AND "movementId" IS NULL AND "journalEntryId" IS NULL
      ELSE "movementId" IS NULL AND "journalEntryId" IS NULL AND "reviewedById" IS NULL
    END
  );

-- والكمية موجبة — **صفرٌ أو سالب يجعل «كم أتلفنا» رقماً لا معنى له**.
ALTER TABLE "inventory_write_offs"
  ADD CONSTRAINT "write_off_qty_positive" CHECK ("qty" > 0);

