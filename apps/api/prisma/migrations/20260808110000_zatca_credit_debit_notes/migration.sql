-- ZATCA credit/debit notes (gate finding 2026-08-08): the generator only ever
-- issued 388 tax invoices, and the authority's compliance check requires all
-- six document samples (standard/simplified × invoice/credit/debit) before a
-- production CSID is issued. Notes are rows in `invoices` — same table so the
-- hash-chain/ICV queries cover every document type without change. No new RLS
-- needed: the columns ride on the already-FORCE-RLS invoices table.

-- CreateEnum
CREATE TYPE "InvoiceDocType" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "docType" "InvoiceDocType" NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "relatedInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "invoices_relatedInvoiceId_idx" ON "invoices"("relatedInvoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
