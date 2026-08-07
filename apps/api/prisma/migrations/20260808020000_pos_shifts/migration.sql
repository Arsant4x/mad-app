-- CreateEnum
CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "posShiftId" TEXT;

-- CreateTable
CREATE TABLE "pos_shifts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "openedById" TEXT NOT NULL,
    "openedByName" TEXT NOT NULL,
    "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingFloat" DECIMAL(18,2) NOT NULL,
    "declaredClosing" DECIMAL(18,2),
    "notes" TEXT,

    CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_shifts_companyId_status_idx" ON "pos_shifts"("companyId", "status");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_posShiftId_fkey" FOREIGN KEY ("posShiftId") REFERENCES "pos_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-Level Security: tenant isolation (same block as every other tenant table).
ALTER TABLE "pos_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_shifts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pos_shifts ON "pos_shifts"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
