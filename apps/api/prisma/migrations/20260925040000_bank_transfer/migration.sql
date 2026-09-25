-- ⚖️ نقلُ صفّ البنك بين الفروع — بنوعه المعلَن (ق-١٤٣١): الصندوقُ النقديّ إغلاقٌ وفتح (ق-١٤١٣)، والحسابُ البنكيّ للقادم (ق-١٤١٤)
--
-- الصندوقُ المنقول يُعدّ ويُغلق (يُؤرشف) في فرعه، ويُفتح خلفُه صندوقاً جديداً بحسابٍ جديد في الفرع الهدف — **وتاريخُه لا
-- ينتقل**. فالسلفُ يشير إلى خلفه (`transferredToId` — فريدٌ: لكلِّ صندوقٍ خلفٌ واحد على الأكثر)، كرابط الدرج (ق-١٤١٣).
-- والحسابُ البنكيّ لا خلفَ له: فرعُه يتغيّر للقادم وحدَه، والتسويةُ لا تتغيّر (ق-١٤٣٦).
--
-- `NO ACTION` لا `RESTRICT`: الفحصُ آخرَ العبارة، فحذفُ المنشأة يحذف الاثنين معاً. والمركّبُ بجانب المفرد حارسُ الكتابة
-- عبر المنشآت (ق-١٢٥٢).
--
-- لا بياناتَ تُكتب: عمودٌ جديدٌ فارغٌ للقائم كلِّه — لا صندوقَ نُقل قبل اليوم.

-- AlterTable
ALTER TABLE "banks" ADD COLUMN     "transferredToId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "banks_transferredToId_key" ON "banks"("transferredToId");

-- AddForeignKey
ALTER TABLE "banks" ADD CONSTRAINT "banks_transferredToId_fkey" FOREIGN KEY ("transferredToId") REFERENCES "banks"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banks" ADD CONSTRAINT "banks_companyId_transferredToId_fkey" FOREIGN KEY ("companyId", "transferredToId") REFERENCES "banks"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
