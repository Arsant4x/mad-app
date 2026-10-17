import { CORRECTION_OVERSTATEMENT_YEARS, CORRECTION_UNDERSTATEMENT_LIMIT, filedChangeNote, judgeCorrection } from './return-correction.util';
import { resolveVatPeriod } from './vat-period.util';

const q = (year: number, quarter: number) => resolveVatPeriod({ year, quarter });
const target = (year: number, periodNo: number) => ({ year, periodType: 'QUARTERLY' as const, periodNo });
const NOW = new Date(Date.UTC(2026, 8, 23));

describe('⑥A3 — تصحيحُ إقرارٍ سابق (م٦٣)', () => {
  it('① المصحَّحُ يسبق الحامل — ولا يُصحَّح إقرارٌ بنفسه ولا بما بعده', () => {
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 100, NOW)).toEqual({ ok: true });
    expect(judgeCorrection(q(2026, 3), target(2026, 3), 100, NOW)).toEqual({ ok: false, code: 'NOT_EARLIER' });
    expect(judgeCorrection(q(2026, 3), target(2026, 4), 100, NOW)).toEqual({ ok: false, code: 'NOT_EARLIER' });
    expect(judgeCorrection(q(2026, 1), target(2025, 4), 100, NOW)).toEqual({ ok: true });
  });

  it('② الشهرُ والربعُ يُقارَنان بأوّل يومٍ فيهما — فيستويان في الترتيب', () => {
    // شهرُ 7 يبدأ مع الربع الثالث — فلا يسبقه.
    expect(judgeCorrection(resolveVatPeriod({ year: 2026, month: 7 }), target(2026, 3), 100, NOW)).toEqual({ ok: false, code: 'NOT_EARLIER' });
    // وشهرُ 7 يسبق الربعَ الرابع (يبدأ في أكتوبر).
    expect(judgeCorrection(q(2026, 4), { year: 2026, periodType: 'MONTHLY', periodNo: 7 }, 100, NOW)).toEqual({ ok: true });
  });

  it('③ an understatement below 15,000 SAR is corrected in the return, 15,000 and above needs a notice', () => {
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 4999.99, NOW)).toEqual({ ok: true });
    // ZATCA amendments guideline example 25: a 10,000 SAR understatement goes into the corrections section.
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 10000, NOW)).toEqual({ ok: true });
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 14999.99, NOW)).toEqual({ ok: true });
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 15000, NOW)).toEqual({ ok: false, code: 'UNDERSTATEMENT_NEEDS_NOTICE' });
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 20000, NOW)).toEqual({ ok: false, code: 'UNDERSTATEMENT_NEEDS_NOTICE' });
    expect(CORRECTION_UNDERSTATEMENT_LIMIT).toBe(15000);
  });

  it('④ الزيادةُ بلا حدٍّ مبلغيّ (م٦٣/٢) — ولو كانت ضخمة', () => {
    expect(judgeCorrection(q(2026, 3), target(2026, 2), -50000, NOW)).toEqual({ ok: true });
  });

  it('⑤ وتسقط بعد خمس سنواتٍ **من نهاية السنة التقويمية** لا من تاريخ الفترة (م٦٣/٤)', () => {
    expect(CORRECTION_OVERSTATEMENT_YEARS).toBe(5);
    // فترةُ 2021: تسقط من أوّل 2027 — ففي 2026 ما زالت مقبولة، وفي 2027 لا.
    expect(judgeCorrection(q(2026, 3), target(2021, 1), -100, NOW)).toEqual({ ok: true });
    expect(judgeCorrection(q(2027, 1), target(2021, 1), -100, new Date(Date.UTC(2027, 0, 1)))).toEqual({ ok: false, code: 'OVERSTATEMENT_TIME_BARRED' });
    // وآخرُ يومٍ من 2026 ما زال داخلَ المدّة — فالحدُّ نهايةُ السنة لا يومُ الفترة.
    expect(judgeCorrection(q(2026, 4), target(2021, 1), -100, new Date(Date.UTC(2026, 11, 31)))).toEqual({ ok: true });
    // ⚠️ والمدّةُ على الزيادة وحدَها — والنقصُ دونها لا تسقط مدّتُه هنا.
    expect(judgeCorrection(q(2027, 1), target(2021, 1), 100, new Date(Date.UTC(2027, 0, 1)))).toEqual({ ok: true });
  });
});

/** The after-filing note uses the limit judgeCorrection applies, and the direction of the difference. */
describe('⑥A3 — رسالةُ «تغيّر بعد التقديم» من الحدّ نفسِه وبالاتجاه (م٦٣)', () => {
  const limitText = CORRECTION_UNDERSTATEMENT_LIMIT.toLocaleString('en-US');

  it('① نقصٌ دون الحدّ ⟸ الأصلُ عشرون يوماً، وهذا ممّا يُستدرك في الإقرار التالي', () => {
    const note = filedChangeNote(1000, 1450);
    expect(note).toContain('نقصٌ في الضريبة المستحقّة بـ450.00');
    expect(note).toContain('عشرين يوماً');
    expect(note).toContain(`إلا ما دون ${limitText} ريال فيجوز استدراكُه في الإقرار التالي (م٦٣/٣) — وهذا منه`);
  });

  it('② an understatement of 15,000 SAR or more cannot be carried into the next return, below it can', () => {
    // At the limit exactly and above it: both need the notice.
    for (const current of [1000 + 15000, 1000 + 20000]) {
      const note = filedChangeNote(1000, current);
      expect(note).toContain('إشعارُ الهيئة خلال عشرين يوماً');
      expect(note).toContain('ولا يُستدرك في الإقرار التالي لأنه يبلغ 15,000 ريال فأكثر');
      expect(note).not.toContain('وهذا منه');
    }
    // Between the old 5,000 figure and 15,000 the amount is corrected in the next return.
    const between = filedChangeNote(1000, 1000 + 10000);
    expect(between).toContain('إلا ما دون 15,000 ريال فيجوز استدراكُه في الإقرار التالي (م٦٣/٣) — وهذا منه');
    for (const n of [filedChangeNote(1000, 1450), between, filedChangeNote(1000, 21000)]) expect(n).not.toContain(' 5,000 ');
  });

  it('③ زيادةٌ ⟸ تُصحَّح في أيّ إقرارٍ لاحق — ولا عشرين يوماً عليها', () => {
    const note = filedChangeNote(5000, 4200);
    expect(note).toContain('زيادةٌ في الضريبة المستحقّة بـ800.00');
    expect(note).toContain('في أيّ إقرارٍ لاحق (م٦٣/٢)');
    expect(note).toContain(`${CORRECTION_OVERSTATEMENT_YEARS} سنواتٍ`);
    expect(note).not.toContain('عشرين يوماً');
  });
});
