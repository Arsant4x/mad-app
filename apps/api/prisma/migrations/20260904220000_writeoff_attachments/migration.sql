-- CreateTable
CREATE TABLE "inventory_write_off_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "writeOffId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_write_off_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_write_off_attachments_writeOffId_idx" ON "inventory_write_off_attachments"("writeOffId");

-- AddForeignKey
ALTER TABLE "inventory_write_off_attachments" ADD CONSTRAINT "inventory_write_off_attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_off_attachments" ADD CONSTRAINT "inventory_write_off_attachments_writeOffId_fkey" FOREIGN KEY ("writeOffId") REFERENCES "inventory_write_offs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══ عزل المستأجر — ENABLE وFORCE معاً ═══
-- ⚠️ **FORCE شرطٌ لا تفصيل**: مالك الجدول يتجاوز السياسة بدونه، والاتصال الذي
-- تُشغَّل به الترحيلات هو المالك. وحارس `rls-coverage.live.spec.ts` يقرأ
-- `pg_class.relforcerowsecurity` ويسقط على أي جدولٍ مستأجرٍ بلا الاثنين.
ALTER TABLE "inventory_write_off_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_write_off_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_write_off_attachments ON "inventory_write_off_attachments"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

