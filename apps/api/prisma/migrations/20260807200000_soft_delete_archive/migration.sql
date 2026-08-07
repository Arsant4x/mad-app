-- AlterTable
ALTER TABLE "banks" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "message_scripts" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);


-- Trash listings scan by deletedAt; keep them cheap.
CREATE INDEX "customers_deletedAt_idx" ON "customers"("deletedAt");
CREATE INDEX "suppliers_deletedAt_idx" ON "suppliers"("deletedAt");
CREATE INDEX "products_deletedAt_idx" ON "products"("deletedAt");
CREATE INDEX "employees_deletedAt_idx" ON "employees"("deletedAt");
CREATE INDEX "banks_deletedAt_idx" ON "banks"("deletedAt");
CREATE INDEX "warehouses_deletedAt_idx" ON "warehouses"("deletedAt");
CREATE INDEX "message_scripts_deletedAt_idx" ON "message_scripts"("deletedAt");
CREATE INDEX "properties_deletedAt_idx" ON "properties"("deletedAt");
CREATE INDEX "units_deletedAt_idx" ON "units"("deletedAt");
