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
 * ## ⑧ الوعاءُ بالمفتاح الثلاثي — فئةٌ · نسبةٌ · سبب (`ق-١٢١٢`)
 *
 * كان الوعاءُ لكل **نسبة** — فبندان بصفرٍ أحدُهما نسبةُ صفر (`Z`) والآخر معفى (`E`) كانا وعاءً
 * واحداً، والهيئةُ تطلب صفّاً في `cac:TaxSubtotal` **لكل فئةٍ وسبب** (`BR-KSA-23`…`26`). فصار
 * المفتاحُ الفئةَ كما تخرج للهيئة (`LEGACY_STANDARD` هو `S`) والنسبةَ ورمزَ السبب معاً. والدفترُ لا
 * يتغيّر: ضريبةُ الثلاث صفرٌ، والمجموعُ مجموعُ الأوعية كما كان. وبندٌ بلا فئةٍ (مُستدعٍ قديم يمرّر
 * النسبةَ وحدَها) يُصنَّف من نسبته: موجبةٌ ⟵ `S`، وصفرٌ ⟵ `Z` — **للحساب وحده**، فالمُصدَر لا يقبل
 * بنداً بلا فئةٍ معلَنة.
 *
 * ## الخصائص المضمونة (مُثبَتة في `totals.spec.ts`)
 *
 * - `subtotal + taxTotal === total` بالضبط — لا هللةٌ ضائعة بين ثلاثة أرقامٍ يذكرها المستند.
 * - `subtotal === Σ lineNet` و`taxTotal === Σ byRate.tax` بالضبط.
 * - **التناظر:** نفيُ البنود (إشعارٌ دائن كامل) يعطي نفيَ المجاميع بالضبط — فالمرتجع يُقفل
 *   ما فتحته الفاتورة بلا هللة.
 */

/** الفئةُ كما تخرج للهيئة على الوعاء — `LEGACY_ZERO` تبقى مميَّزةً للدفتر والإقرار ولا تُصدَر. */
export type BucketCategory = 'S' | 'Z' | 'E' | 'O' | 'LEGACY_ZERO';

export interface MoneyLine {
  quantity: number;
  unitPrice: number;
  /** نسبةٌ مئوية، مثل 15. */
  taxRate: number;
  /** ⑧ فئةُ الضريبة كما على السطر (`S` · `Z` · `E` · `O` · `LEGACY_STANDARD` · `LEGACY_ZERO`)؛ غيابُها يُصنَّف من النسبة للحساب وحده. */
  taxCategory?: string | null;
  /** ⑧ رمزُ سبب الإعفاء — جزءٌ من مفتاح الوعاء لغير `S`. */
  taxExemptionReasonCode?: string | null;
  /** ⑧ نصُّ سبب «خارج النطاق» — جزءٌ من المفتاح لـ`O` وحدَه: سببان مختلفان صفّان في التفصيل. */
  taxExemptionReason?: string | null;
}

export interface RateBucket {
  /** الفئةُ كما تخرج للهيئة: `LEGACY_STANDARD` يُرَدّ `S`. */
  category: BucketCategory;
  rate: number;
  /** رمزُ السبب لغير `S`؛ `null` لـ`S` ولـ`LEGACY_ZERO`. */
  reasonCode: string | null;
  /** نصُّ سبب `O` الحرّ؛ `null` لغيرها (نصُّ الرمز يُشتقّ من القائمة عند الإصدار). */
  reasonText: string | null;
  /** الوعاء: مجموع صوافي البنود بهذا المفتاح. */
  taxable: number;
  /** الوعاء × النسبة، مدوَّراً مرةً واحدة. */
  tax: number;
}

export interface DocumentTotals {
  subtotal: number;
  taxTotal: number;
  total: number;
  /** بترتيب أول ظهور المفتاح في البنود — وهو ترتيب `cac:TaxSubtotal` في المستند. */
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

/** فئةُ الوعاء لبندٍ — من فئته المعلَنة، أو من نسبته لمُستدعٍ لا يعلنها. */
export function bucketCategoryOf(line: Pick<MoneyLine, 'taxRate' | 'taxCategory'>): BucketCategory {
  switch (line.taxCategory) {
    case 'S':
    case 'LEGACY_STANDARD':
      return 'S';
    case 'Z':
    case 'E':
    case 'O':
    case 'LEGACY_ZERO':
      return line.taxCategory;
    default:
      return line.taxRate > 0 ? 'S' : 'Z';
  }
}

export function computeDocumentTotals(lines: readonly MoneyLine[]): DocumentTotals {
  let subtotal = 0;
  const buckets = new Map<string, { category: BucketCategory; rate: number; reasonCode: string | null; reasonText: string | null; taxable: number }>();
  for (const line of lines) {
    const net = lineNet(line);
    subtotal = roundTo(subtotal + net, 'INVOICE_TOTAL');
    const category = bucketCategoryOf(line);
    const reasonCode = category === 'S' || category === 'LEGACY_ZERO' ? null : (line.taxExemptionReasonCode ?? null);
    const reasonText = category === 'O' ? (line.taxExemptionReason ?? null) : null;
    const key = `${category}|${line.taxRate}|${reasonCode ?? ''}|${reasonText ?? ''}`;
    const bucket = buckets.get(key) ?? { category, rate: line.taxRate, reasonCode, reasonText, taxable: 0 };
    bucket.taxable = roundTo(bucket.taxable + net, 'INVOICE_TOTAL');
    buckets.set(key, bucket);
  }
  const byRate: RateBucket[] = [...buckets.values()].map((b) => ({
    ...b,
    tax: roundTo(b.taxable * (b.rate / 100), 'VAT_AMOUNT'),
  }));
  const taxTotal = byRate.reduce((sum, b) => roundTo(sum + b.tax, 'VAT_AMOUNT'), 0);
  return { subtotal, taxTotal, total: roundTo(subtotal + taxTotal, 'INVOICE_TOTAL'), byRate };
}
