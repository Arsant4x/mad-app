-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('RENT_ESCALATION');

-- AlterTable
ALTER TABLE "reminder_policies" ADD COLUMN     "escalateAfterDays" INTEGER,
ADD COLUMN     "escalateToUserId" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "targetUserId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkScreen" TEXT,
    "linkId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_companyId_readAt_idx" ON "notifications"("companyId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_companyId_dedupeKey_key" ON "notifications"("companyId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "reminder_policies" ADD CONSTRAINT "reminder_policies_escalateToUserId_fkey" FOREIGN KEY ("escalateToUserId") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Row-Level Security. A notification names a tenant, an amount and how late it
-- is — the same exposure as the rent ledger it points at.
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notifications ON "notifications"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
