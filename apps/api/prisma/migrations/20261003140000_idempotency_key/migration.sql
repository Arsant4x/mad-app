-- ⚖️ توجيه ٢٧٦ · ق-١٦٠٩/ب · القاعدة ٣٧ — الإرسالُ المكرّر لا يُنشئ مستندين.
--
-- مفتاحُ الطلب من رأس `Idempotency-Key` على سند القبض وسند الصرف وقبض الإيجار، فريدٌ في المنشأة: الطلبُ نفسُه مرّتين يعيد
-- المستندَ نفسَه، وطلبان معاً يصطدم ثانيهما بالقيد هنا فيقرأ ما كتبه الأوّل. والفارغُ لا يصطدم (NULL لا يساوي NULL)، فالقائمُ
-- كلُّه بلا مفتاحٍ كما كان، ولا يُكتب صفٌّ ولا يُعدّ.
--
-- (وبيعُ الكاشير يحمل مفتاحَه منذ بُني: `invoices.clientSaleId` بقيده.)

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "supplier_payments" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "rent_payments" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_companyId_clientRequestId_key" ON "payments"("companyId", "clientRequestId");
CREATE UNIQUE INDEX "supplier_payments_companyId_clientRequestId_key" ON "supplier_payments"("companyId", "clientRequestId");
CREATE UNIQUE INDEX "rent_payments_companyId_clientRequestId_key" ON "rent_payments"("companyId", "clientRequestId");
