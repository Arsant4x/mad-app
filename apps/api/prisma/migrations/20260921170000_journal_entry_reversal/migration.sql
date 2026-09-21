-- ⚖️ القيدُ المرحَّل يُعكس ولا يُحذف (ق-١٢٥٣/①): القيدُ العكسيّ يحمل معرّفَ أصله — واحدٌ لكلِّ أصل،
-- والأصلُ يبقى برقمه وسطوره. لا كتابةَ بيانات في هذه الهجرة (عمودٌ وفهرسٌ وقيدٌ فقط).
-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "reversalOfId" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversalOfId_key" ON "journal_entries"("reversalOfId");
-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
