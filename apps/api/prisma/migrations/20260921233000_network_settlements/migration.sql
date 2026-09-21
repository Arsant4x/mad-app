-- ق-١٢٦١ ج — ⑦A2 تسويةُ الشبكة 1251: جدولُ network_settlements بحالته (مرحَّلة · مُلغاة)، وحقلُ المطالبة على سندات
-- القبض payments.networkSettlementId، ومفاتيحُه المفردةُ والمركّبةُ بجانبها (ق-١٢٥٩). لا كتابةَ بيانات.

-- CreateEnum
CREATE TYPE "NetworkSettlementStatus" AS ENUM ('POSTED', 'VOID');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "networkSettlementId" TEXT;

-- CreateTable
CREATE TABLE "network_settlements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2) NOT NULL,
    "feeVatAmount" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "memo" TEXT,
    "status" "NetworkSettlementStatus" NOT NULL DEFAULT 'POSTED',
    "bankId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "voidJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "network_settlements_companyId_status_idx" ON "network_settlements"("companyId", "status");

-- CreateIndex
CREATE INDEX "network_settlements_companyId_bankId_idx" ON "network_settlements"("companyId", "bankId");

-- CreateIndex
CREATE UNIQUE INDEX "network_settlements_companyId_no_key" ON "network_settlements"("companyId", "no");

-- CreateIndex
CREATE UNIQUE INDEX "network_settlements_companyId_id_key" ON "network_settlements"("companyId", "id");

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "branches"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_companyId_bankId_fkey" FOREIGN KEY ("companyId", "bankId") REFERENCES "banks"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_voidJournalEntryId_fkey" FOREIGN KEY ("voidJournalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_settlements" ADD CONSTRAINT "network_settlements_companyId_voidJournalEntryId_fkey" FOREIGN KEY ("companyId", "voidJournalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_networkSettlementId_fkey" FOREIGN KEY ("networkSettlementId") REFERENCES "network_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_networkSettlementId_fkey" FOREIGN KEY ("companyId", "networkSettlementId") REFERENCES "network_settlements"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- RLS — بيدٍ كسائر جداول المنشأة (§6.13): طبقتان.
ALTER TABLE "network_settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "network_settlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_network_settlements ON "network_settlements"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
