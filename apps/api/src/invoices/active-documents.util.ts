import { Prisma } from '@prisma/client';

/**
 * ⚖️ **مصدرُ الاستثناء الواحد** (`ق-٩٦٧/١`): المردودةُ التي **صدر بدلُها** تخرج من الإقرار
 * والتعرّض والمتبقّي — **والبدلُ يُعدّ** — فلا يُعدّ البيعُ مرّتين. **ومردودةٌ بلا بدلٍ تبقى
 * تُعدّ** (`ق-٩٦٧/٢`): الضريبةُ تُستحقّ رغم الردّ («taxpayers may have to include even the
 * rejected invoices in VAT returns» — الكتالوج).
 *
 * و«مغلقة» مشتقّةٌ لا مكتوبة (`ق-٩٦٤`): وجودُ البدل هو الإغلاق — لا حالةَ تُكتب فتكذب.
 *
 * ⚠️ **ولا نسخةَ في كلِّ تقرير**: من يقرأ المستنداتِ للذمم أو الإقرار أو المتبقّي يستورد هذا
 * الشرطَ ولا يعيد كتابته — فالتقاريرُ كانت عمياءَ عن الردّ بنيةً (`ق-٩٦٢`)، والعلاجُ مصدرٌ واحد.
 */
export const NOT_REPLACED_REJECTED: Prisma.InvoiceWhereInput = {
  OR: [{ zatcaStatus: { not: 'REJECTED' } }, { replacedBy: { is: null } }],
};

/** الشرطُ نفسُه على صفٍّ في الذاكرة — للمواضع التي تقرأ ثم تُرشِّح. */
export function isReplacedRejected(doc: { zatcaStatus: string; replacedBy: { id: string } | null }): boolean {
  return doc.zatcaStatus === 'REJECTED' && doc.replacedBy !== null;
}
