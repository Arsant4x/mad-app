import { CORRECTION_OVERSTATEMENT_YEARS, CORRECTION_UNDERSTATEMENT_LIMIT, judgeCorrection } from './return-correction.util';
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

  it('③ ⚠️ نقصٌ يبلغ خمسةَ آلافٍ لا يُبتلع هنا — يوجب إشعارَ الهيئة (م٦٣/١ مقابل ٣)', () => {
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 4999.99, NOW)).toEqual({ ok: true });
    // «less than five thousand» — فالحدُّ نفسُه خارجُ الرخصة.
    expect(judgeCorrection(q(2026, 3), target(2026, 2), CORRECTION_UNDERSTATEMENT_LIMIT, NOW)).toEqual({ ok: false, code: 'UNDERSTATEMENT_NEEDS_NOTICE' });
    expect(judgeCorrection(q(2026, 3), target(2026, 2), 9000, NOW)).toEqual({ ok: false, code: 'UNDERSTATEMENT_NEEDS_NOTICE' });
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
