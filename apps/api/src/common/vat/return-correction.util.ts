import { round2 } from '../money/rounding';
import { money } from '../money/text';
import { type ResolvedVatPeriod, type VatPeriodType } from './vat-period.util';

/**
 * ⑥A3 (`ق-١٣٢٥`) — **تصحيحُ إقرارٍ سابق من خلال إقرارٍ لاحق** (اللائحةُ التنفيذية م٦٣).
 *
 * **النصُّ بفقراته** (`CORRECTION OF RETURNS`):
 *   ف١ · «which has resulted in the amount of Tax payable to the Authority being
 *        **understated**, that Person must **notify the Authority within twenty (20) days**
 *        … by filing a submission to correct the Tax Return **save to the extent the third
 *        Paragraph** of this Article applies».
 *   ف٢ · «being **overstated**, the Taxable Person **may correct that error by adjusting the
 *        Tax in any Tax Return filed subsequent** to the discovery of such error».
 *   ف٣ · «if the understatement of Net Tax … is **less than five thousand (5,000) SAR**, the
 *        Taxable Person may correct that error by adjusting the Net Tax **in its next Tax Return**».
 *   ف٤ · «No correction … relating to an **overstatement** … may be made **after a period of
 *        five (5) years** has passed from the end of the calendar year in which the Tax Period
 *        takes place».
 *
 * ⚠️ **والفرقُ بين الفقرتين ليس تفصيلاً**: نقصٌ يبلغ خمسةَ آلافٍ **لا يُبتلع في إقرارٍ تالٍ**
 * بل يوجب إشعارَ الهيئة خلال عشرين يوماً. فنظامٌ يقبله في خانة التصحيحات **يجعل التاجر
 * يظنّ أنه امتثل وهو لم يُشعر** — وهو أسوأُ من رفضٍ يقول له ما يفعل.
 */

/** حدُّ ما يجوز استدراكُه في الإقرار التالي بدل إشعار الهيئة (م٦٣/٣). */
export const CORRECTION_UNDERSTATEMENT_LIMIT = 5000;

/** مدّةُ سقوط تصحيح الزيادة — من **نهاية السنة التقويمية** لتلك الفترة (م٦٣/٤). */
export const CORRECTION_OVERSTATEMENT_YEARS = 5;

/**
 * **رسالةُ «تغيّر بعد التقديم» — من الحدّ نفسِه وبالاتجاه** (م٦٣).
 *
 * ⚠️ **العطلُ الذي أنشأها** (قِيس 2026-09-23): كانت نصّاً مكتوباً يقول للتاجر «نقصٌ **دون 15,000 ريال** يجوز إدراجُه
 * في الإقرار التالي» — **والنصُّ المقروء «less than five thousand (5,000) SAR»**، والحدُّ في الشيفرة `5000`
 * (`CORRECTION_UNDERSTATEMENT_LIMIT`)؛ وكانت توجب «التصحيحَ خلال عشرين يوماً» على كلِّ تغيّر، **والعشرون للنقص وحدَه**
 * (ف١) والزيادةُ تُصحَّح في أيّ إقرارٍ لاحق (ف٢). فتاجرٌ بنقصٍ بين الحدّين **يظنّ أنه أُعفي من الإشعار وهو ملزَم**.
 *
 * فالرقمُ يُقرأ من الثابت نفسِه الذي يحكم به `judgeCorrection`، **والاتجاهُ من الفرق**: الموجبُ نقصٌ في الضريبة
 * المستحقّة عمّا قُدِّم، والسالبُ زيادة.
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
