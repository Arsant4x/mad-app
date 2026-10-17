import { roundTo, SCALE, type RoundingContext } from './rounding';

/**
 * توزيعُ مبلغٍ على دفعات، **ومجموعُ الناتج يساوي الأصل بالضبط**.
 *
 * ## العطل الذي وُلدت لإغلاقه
 *
 * `installment-schedule.util.ts` كان يقسّم بـ`Math.floor((value / count) * 100) / 100`.
 * فعقدٌ بقيمة `3.03` على ثلاثة أقساط: `3.03/3 = 1.0099999999999998` ⇒ `×100 =
 * 100.99999999999999` ⇒ `floor = 100` ⇒ **`1.00`**. فيصير الجدول `1.00 · 1.00 · 1.03`
 * بدل `1.01` ثلاثاً. **والملف كان يستورد `round2` ويستعمله في سطرين ويتجاوزه في
 * ذلك السطر** — فليس جهلاً بالمحرّك، بل شكلاً ثالثاً للتدوير لم يحرسه أحد.
 *
 * ## القاعدة (قرار المالك 2026-09-04، `ق-٣٦`)
 *
 * **المجموع يساوي الأصل بالضبط، والفرق يقع على قسطٍ واحد معلوم لا يتناثر.**
 * فمن يقرأ الجدول يعرف **أين** ذهبت الهللة، ولا يبحث عنها في كل سطر.
 *
 * والموضع الافتراضي هو **الأخير** — وهو ما كان يفعله النظام وما يتوقّعه
 * المستأجر: القسط الأخير يُسوّي. و`remainderOn: 'first'` لمن يحتاج تحميلها على
 * الدفعة الأولى (دفعةٌ مقدَّمة تبتلع الكسر).
 *
 * والقسمة تقع على **الهللات** لا على الريالات: عددٌ صحيح لا كسر ثنائيّ فيه،
 * فالمجموع يساوي الأصل **بنيةً لا بتصحيح**.
 */
export function allocateEvenly(
  total: number,
  count: number,
  options: { context?: RoundingContext; remainderOn?: 'first' | 'last' } = {},
): number[] {
  const context = options.context ?? 'LINE_AMOUNT';
  if (!Number.isFinite(total)) throw new RangeError('allocateEvenly: المبلغ غير منتهٍ');
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`allocateEvenly: عدد الدفعات ${count} ليس عدداً صحيحاً موجباً`);

  // الوحدة الصغرى للسياق (هللةٌ للمبالغ). القسمة عليها عددٌ صحيح، فلا يبقى
  // كسرٌ ثنائيّ يتراكم عبر الدفعات.
  const rounded = roundTo(total, context);
  const places = SCALE[context];
  // الإزاحة نصّية لا ضرباً — فالضرب هو ما جعل `3.03/3` يصير `1.00` أصلاً.
  const units = Math.round(Number(`${rounded}e${places}`));
  const unit = Number(`1e-${places}`);

  const base = Math.trunc(units / count);
  const remainder = units - base * count; // إشارتها من إشارة المبلغ، فالسالب يوزَّع كالموجب

  const parts = new Array<number>(count).fill(roundTo(base * unit, context));
  if (remainder !== 0) {
    const at = options.remainderOn === 'first' ? 0 : count - 1;
    parts[at] = roundTo((base + remainder) * unit, context);
  }
  return parts;
}

/**
 * Splits `total` in proportion to `weights`, and the parts add up to `total` exactly.
 *
 * Like `allocateEvenly` the split is done in halalas: every part is its truncated share and the remainder lands
 * on one known part, the last unless `remainderOn: 'first'`. Equal weights therefore give exactly the parts of
 * `allocateEvenly`.
 */
export function allocateByWeights(
  total: number,
  weights: readonly number[],
  options: { context?: RoundingContext; remainderOn?: 'first' | 'last' } = {},
): number[] {
  const context = options.context ?? 'LINE_AMOUNT';
  if (!Number.isFinite(total)) throw new RangeError('allocateByWeights: the total is not finite');
  if (weights.length < 1) throw new RangeError('allocateByWeights: no weights');
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError(`allocateByWeights: weights ${weights.join(', ')} are not all finite and non negative`);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (!(weightSum > 0)) throw new RangeError('allocateByWeights: the weights add up to zero');

  const rounded = roundTo(total, context);
  const places = SCALE[context];
  const units = Math.round(Number(`${rounded}e${places}`));
  const unit = Number(`1e-${places}`);

  const at = options.remainderOn === 'first' ? 0 : weights.length - 1;
  const shares = weights.map((w, i) => (i === at ? 0 : Math.trunc((units * w) / weightSum)));
  shares[at] = units - shares.reduce((sum, s) => sum + s, 0);
  return shares.map((s) => roundTo(s * unit, context));
}

/**
 * جمعُ مبالغ **مدوَّراً عند كل تراكم** — لا جمعاً عائماً ثم تدويراً في النهاية.
 *
 * وهو ما تفعله `computeDocumentTotals` أصلاً؛ وهذه تُخرجه لمن يجمع خارج
 * المستند، فقد كان كل ملفٍ يكتب `reduce((s, x) => s + x, 0)` خاماً.
 */
export function sumMoney(values: readonly number[], context: RoundingContext = 'LINE_AMOUNT'): number {
  return values.reduce<number>((sum, v) => roundTo(sum + v, context), 0);
}

/**
 * التسامح المقبول عند مقارنة مبلغَين — **هللةٌ واحدة**.
 *
 * كان كل ملفٍ يخترع عتبته (`Math.abs(a - b) > 0.01` مكتوبةً بيدٍ في موضعٍ أو
 * موضعين)، فلا مرجع يُراجَع حين تتغيّر سياسة الدقة.
 */
export const MONEY_EPSILON = 0.01;

/**
 * هل يتساوى مبلغان ضمن التسامح المقرّر؟
 *
 * ⚠️ والفرق **يُدوَّر قبل المقارنة**: `Math.abs(100 - 100.01)` يساوي
 * `0.010000000000005116` لا `0.01`، فمقارنةٌ خام تردّ `false` على فرقٍ هو هللةٌ
 * واحدة بالضبط. وهذا ما وقعت فيه أول صياغةٍ لهذه الدالّة نفسها — والعتبةُ
 * المكتوبة بيدٍ في كل ملف كانت تحمل العيب نفسه بلا أن يقيسه أحد.
 */
export function moneyEquals(a: number, b: number, epsilon: number = MONEY_EPSILON): boolean {
  return roundTo(Math.abs(a - b), 'LINE_AMOUNT') <= epsilon;
}
