-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "purchase_lines" ADD COLUMN     "supersededAt" TIMESTAMP(3);

