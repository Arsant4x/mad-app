import { round2 } from '../common/money/rounding';
import { STANDARD_VAT_RATE } from '../common/vat/standard-rate';
import { dayNumber } from './rent-recognition.util';

/**
 * ⭐ **محرّكُ نقطة الضريبة للإيجار — واحدٌ للدفتر والإقرار** (`ق-٩١٧` · `ق-٩٢٤` · `ق-٩٢٧/٤`).
 *
 * ## القاعدة (اللائحةُ التنفيذية م٢٠)
 *
 * تاريخُ التوريد لكلِّ مبلغٍ هو **الأسبقُ من استحقاقه وسداده** (م٢٠/١)، **وبقدر
 * السداد** حين يسبق السدادُ الاستحقاقَ (م٢٠/٢ — حكمُ المالك `ق-٩٢٤` خلافاً لمقترَح
 * «وحدةُ التوريد القسط»): مستأجرٌ يدفع مئةً من خمسة آلافٍ قبل شهرٍ من الاستحقاق
 * **تُستحقّ المئةُ وضريبتُها بتاريخها، والباقي عند `dueDate`** — فالقسطُ الواحد قد
 * يحمل أكثرَ من نقطة، **وهو ما يوجبه النصّ فيُبنى**.
 *
 * ## ولماذا دالّةٌ نقيّة
 *
 * الدفترُ يستدعيها ليعرف **ما يجب أن يُستحقّ الآن** (ويُنقص منه ما استُحقّ قبلُ)،
 * والإقرارُ يستدعيها على **القديم** الذي سبق البناء (`LEGACY_COLLECTED`) ليحسبه في
 * ربعه بلا قيد (`ق-٩٢٦`) — **فالحسابُ واحدٌ في المصدرَين**، ومن غيّر القاعدةَ هنا
 * غيّرها للاثنين معاً، ولا تتباعد قاعدتان تفعلان الشيءَ نفسه (`ق-٤٦٩` بروحه).
 *
 * ## الشمول (م٤٥/٢)
 *
 * الشاملُ: الضريبةُ `المقابل × 15 ÷ 115` **والصافي أقلُّ من القسط**؛ وغيرُ الشامل:
 * الضريبةُ `15%` فوق القسط **وما يدين به المستأجرُ أكثرُ من القسط** — فالإجماليُّ
 * (ما يُقيَّد ذمّةً ويُقترَح في شاشة القبض) يتبع الشمول، لا القسطُ نفسُه.
 *
 * ⚠️ **حدٌّ معلَن**: العقدُ غيرُ المصنَّف أو غيرُ معلَنِ الشمول **لا معاملةَ له**
 * (`null`) — لا يُستحقّ ولا يدخل الإقرار، ويُعدّ باسمه (`ق-٩١٨`).
 */
// ⑧ النسبةُ من المصدر الواحد (`ق-١٢١٢`) — كانت `0.15` مكتوبةً هنا ثانيةً بجانب الكاشير وشاشتين.
export const RENT_VAT_RATE = STANDARD_VAT_RATE / 100;

export type RentClassification = 'RESIDENTIAL' | 'COMMERCIAL' | 'LEGACY_UNCLASSIFIED';
export type RentVatInclusion = 'INCLUSIVE' | 'EXCLUSIVE' | 'LEGACY_UNDECLARED';

export type RentLessor = 'COMPANY' | 'OWNER' | 'LEGACY_UNDECLARED';

export interface RentTaxTreatment {
  classification: 'RESIDENTIAL' | 'COMMERCIAL';
  /** ضريبةُ التجاريّ **مخرجاتُ المنشأة** — تجاريٌّ والمؤجّرُ المنشأة (`ق-٨٩٣` · السؤال ٥٧٧). */
  taxable: boolean;
  /**
   * **المستأجرُ يدفع ضريبةً على الإيجار** — تجاريٌّ أيّاً كان المؤجّر. يساوي `taxable` حين المؤجّرُ المنشأة،
   * ويفترق عنه حين المؤجّرُ المالك: الضريبةُ ضريبتُه تمرّ في أمانته ولا تدخل إقرارَ المنشأة.
   */
  chargesVat: boolean;
  /**
   * ⚖️ **المالكُ مؤجّر والمنشأةُ وكيلٌ معلَن** (السؤال ٥٧٧ · `ق-١٦٠٠`): الإيجارُ أمانةٌ للمالك لا إيراد، فلا
   * استحقاقَ في دفاتر المنشأة، ويُعدّ في إقرارها ولا يدخله، والعمولةُ إيرادُها بضريبتها.
   */
  managed: boolean;
  inclusive: boolean;
}

