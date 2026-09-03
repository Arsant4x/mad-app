-- §30 المرتجعات — موجة أ (قرار المالك 2026-09-03)
-- مولَّدٌ بـ`prisma migrate diff --from-schema-datamodel <main> --to-schema-datamodel <this>` — إضافةُ
-- أعمدةٍ وفهارسٍ ومفاتيح فقط، لا DROP. البضاعة تعود إلى طبقتها الأصلية عبر سطر الإشعار الدائن
-- (returnsLineId → invoice_lines) وحالتها (returnCondition)، وسندُ الردّ مستقلٌّ (payments.kind = REFUND)
-- مربوطٌ بإشعاره (refundsInvoiceId → invoices). RESTRICT: سطرُ بيعٍ رُدّ منه شيء، وإشعارٌ رُدّ نقداً — لا يُحذفان.

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED', 'REPAIRABLE');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('RECEIPT', 'REFUND');

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "returnCondition" "ReturnCondition",
ADD COLUMN     "returnsLineId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'RECEIPT',
ADD COLUMN     "refundsInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "invoice_lines_returnsLineId_idx" ON "invoice_lines"("returnsLineId");

-- CreateIndex
CREATE INDEX "payments_refundsInvoiceId_idx" ON "payments"("refundsInvoiceId");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_returnsLineId_fkey" FOREIGN KEY ("returnsLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refundsInvoiceId_fkey" FOREIGN KEY ("refundsInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
