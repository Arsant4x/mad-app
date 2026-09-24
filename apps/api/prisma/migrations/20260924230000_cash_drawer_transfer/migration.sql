-- ⚖️ نقلُ الدرج بين الفروع إغلاقٌ وفتح (ق-١٤١٣ · التوجيه ٢٦٣ §٤ بنصّ المالك: «فرعُه مكانُ النقد فعلاً»)
--
-- الدرجُ المنقول يُغلق في فرعه بعد عدِّ نقده ونقلِ رصيده، ويُفتح خلفُه درجاً جديداً في الفرع الهدف — **وتاريخُه لا
-- ينتقل**. فالسلفُ يشير إلى خلفه (`transferredToId` — فريدٌ: لكلِّ درجٍ خلفٌ واحد على الأكثر)، والرابطُ هو ما يقول لمن
-- يقرأ بعد سنة أين ذهب نقدُه.
--
-- `NO ACTION` لا `RESTRICT`: الخلفُ لا يُحذف وسلفُه يشير إليه — **والفحصُ آخرَ العبارة**، فحذفُ المنشأة يحذف الاثنين
-- معاً (`RESTRICT` يفحص صفّاً صفّاً فيُسقط الحذفَ المتسلسل). والمركّبُ بجانب المفرد حارسُ الكتابة عبر المنشآت (ق-١٢٥٢).
--
-- لا بياناتَ تُكتب: عمودٌ جديدٌ فارغٌ للقائم كلِّه — لا درجَ نُقل قبل اليوم.

-- AlterTable
ALTER TABLE "cash_drawers" ADD COLUMN     "transferredToId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cash_drawers_transferredToId_key" ON "cash_drawers"("transferredToId");

-- AddForeignKey
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_transferredToId_fkey" FOREIGN KEY ("transferredToId") REFERENCES "cash_drawers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_companyId_transferredToId_fkey" FOREIGN KEY ("companyId", "transferredToId") REFERENCES "cash_drawers"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
