-- ق-١٢٦١ ج — ⑦A3 إيداعُ الدرج في البنك عبر «نقدٍ في الطريق» 1190: جدولُ cash_deposits بحالته (في الطريق · مؤكَّد · مُلغى)،
-- ومفاتيحُه المفردةُ والمركّبةُ بجانبها (ق-١٢٥٩). لا كتابةَ بيانات.

-- CreateEnum
CREATE TYPE "CashDepositStatus" AS ENUM ('IN_TRANSIT', 'CONFIRMED', 'VOID');

-- CreateTable
CREATE TABLE "cash_deposits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "memo" TEXT,
    "status" "CashDepositStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "drawerId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "voidJournalEntryId" TEXT,
    "confirmedTransactionId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_deposits_confirmedTransactionId_key" ON "cash_deposits"("confirmedTransactionId");

-- CreateIndex
CREATE INDEX "cash_deposits_companyId_status_idx" ON "cash_deposits"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_deposits_companyId_no_key" ON "cash_deposits"("companyId", "no");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_companyId_id_key" ON "bank_transactions"("companyId", "id");

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "branches"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_drawerId_fkey" FOREIGN KEY ("drawerId") REFERENCES "cash_drawers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_companyId_drawerId_fkey" FOREIGN KEY ("companyId", "drawerId") REFERENCES "cash_drawers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_companyId_bankId_fkey" FOREIGN KEY ("companyId", "bankId") REFERENCES "banks"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_voidJournalEntryId_fkey" FOREIGN KEY ("voidJournalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_companyId_voidJournalEntryId_fkey" FOREIGN KEY ("companyId", "voidJournalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_confirmedTransactionId_fkey" FOREIGN KEY ("confirmedTransactionId") REFERENCES "bank_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_companyId_confirmedTransactionId_fkey" FOREIGN KEY ("companyId", "confirmedTransactionId") REFERENCES "bank_transactions"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- RLS — بيدٍ كسائر جداول المنشأة (§6.13): طبقتان.
ALTER TABLE "cash_deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_deposits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cash_deposits ON "cash_deposits"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
