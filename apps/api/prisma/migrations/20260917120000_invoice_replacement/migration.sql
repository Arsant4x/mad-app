-- ⚖️ بدلٌ عن مردودة (ق-٩٥٨ · ق-٩٦٣ · ق-٩٦٥): عمودان على الفاتورة ولا كتابةَ بيانات.
--   replacesInvoiceId      — المردودةُ التي يحلّ هذا المستندُ محلَّها؛ فريدٌ (بدلٌ واحد) وRestrict (المردودةُ تبقى).
--                            رابطٌ مخصَّصٌ لا relatedInvoiceId: ذاك يُخرج BillingReference إلى الهيئة والبدلُ لا يحيل.
--   reversalJournalEntryId — قيدُ عكس المردودة عند الإغلاق (عكسٌ لا حذف).
-- و«مغلقة» مشتقّةٌ من وجود البدل — لا عمودَ حالة (ق-٩٦٤). ولا رجعيّةَ على المردودات القائمة (ق-٩٦٧).

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "replacesInvoiceId" TEXT,
ADD COLUMN     "reversalJournalEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_replacesInvoiceId_key" ON "invoices"("replacesInvoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replacesInvoiceId_fkey" FOREIGN KEY ("replacesInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
