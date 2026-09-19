import { round2 } from '../common/money/rounding';

/**
 * **قاعدةُ الاعتراف بإيراد الإيجار — واحدةٌ لا فرعان** (`ق-٤٦٨` · `ق-٤٧٤`).
 *
 * ## القاعدة
 *
 * **ما لم يُقدَّم بعدُ التزامٌ، وما قُدِّم إيراد.** تُطبَّق على **التواريخ** لا
 * على اسم الدورة — **فالشهريّ والربعيّ والسنويّ يمرّون بها جميعاً، والفرقُ في
 * مخرَجِها لا في مسارها**.
 *
 * ## ولماذا لا مسارَ ثانٍ للشهريّ
 *
 * كان الترجيحُ الأوّل أن الشهريَّ يُعترَف مباشرةً — **والقياس أسقطه**: القسطُ
 * يستحقّ في **أوّلِ** فترته، **و٢١٪ من الدفعات الشهرية قُبضت قبل بداية شهر
 * خدمتها** (٢٤ من ١١٤)، **و٣٧٨ قسطاً فترتُه تعبر حدَّ الشهر بالبناء**. ⇒ فمسارُ
 * «الشهريُّ مباشرةً» **ليس مساراً ثانياً فحسب — بل خاطئٌ في تلك الحالات**.
 *
 * ## والتقسيمُ باليوم والاعترافُ بالشهر
 *
 * **الكسرُ يُحسب بالأيام** — فهو الوحيدُ الذي يقسم فترةً تعبر حدَّ الشهر قسمةً
 * صحيحة (١٧ يوماً في مارس و١٤ في أبريل). **والقيدُ يُكتب عند نهاية كل شهر** —
 * فهو ما يقرؤه التاجر.
 *
 * ⭐ **والتراكمُ لا الفروق**: كلُّ خطوةٍ تحمل **المكتسَبَ الكلّي حتى تاريخها**
 * مدوَّراً، **والمرحَّلُ فرقُ ما بينها وبين ما سبق اعترافُه**. ⇒ **فلا ينحرف
 * التقريبُ عبر اثني عشر شهراً، ويُغلَق الالتزامُ عند الصفر بالضبط.**
 */
export interface ServicePeriod {
  start: Date;
  end: Date;
}

/**
 * رقمُ اليوم — **يومُ `UTC` للحظة**: فتواريخُ الخدمة أعمدةُ `@db.Date` تُقرأ `UTC` حصراً، و`asOf`
 * يومُه المعلَن بلا إزاحة (`ق-١١٩٠`). كان يُقرأ بدوالّ اليوم المحلّية — فيصدق شرقَ غرينتش ويزحزح
 * يوماً غربَه. **وبلا ساعاتٍ ولا توقيتٍ صيفيّ**.
 */
export function dayNumber(d: Date): number {
  return Math.floor(d.getTime() / 86400000);
}

/** أيامُ الفترة **شاملةً طرفيها** — فترةُ يومٍ واحدٍ يومٌ لا صفر. */
export function periodDays(p: ServicePeriod): number {
  return Math.max(1, dayNumber(p.end) - dayNumber(p.start) + 1);
}

/**
 * الكسرُ المكتسَب حتى `asOf` — **صفرٌ قبل أوّل يومٍ من الفترة، وواحدٌ من آخر
 * يومٍ فيها**. واليومُ الجاري محسوبٌ مكتسَباً: **من سكن يوماً استحقّ يومَه**.
 */
export function earnedFraction(p: ServicePeriod, asOf: Date): number {
  const elapsed = dayNumber(asOf) - dayNumber(p.start) + 1;
  if (elapsed <= 0) return 0;
  const total = periodDays(p);
  return elapsed >= total ? 1 : elapsed / total;
}

/**
 * آخرُ يومٍ في شهرِ `d` — على هيئة `@db.Date` (منتصفُ ليل `UTC`) كما يُخزَّن تاريخُ القيد (`ق-١١٩٠`).
 * كان يُبنى بـ`new Date(y, m + 1, 0)` محلّياً: فعلى خادمٍ شرقَ غرينتش تقع لحظتُه في اليوم السابق
 * بتوقيت `UTC` — وهو اليومُ الذي يُقرأ منه العمودُ المخزَّن.
 */
export function monthEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/**
 * **مواعيدُ الاعتراف**: نهايةُ كلِّ شهرٍ تمسّه الفترةُ حتى `asOf` — **وآخرُ يومٍ
 * في الفترة نفسِها ختاماً**.
 *
 * ⚠️ **وهي مواعيدُ استحقاقٍ لا نبضاتُ مُجدوِل** (`ق-٤٧٥/①`): **شهرٌ فات لأن
 * المهمّة تعطّلت يعود في القائمة نفسِها بتاريخه** — **فيُرحَّل إلى شهره لا إلى
 * شهرِ التعافي**. وهذا هو الفرقُ بين `dispatchDue` ونبضةٍ تُنسى.
 *
 * ⚠️ **ولا يُعترَف بشهرٍ لم يكتمل**: تشغيلٌ في منتصف مارس يعترف بيناير وفبراير
 * **ويترك مارس إلى آخره** — **فقيدان في شهرٍ واحدٍ يُقرآن تكراراً**، والقائمةُ
 * الشهرية تُقرأ عند إقفال الشهر لا في وسطه. **وختامُ الفترة نفسُه استثناءُ هذا**:
 * فترةٌ تنتهي في ١٤ أبريل تُقفَل في يومها لا في آخر أبريل — **وإلّا بقي التزامٌ
 * لخدمةٍ انتهت**.
 */
