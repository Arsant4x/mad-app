-- DropIndex
DROP INDEX "permission_templates_name_key";

-- AlterTable
ALTER TABLE "permission_templates" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "permission_templates_companyId_name_key" ON "permission_templates"("companyId", "name");

-- AddForeignKey
ALTER TABLE "permission_templates" ADD CONSTRAINT "permission_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

