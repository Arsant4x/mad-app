-- ⚖️ ق-١٤٤٥ — الموظّفُ وحسابُ دخوله: ربطٌ صريحٌ من المالك، فريدٌ اختياريّ.
-- لا ملءَ ولا استنباط: القائمُ بلا ربطٍ حتى يربطه المالك (⛔ لا ربطَ بالاسم) — فلا تكتب الهجرةُ صفّاً.
-- من `prisma migrate diff` بين مخطَّط main ومخطَّط الفرع (لا `migrate dev` على القاعدة المشتركة — §6.13): لا `DROP`.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "companyUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyUserId_key" ON "employees"("companyUserId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey — ق-١٢٥٢: المركّبُ يمنع ربطَ موظّفٍ بحسابِ منشأةٍ أخرى من القاعدة لا من الخدمة وحدَها.
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_companyUserId_fkey" FOREIGN KEY ("companyId", "companyUserId") REFERENCES "company_users"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
