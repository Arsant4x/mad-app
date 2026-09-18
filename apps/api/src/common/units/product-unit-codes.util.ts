import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * ① وحدةُ الكمّية على سطر المستند **تُنسخ من الصنف لحظةَ الكتابة** — لا تُقرأ من الصنف عند
 * الإرسال إلى الهيئة ولا عند العرض، فالمستندُ يذكر وحدتَه ولو تغيّر الصنف بعده.
 *
 * تعيد خريطةَ `productId → unitCode` لأصناف الأسطر المعطاة (داخل معاملة المستأجر فتراها RLS)؛
 * وصنفٌ لم يُعلن وحدتَه بعد يُعيد `null` — فيُكتب السطرُ بلا وحدة **ولا يُخمَّن له رمز**.
 */
export async function unitCodesFor(tx: Tx, lines: readonly { productId?: string | null }[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return new Map();
  const products = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, unitCode: true } });
  return new Map(products.map((p) => [p.id, p.unitCode ?? null]));
}

/** الوحدةُ لسطرٍ واحد من الخريطة — `null` لسطرٍ بلا صنف أو لصنفٍ لم يُعلن. */
export function unitCodeOf(codes: ReadonlyMap<string, string | null>, productId: string | null | undefined): string | null {
  return productId ? (codes.get(productId) ?? null) : null;
}
