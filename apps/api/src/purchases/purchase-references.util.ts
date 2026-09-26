import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MSG } from '../common/i18n/messages';

type Tx = Prisma.TransactionClient;

/**
 * `ق-١٤٦٥` (بقيّةُ الدعوى «أ») — **مراجعُ مستند الشراء تُقرأ داخل سياق المنشأة قبل الترقيم.**
 *
 * مورّدٌ أو صنفٌ أو مستودعٌ من منشأةٍ أخرى **غيرُ موجودٍ لها** (القراءةُ تحت `FORCE` في سياقها)، فيُردّ مسمّىً:
 * `404` للمورّد والمستودع (مرجعُ الرأس) و`400` للصنف (مرجعُ سطرٍ في الطلب) — كما تفعل الفاتورةُ وعرضُ السعر.
 * **وكان** يصل القاعدةَ فيسقط بمفتاحها المركّب `500` بلا رسالة، بعد أن قُرئ رقمُ المستند.
 *
 * والمفتاحُ المركّب يبقى الطبقةَ الثانية: **هذا الفحصُ يسمّي، والقاعدةُ تمنع** — فحذفُ الفحص يُعيد `500` ولا يُعيد تسرّباً.
 */
export async function assertPurchaseReferences(
  tx: Tx,
  refs: { supplierId?: string; productIds?: readonly (string | null | undefined)[]; warehouseId?: string | null },
): Promise<void> {
  if (refs.supplierId !== undefined) {
    const supplier = await tx.supplier.findUnique({ where: { id: refs.supplierId }, select: { id: true } });
    if (!supplier) throw new NotFoundException(MSG.supplier_not_found);
  }
  const ids = [...new Set((refs.productIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (ids.length > 0) {
    const found = await tx.product.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException(MSG.product_not_found);
  }
  if (refs.warehouseId) {
    const warehouse = await tx.warehouse.findUnique({ where: { id: refs.warehouseId }, select: { id: true } });
    if (!warehouse) throw new NotFoundException(MSG.warehouse_not_found);
  }
}
