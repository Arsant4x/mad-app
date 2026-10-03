-- ⚖️ ق-١٦٠٠ · ق-١٦٠٩/د — بنودُ الرسوم على العقد (السؤالان ٤٩ و٤١٣، بحكم صاحب المشروع: «بنودٌ على العقد تُفوتر مع القسط»).
--
-- الرسمُ المسمّى فوق الإيجار توريدٌ منفصلٌ خاضعٌ ولو كان الإيجارُ سكنيّاً معفى: بندٌ على العقد بمبلغه لكلِّ قسط، ومطالبةٌ خاضعة
-- (`FEE`) مع كلِّ قسطٍ يحلّ، مرتبطةٌ بالبند والقسط بزوجٍ فريد فلا يُطالَب رسمٌ مرّتين عن قسطٍ واحد.
--
-- لا كتابةَ بيانات: جدولٌ جديد وعمودان فارغان. والجدولُ الجديدُ يحمل بياناتِ منشأة فكتلةُ RLS مكتوبةٌ بيد (§6.13).

-- AlterEnum
ALTER TYPE "ClaimKind" ADD VALUE 'FEE';

-- CreateTable
CREATE TABLE "contract_fees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "endedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_fees_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "contract_claims" ADD COLUMN "feeId" TEXT,
ADD COLUMN "installmentId" TEXT;

-- CreateIndex
CREATE INDEX "contract_fees_contractId_idx" ON "contract_fees"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_fees_companyId_id_key" ON "contract_fees"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_claims_feeId_installmentId_key" ON "contract_claims"("feeId", "installmentId");

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "contract_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_companyId_feeId_fkey" FOREIGN KEY ("companyId", "feeId") REFERENCES "contract_fees"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "contract_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_claims" ADD CONSTRAINT "contract_claims_companyId_installmentId_fkey" FOREIGN KEY ("companyId", "installmentId") REFERENCES "contract_installments"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_fees" ADD CONSTRAINT "contract_fees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_fees" ADD CONSTRAINT "contract_fees_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_fees" ADD CONSTRAINT "contract_fees_companyId_contractId_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- البندُ يُسمّى وله مبلغٌ موجب، وإنهاؤه لا يسبق سريانَه.
ALTER TABLE "contract_fees" ADD CONSTRAINT "contract_fees_named_positive" CHECK (btrim("label") <> '' AND "amount" > 0 AND ("endedAt" IS NULL OR "endedAt" >= "effectiveFrom"));

-- RLS — طبقةُ العزل الثانية (§6.1 · §6.13).
ALTER TABLE "contract_fees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_fees" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contract_fees ON "contract_fees"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
