-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('WHATSAPP', 'SMS', 'CALL', 'EMAIL', 'OTHER');

-- CreateTable
CREATE TABLE "reminder_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "daysBefore" INTEGER NOT NULL DEFAULT 3,
    "repeatEveryDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_reminders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_policies_companyId_key" ON "reminder_policies"("companyId");

-- AddForeignKey
ALTER TABLE "reminder_policies" ADD CONSTRAINT "reminder_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_reminders" ADD CONSTRAINT "rent_reminders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_reminders" ADD CONSTRAINT "rent_reminders_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "contract_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security. A reminder names a tenant and what they owe.
ALTER TABLE "reminder_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_reminder_policies ON "reminder_policies"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "rent_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rent_reminders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rent_reminders ON "rent_reminders"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