export function recognitionDates(p: ServicePeriod, asOf: Date): Date[] {
  if (dayNumber(asOf) < dayNumber(p.start)) return [];
  const out: Date[] = [];
  let cursor = monthEnd(p.start);
  const limit = Math.min(dayNumber(asOf), dayNumber(p.end));
  while (dayNumber(cursor) <= limit) {
    out.push(new Date(cursor));
    // آخرُ يومٍ في الشهر التالي — **يُبنى من أوّل الشهر التالي لا بالجمع على
    // اليوم**: فبراير المنتهي في ٢٨ يقفز بالجمع إلى مارس ويسقط شهرٌ كامل.
    cursor = monthEnd(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)));
  }
  // ختامُ الفترة نفسُه إن بلغه `asOf` ولم يكن آخرَ يومٍ في شهره.
  if (limit === dayNumber(p.end) && (out.length === 0 || dayNumber(out[out.length - 1]) < dayNumber(p.end))) {
    out.push(new Date(p.end));
  }
  return out;
}

/** `2026-03` — الشهرُ بصيغةٍ تُقرأ وتُفرَز؛ من يومِ `UTC` كبقيّة المحرّك (`ق-١١٩٠`). */
export function monthLabel(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** `2026-03-31`. */
function dayLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * **وصفُ الحصّة في مذكّرة القيد — وهو موضعُ إعلان الحدّ** (`ق-٤٨٠`).
 *
 * الحدُّ: **الاعترافُ شهريٌّ لا يوميّ**. تشغيلٌ في منتصف مارس يعترف بما اكتمل
 * **ويترك مارس إلى آخره** — **فقيدان في شهرٍ واحدٍ يُقرآن تكراراً**.
 *
 * ⭐ **وليس نقصاً بل شكلاً، ومن يقرأ الدفتر يحتاج أن يعرفه** (حكمُ المالك) —
 * **فيُعلَن في وصف القيد نفسِه لا في وثيقةٍ جانبية** (`ق-٤٤٩` مطبَّقةً على
 * الدفتر: **واجهةُ القيد هي مذكّرتُه**).
 *
 * ⇒ **فالوصفُ يقول «شهراً كاملاً»** — **فيعرف القارئُ أن غيابَ قيدٍ للشهر
 * الجاري ليس نقصاً بل انتظارَ اكتماله**. **وختامُ فترة الخدمة استثناءٌ يُسمّى
 * باسمه**: فترةٌ تنتهي في ١٤ أبريل تُقفَل في يومها لا في آخر الشهر.
 */
export function recognitionShareLabel(date: Date, periodEnd: Date): string {
  const closesPeriod = dayNumber(date) >= dayNumber(periodEnd);
  const wholeMonth = dayNumber(date) === dayNumber(monthEnd(date));
  if (wholeMonth && !closesPeriod) return `حصّة شهر ${monthLabel(date)} كاملاً`;
  if (wholeMonth) return `حصّة شهر ${monthLabel(date)} كاملاً — ختام فترة الخدمة`;
  return `حصّة ${monthLabel(date)} حتى ${dayLabel(date)} — ختام فترة الخدمة`;
}

export interface RecognitionStep {
  /** تاريخُ القيد — نهايةُ الشهر أو ختامُ الفترة. */
  date: Date;
  /** **المكتسَبُ الكلّي** حتى هذا التاريخ، مدوَّراً. */
  cumulative: number;
}

/**
 * جدولُ الاعتراف لمبلغٍ **مقبوضٍ** عن فترةٍ — **تراكمياً**.
 *
 * `collectedBase` هو المقبوضُ فعلاً بعملة الدفتر: **هذا المسارُ يعترف بما قُبض
 * لا بما استُحقّ** — فالإيجارُ يُرحَّل عند القبض (`1000/4200`) لا عند الاستحقاق،
 * **وما نغيّره توقيتُ الاعتراف لا أساسَه**.
 */
export function recognitionSchedule(p: ServicePeriod, collectedBase: number, asOf: Date): RecognitionStep[] {
  return recognitionDates(p, asOf).map((date) => ({
    date,
    cumulative: round2(collectedBase * earnedFraction(p, date)),
  }));
}

/**
 * **القسمةُ لحظةَ القبض**: ما مضى من الفترة إيرادٌ، وما بقي التزام.
 *
 * ⭐ **وأثرُها المحدود عمداً**: دفعةٌ عن فترةٍ انقضت كلُّها تعطي `deferred = 0`
 * — **فقيدُها هو قيدُ اليوم حرفياً**. **فالتغييرُ لا يمسّ إلا ما لم يُقدَّم بعد.**
 */
export function splitAtCollection(p: ServicePeriod, baseAmount: number, asOf: Date): { earned: number; deferred: number } {
  const earned = round2(baseAmount * earnedFraction(p, asOf));
  return { earned, deferred: round2(baseAmount - earned) };
}
