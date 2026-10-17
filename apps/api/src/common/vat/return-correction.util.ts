import { round2 } from '../money/rounding';
import { money } from '../money/text';
import { type ResolvedVatPeriod, type VatPeriodType } from './vat-period.util';

/**
 * Correcting an earlier VAT return through a later one (Implementing Regulation, Article 63).
 *
 * - An understatement must be notified to ZATCA within 20 days by correcting the original
 *   return, unless it is below the limit, in which case it is corrected in the return of the
 *   period of discovery (Corrections section).
 * - An overstatement may be corrected in any later return, but not after five years from the
 *   end of the calendar year of the corrected period.
 *
 * The limit is 15,000 SAR as amended by Board resolution 01-06-24: ZATCA Guideline for
 * Amendments to the VAT Implementing Regulation (April 2025) example 25, and ZATCA Guideline
 * for Tax Invoicing and Records (May 2026) section 10.4. The older English edition (2021)
 * still reads 5,000.
 */

/** Below this understatement the correction goes into a later return instead of a notice. */
export const CORRECTION_UNDERSTATEMENT_LIMIT = 15000;

/** Years after the end of the calendar year of the period that an overstatement stays correctable. */
export const CORRECTION_OVERSTATEMENT_YEARS = 5;

/**
 * Note shown when a return changed after it was filed. The figure comes from the same constant
 * judgeCorrection uses, and the direction from the difference: positive is an understatement
 * of the tax due against what was filed, negative an overstatement.
 */
export function filedChangeNote(filedNet: number, currentNet: number): string {
  const diff = round2(currentNet - filedNet);
  const head = `تغيّر هذا الإقرارُ بعد تقديمه (قُدِّم بصافي ${money(filedNet)} وصافيه اليوم ${money(currentNet)})`;
  const limit = CORRECTION_UNDERSTATEMENT_LIMIT.toLocaleString('en-US');
  if (diff > 0) {
    const rule = `: نقصٌ في الضريبة المستحقّة بـ${money(diff)} — والأصلُ إشعارُ الهيئة خلال عشرين يوماً من العلم (م٦٣/١)`;
    return diff < CORRECTION_UNDERSTATEMENT_LIMIT
      ? `${head}${rule}، إلا ما دون ${limit} ريال فيجوز استدراكُه في الإقرار التالي (م٦٣/٣) — وهذا منه`
      : `${head}${rule} — ولا يُستدرك في الإقرار التالي لأنه يبلغ ${limit} ريال فأكثر (م٦٣/٣)`;
  }
  return `${head}: زيادةٌ في الضريبة المستحقّة بـ${money(-diff)} — يجوز تصحيحُها في أيّ إقرارٍ لاحق (م٦٣/٢) ما لم تمضِ ${CORRECTION_OVERSTATEMENT_YEARS} سنواتٍ من نهاية السنة التقويمية (م٦٣/٤)`;
}

export interface CorrectionTarget {
  year: number;
  periodType: VatPeriodType;
  periodNo: number;
}

export type CorrectionVerdict = { ok: true } | { ok: false; code: 'NOT_EARLIER' | 'UNDERSTATEMENT_NEEDS_NOTICE' | 'OVERSTATEMENT_TIME_BARRED' };

/** ترتيبُ فترتين من النوع نفسِه أو من نوعين — بأوّل يومٍ فيهما، فيستوي الشهرُ والربع. */
function startsBefore(a: CorrectionTarget, b: CorrectionTarget): boolean {
  const monthOf = (t: CorrectionTarget) => (t.periodType === 'MONTHLY' ? t.periodNo : t.periodNo * 3 - 2);
  return a.year !== b.year ? a.year < b.year : monthOf(a) < monthOf(b);
}

/**
 * **الحكمُ على تصحيحٍ قبل قبوله.** `amount` موجبٌ لنقصٍ سابقٍ يُستدرك، وسالبٌ لزيادةٍ تُردّ.
 *
 * `asOf` هي اللحظةُ التي يُقاس بها سقوطُ الخمس سنوات — تُمرَّر ولا تُقرأ من الساعة هنا،
 * فالدالّةُ نقيّةٌ ويُختبَر بها حدُّ المدّة بلا انتظار.
 */
export function judgeCorrection(declaredIn: ResolvedVatPeriod, corrected: CorrectionTarget, amount: number, asOf: Date): CorrectionVerdict {
  if (!startsBefore(corrected, declaredIn)) return { ok: false, code: 'NOT_EARLIER' };
  // ف٣: ما بلغ الحدَّ فأكثر يوجب إشعاراً خلال عشرين يوماً — ولا يُبتلع هنا.
  if (amount >= CORRECTION_UNDERSTATEMENT_LIMIT) return { ok: false, code: 'UNDERSTATEMENT_NEEDS_NOTICE' };
  // ف٤: الزيادةُ تسقط بعد خمس سنواتٍ **من نهاية السنة التقويمية** للفترة المصحَّحة.
  if (amount < 0) {
    const barredFrom = Date.UTC(corrected.year + CORRECTION_OVERSTATEMENT_YEARS + 1, 0, 1);
    if (asOf.getTime() >= barredFrom) return { ok: false, code: 'OVERSTATEMENT_TIME_BARRED' };
  }
  return { ok: true };
}