/**
 * معاملةُ العقد الضريبية — أو `null` لعقدٍ قديمٍ لم يُعلَن تصنيفُه أو شمولُه أو مؤجّرُه.
 *
 * ⚖️ **الفيصلُ المؤجّرُ على العقد لا ملكيةُ العقار** (السؤال ٥٧٧): كان عقارُ التشغيل يُعامَل كلُّه توريداً لمالكه، والهيئةُ
 * تقول «باسم من يُبرم العقد» — فالمشغّلُ الموقِّعُ مؤجّراً مورّدٌ كالمالك، والمالكُ الموقِّعُ مورّدٌ والمشغّلُ وكيلُه.
 */
export function rentTaxTreatment(
  classification: RentClassification,
  vatInclusion: RentVatInclusion,
  lessor: RentLessor,
): RentTaxTreatment | null {
  if (classification === 'LEGACY_UNCLASSIFIED' || vatInclusion === 'LEGACY_UNDECLARED' || lessor === 'LEGACY_UNDECLARED') return null;
  const owner = lessor === 'OWNER';
  const commercial = classification === 'COMMERCIAL';
  return {
    classification,
    taxable: commercial && !owner,
    chargesVat: commercial,
    managed: owner,
    inclusive: vatInclusion === 'INCLUSIVE',
  };
}

export interface GrossNetTax {
  gross: number;
  net: number;
  tax: number;
}

/**
 * **الإجماليُّ والصافي والضريبة من مبلغ القسط** (`amount` كما كُتب في العقد).
 *
 * غيرُ الشامل الخاضع: `gross = amount + 15%`؛ الشاملُ الخاضع: `gross = amount` والضريبةُ
 * منه؛ والمعفى: الثلاثةُ سواء — لا ضريبة. **والخضوعُ هنا ما يدفعه المستأجر** (`chargesVat`): تجاريٌّ مؤجّرُه المالك
 * يدفع المستأجرُ ضريبتَه كما يدفعها للمنشأة، وإن لم تكن ضريبتَها.
 */
export function rentAmountsOf(amount: number, t: RentTaxTreatment): GrossNetTax {
  const a = round2(amount);
  if (!t.chargesVat) return { gross: a, net: a, tax: 0 };
  if (t.inclusive) {
    const tax = round2((a * RENT_VAT_RATE) / (1 + RENT_VAT_RATE));
    return { gross: a, net: round2(a - tax), tax };
  }
  const tax = round2(a * RENT_VAT_RATE);
  return { gross: round2(a + tax), net: a, tax };
}

/**
 * **قسمةُ إجماليٍّ مقبوض إلى صافٍ وضريبة** — للدفعة المقدَّمة والخصم والدفعة بلا قسط:
 * المقبوضُ إجماليٌّ دائماً (المستأجرُ يدفع ما يدين به)، والضريبةُ منه `15/115` حين خاضع.
 */
export function splitGrossAmount(gross: number, t: RentTaxTreatment): GrossNetTax {
  const g = round2(gross);
  if (!t.chargesVat) return { gross: g, net: g, tax: 0 };
  const tax = round2((g * RENT_VAT_RATE) / (1 + RENT_VAT_RATE));
  return { gross: g, net: round2(g - tax), tax };
}

export interface OwnerCollectionSplit {
  /** ضريبةُ المالك في المقبوض (للتجاريّ) — تمرّ في أمانته. */
  ownerVat: number;
  /** العمولةُ على المقبوض بلا ضريبة المالك. */
  commission: number;
  /** ضريبتُها — مخرجاتُ المنشأة دائماً. */
  commissionTax: number;
  /** ما بقي للمالك: المقبوضُ كلُّه ناقصَ العمولة وضريبتها. */
  ownerShare: number;
}

/**
 * ⚖️ **قسمةُ ما يُقبض لمالكٍ مؤجّر** (السؤال ٥٧٧ · `ق-١٦٠٠`) — بعملة الدفتر، من المقبوض فعلاً (بعد الخصم).
 *
 * المقبوضُ إجماليٌّ دائماً: للتجاريّ فيه ضريبةُ المالك (`15/115`) وليست له مالاً يُحسب عليه أجر، **فالعمولةُ على الباقي**
 * (`نسبةُ العقار × المقبوض بلا ضريبة المالك`)، وضريبتُها ١٥٪ منها، وتُخصمان من حصّة المالك (الخدمةُ له فالضريبةُ عليه).
 * والسكنيُّ: لا ضريبةَ للمالك فالوعاءُ المقبوضُ كلُّه.
 *
 * ⚠️ **ووعاءُ العمولة تطبيقٌ معلَن** لا نصٌّ: الحقلُ على العقار «نسبة عمولة التشغيل» ولم يُكتب أساسُه في موضع؛ فأُخذ بما
 * لا يجعل الضريبةَ أجراً (يُعرض على صاحب المشروع، توجيه ٢٧٦).
 */
