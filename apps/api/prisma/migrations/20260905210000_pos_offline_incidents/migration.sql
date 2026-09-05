-- ═══ وقائعُ الانقطاع المستنتَجة على الخادم (ق-١٩٢/ج · ق-٢٠١) ═══
--
-- الهيئة توجب حفظَ السجلات عند تعطّل الحلّ (§10 · م ٧/٥) — «والتاجر قد يُسأل». لا
-- هويةَ طرفيةٍ عندنا، فالواقعة تُستنتَج من البيوع المزامَنة: نافذةٌ من أزمنة الرنّ
-- (لا من ترتيب الوصول) لبيوعٍ زُومنت بعد رنّها بأكثر من حدّ الفصل. الحدّ إعدادٌ
-- للمنشأة (posOfflineGapMinutes، افتراضه دقيقتان) ويُحفظ مع كل واقعة كي يُعرَض في
-- التقرير: استنتاجٌ لا قياس.
--
-- الجدول مملوكٌ للمستأجر: ENABLE + FORCE + سياسة — كسائر جداول المنشأة.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "posOfflineGapMinutes" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "offlineIncidentId" TEXT;

-- CreateTable
CREATE TABLE "pos_offline_incidents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "firstSyncedAt" TIMESTAMP(3) NOT NULL,
    "gapMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_offline_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_offline_incidents_companyId_startedAt_idx" ON "pos_offline_incidents"("companyId", "startedAt");

-- AddForeignKey
ALTER TABLE "pos_offline_incidents" ADD CONSTRAINT "pos_offline_incidents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_offlineIncidentId_fkey" FOREIGN KEY ("offlineIncidentId") REFERENCES "pos_offline_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ عزل المستأجر — الطبقة الثانية (rls-coverage.live.spec يوجبها لكل جدولٍ يملكه المستأجر) ═══
ALTER TABLE "pos_offline_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_offline_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pos_offline_incidents ON "pos_offline_incidents"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
