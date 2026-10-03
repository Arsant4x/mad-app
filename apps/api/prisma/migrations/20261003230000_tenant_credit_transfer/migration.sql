-- ⚖️ ق-١٦٢٩ (توجيه ٢٧٨، بحكم صاحب المشروع): «رصيدُ المستأجر يُخصم آلياً من أوّل قسطٍ في التجديد، ويُبنى الآن.»
-- والنقلُ يُسجَّل بأمرين:
--   ① نوعُ استحقاقٍ مسمّى `CREDIT_TRANSFER`: صفٌّ سالبٌ على العقد الأصل وصفٌّ موجبٌ على القسط بتاريخٍ واحد، فيتعادلان في الإقرار
--      (الضريبةُ استُحقّت يومَ القبض، م٢٠) ويحمل الموجبُ ضريبتَه فلا تُستحقّ ثانيةً عند حلول القسط.
--   ② دفعةٌ على القسط بلا نقدٍ يحمل صفُّها العقدَ الأصل (`creditFromContractId`)، فحالُ القسط وأعمارُ الذمم تقرأ المسدَّدَ منها كما هي،
--      ورصيدُ الأصل في عقار التشغيل يُطرح منه ما نُقل.
--
-- لا كتابةَ بيانات: قيمةٌ في تعداد وعمودٌ فارغٌ لكلِّ قبضٍ قائم.

-- AlterEnum
ALTER TYPE "RentAccrualKind" ADD VALUE 'CREDIT_TRANSFER';

-- AlterTable
ALTER TABLE "rent_payments" ADD COLUMN "creditFromContractId" TEXT;

-- CreateIndex
CREATE INDEX "rent_payments_creditFromContractId_idx" ON "rent_payments"("creditFromContractId");

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_creditFromContractId_fkey" FOREIGN KEY ("creditFromContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (ق-١٢٥٢ — المركّبُ بجانب المفرد، بلا فعلٍ عند الحذف)
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_companyId_creditFromContractId_fkey" FOREIGN KEY ("companyId", "creditFromContractId") REFERENCES "contracts"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