export function ownerCollectionSplit(baseCollected: number, t: RentTaxTreatment, ratePercent: number): OwnerCollectionSplit {
  const collected = round2(baseCollected);
  const { net, tax: ownerVat } = splitGrossAmount(collected, t);
  const commission = round2((net * ratePercent) / 100);
  const commissionTax = round2(commission * RENT_VAT_RATE);
  return { ownerVat, commission, commissionTax, ownerShare: round2(collected - commission - commissionTax) };
}

export type TaxPointKind = 'DUE' | 'PREPAYMENT';

export interface TaxPoint {
  date: Date;
  /** إجماليٌّ — بمقياس ما يدين به المستأجر. */
  gross: number;
  kind: TaxPointKind;
  /** الدفعةُ التي أنشأت نقطةً مقدَّمة. */
  paymentId?: string;
}

export interface TaxPointPayment {
  id?: string;
  date: Date;
  /** إجماليُّ الدفعة بمقياس القسط (قبل الخصم — فالخصمُ تعديلٌ لاحق). */
  gross: number;
}

/**
 * **نقاطُ الضريبة لقسطٍ حتى `asOf`** — بالقاعدة أعلاه.
 *
 * الدفعاتُ التي سبقت الاستحقاقَ (`date < dueDate`) نقاطٌ بتاريخها **بقدرها**، مقصورةً
 * على ما بقي من إجماليّ القسط؛ والباقي نقطةٌ واحدة عند `dueDate` **إن حلّ** (`≤ asOf`).
 * دفعةٌ في يوم الاستحقاق أو بعده ليست نقطةً — الاستحقاقُ سبقها.
 *
 * ⚠️ **وما فاض عن القسط ليس من هذه الدالّة**: زيادةُ الدفعة على القسط دفعةٌ بلا قسطٍ
 * بقدرها (`UNLINKED`) يقرّرها المستدعي — فهذه لا تُخرج نقطةً بإجماليٍّ يفوق القسط.
 */
export function taxPointsOfInstallment(input: {
  gross: number;
  dueDate: Date;
  payments: TaxPointPayment[];
  asOf: Date;
}): TaxPoint[] {
  const total = round2(input.gross);
  const points: TaxPoint[] = [];
  let remaining = total;
  const due = dayNumber(input.dueDate);
  const asOf = dayNumber(input.asOf);

  const early = [...input.payments]
    .filter((p) => dayNumber(p.date) < due && dayNumber(p.date) <= asOf && p.gross > 0)
    .sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
  for (const p of early) {
    if (remaining <= 0) break;
    const gross = round2(Math.min(remaining, p.gross));
    if (gross <= 0) continue;
    points.push({ date: p.date, gross, kind: 'PREPAYMENT', paymentId: p.id });
    remaining = round2(remaining - gross);
  }
  if (remaining > 0 && due <= asOf) {
    points.push({ date: input.dueDate, gross: remaining, kind: 'DUE' });
  }
  return points;
}

/**
 * **ما بقي ليُستحقّ** بعد استهلاك ما استُحقّ قبلُ (`alreadyAccruedGross`) من أوّل
 * النقاط زمناً — فالمستحقُّ سابقاً لا يُعاد، ودفعةٌ تُسجَّل لاحقاً بتاريخٍ أسبقَ من
 * استحقاقٍ رُحِّل تستهلكه ولا تُنشئ نقطةً ثانية (الحدُّ المعلَن `ق-٩٢٧/٨`).
 */
export function pendingTaxPoints(points: TaxPoint[], alreadyAccruedGross: number): TaxPoint[] {
  let consumed = round2(Math.max(0, alreadyAccruedGross));
  const out: TaxPoint[] = [];
  for (const p of points) {
    if (consumed >= p.gross) {
      consumed = round2(consumed - p.gross);
      continue;
    }
    const gross = round2(p.gross - consumed);
    consumed = 0;
    if (gross > 0) out.push({ ...p, gross });
  }
  return out;
}

/** ربعُ السنة الذي تقع فيه نقطةٌ — من يومِ `UTC` كـ`dayNumber` وبقيّة محرّك الاعتراف (`ق-١١٩٠`). */
export function quarterOf(d: Date): { year: number; quarter: number } {
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}
