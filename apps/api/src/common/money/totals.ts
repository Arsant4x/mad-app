import { roundTo } from './rounding';

/**
 * مجاميع المستند — **دالةٌ واحدة للدفتر وللمستند المختوم** (كنسة التدوير، قرار المالك 2026-09-03).
 *
 * ## لماذا هنا لا في `invoices.service.ts`
 *
 * كان الدفتر يجمع البنود **غير مدوَّرة** ثم يدوّر المجموع مرةً، بينما `invoice-xml.util.ts`
 * يدوّر **كل بندٍ** ثم يجمع. فثلاثة بنودٍ بـ`0.335` تعطي في الدفتر `1.01` وفي المستند
 * `1.02` — **بنفس سياسة التدوير**. الطريقة كانت مختلفة لا الدالة. وهيئة الزكاة تتحقّق من
 * المستند بقاعدة البند: صافي كل بندٍ مبلغٌ مدوَّر، والوعاء لكل نسبةٍ مجموعُ صوافي بنودها،
 * وضريبةُ النسبة = الوعاء × النسبة مدوَّرةً (لا مجموعَ ضرائب البنود). فهذه هي الطريقة
 * الوحيدة هنا، ويستعملها الدفتر والمستند والعرض ونقطة البيع معاً.
 *
 * ## الخصائص المضمونة (مُثبَتة في `totals.spec.ts`)
 *
 * - `subtotal + taxTotal === total` بالضبط — لا هللةٌ ضائعة بين ثلاثة أرقامٍ يذكرها المستند.
 * - `subtotal === Σ lineNet` و`taxTotal === Σ byRate.tax` بالضبط.
 * - **التناظر:** نفيُ البنود (إشعارٌ دائن كامل) يعطي نفيَ المجاميع بالضبط — فالمرتجع يُقفل
 *   ما فتحته الفاتورة بلا هللة.
 */

export interface MoneyLine {
  quantity: number;
  unitPrice: number;
  /** نسبةٌ مئوية، مثل 15. */
  taxRate: number;
}

export interface RateBucket {
  rate: number;
  /** الوعاء: مجموع صوافي البنود بهذه النسبة. */
  taxable: number;
  /** الوعاء × النسبة، مدوَّراً مرةً واحدة. */
  tax: number;
}

export interface DocumentTotals {
  subtotal: number;
  taxTotal: number;
  total: number;
  /** بترتيب أول ظهور النسبة في البنود — وهو ترتيب `cac:TaxSubtotal` في المستند. */
  byRate: RateBucket[];
}

/** صافي البند: الكمية × السعر، مدوَّراً إلى مبلغ سطر. */
export function lineNet(line: MoneyLine): number {
  return roundTo(line.quantity * line.unitPrice, 'LINE_AMOUNT');
}

/** ضريبة البند للعرض على السطر — الهيئة تتحقّق من ضريبة **النسبة** لا البند، فلا تُجمَع هذه. */
export function lineTax(line: MoneyLine): number {
  return roundTo(lineNet(line) * (line.taxRate / 100), 'VAT_AMOUNT');
}

export function computeDocumentTotals(lines: readonly MoneyLine[]): DocumentTotals {
  let subtotal = 0;
  const taxableByRate = new Map<number, number>();
  for (const line of lines) {
    const net = lineNet(line);
    subtotal = roundTo(subtotal + net, 'INVOICE_TOTAL');
    taxableByRate.set(line.taxRate, roundTo((taxableByRate.get(line.taxRate) ?? 0) + net, 'INVOICE_TOTAL'));
  }
  const byRate: RateBucket[] = [...taxableByRate].map(([rate, taxable]) => ({
    rate,
    taxable,
    tax: roundTo(taxable * (rate / 100), 'VAT_AMOUNT'),
  }));
  const taxTotal = byRate.reduce((sum, b) => roundTo(sum + b.tax, 'VAT_AMOUNT'), 0);
  return { subtotal, taxTotal, total: roundTo(subtotal + taxTotal, 'INVOICE_TOTAL'), byRate };
}
