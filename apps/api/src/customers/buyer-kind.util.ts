import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * **صفةُ المشتري تُقرأ قبل أن يُصدَر له مستند** (ق-١٢٦١ أ — ②A1).
 *
 * الصفةُ تقرّر نوعَ الفاتورة (كاملة/مبسّطة — `invoiceTypeFor`)، **والمستندُ المختوم لا يُعدَّل** (`ق-٩٤٣`). فعميلٌ
 * سبق البناءَ ولم يُعلن صفتَه (`LEGACY_UNDECLARED`) **لا يُصدَر له مستندٌ جديد** حتى يُعلنها التاجرُ من بطاقته —
 * كما لا يُعدَّل عقدٌ قديم قبل إعلان تصنيفه (`ق-٨٩٢`). رفضٌ مسمّىً يقول الفعلَ الصحيح، لا افتراضٌ صامت يختم
 * مستنداً بنوعٍ قد يكون خاطئاً.
 *
 * **على مستوى المنشأة بحقّها**: عميلٌ واحد بمعرّفه — `findUnique` تحت سياق المستأجر.
 */
export async function assertBuyerKindDeclared(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<{ id: string; name: string; kind: string; vatNumber: string | null }> {
  const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, kind: true, vatNumber: true } });
  if (!customer) throw new NotFoundException(MSG.customer_not_found);
  if (customer.kind === 'LEGACY_UNDECLARED') {
    throw new BadRequestException(formatMessage(MSG.customer_kind_undeclared, { customer: customer.name }));
  }
  return customer;
}

