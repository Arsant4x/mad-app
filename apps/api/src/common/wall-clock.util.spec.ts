import { issuedWallClock, KSA_UTC_OFFSET_MIN, localDateOf, qrTimestamp, wallClockOf } from './wall-clock.util';

/**
 * `ق-١٨٥` — يومُ الجهاز ووقتُه من الجهاز، بصيغتَي الهيئة الوحيدتَين.
 *
 * كل حالةٍ هنا **ذاتُ وجهَين**: اللحظة نفسها تُعطي يوماً بانحرافٍ ويوماً آخر
 * بغيره — فاختبارٌ يمرّ بالحالتَين لا يمكن أن يمرّ بدالةٍ تتجاهل الانحراف.
 */
describe('ساعةُ الحائط عند الجهاز', () => {
  // 22:15 UTC = 01:15 من اليوم التالي بتوقيت الرياض — الحالة التي كانت تُؤرَّخ أمس.
  const lateNight = new Date('2026-09-04T22:15:00.000Z');

  it('يومُ الجهاز يتبع انحرافه: اللحظة الواحدة يومان مختلفان', () => {
    expect(localDateOf(lateNight, KSA_UTC_OFFSET_MIN)).toBe('2026-09-05');
    expect(localDateOf(lateNight, 0)).toBe('2026-09-04');
    // انحرافٌ سالب (غرب غرينتش) يعود بيومٍ أقدم لا أحدث — الاتجاه لا الحجم.
    expect(localDateOf(new Date('2026-09-05T02:00:00.000Z'), -300)).toBe('2026-09-04');
  });

  it('انحرافُ المملكة ⇒ محليٌّ بلا لاحقة؛ وغيرُه ⇒ UTC بلاحقة Z — لا زعمَ محليٍّ لا نعرفه', () => {
    expect(wallClockOf(lateNight, KSA_UTC_OFFSET_MIN)).toEqual({ date: '2026-09-05', time: '01:15:00' });
    expect(wallClockOf(lateNight, 0)).toEqual({ date: '2026-09-04', time: '22:15:00Z' });
    // جهازٌ على +04:00 (ليس المملكة): لا يُصدَر «محلياً» — الهيئة لا تعرف إلا المملكة أو UTC.
    expect(wallClockOf(lateNight, 240)).toEqual({ date: '2026-09-04', time: '22:15:00Z' });
  });

  it('مستندٌ بلا لحظةٍ معلومة يُصدَر بيومه المخزَّن و00:00:00 — الحدّ المعلَن لا تخمين', () => {
    const stored = new Date('2026-06-01T00:00:00.000Z'); // عمود @db.Date يُقرأ UTC حصراً
    expect(issuedWallClock({ issueDate: stored, issuedAt: null, issuedOffsetMin: null })).toEqual({ date: '2026-06-01', time: '00:00:00' });
    // لحظةٌ بلا انحراف = لا يومَ تاجرٍ معلوم ⇒ الحدّ نفسه، لا UTC متنكّراً محلياً.
    expect(issuedWallClock({ issueDate: stored, issuedAt: lateNight, issuedOffsetMin: null })).toEqual({ date: '2026-06-01', time: '00:00:00' });
    // ومع الانحراف: يومُ الجهاز ووقتُه — لا اليومُ المخزَّن.
    expect(issuedWallClock({ issueDate: stored, issuedAt: lateNight, issuedOffsetMin: KSA_UTC_OFFSET_MIN })).toEqual({ date: '2026-09-05', time: '01:15:00' });
  });

  it('طابعُ QR = IssueDate T IssueTime حرفاً — بلاحقة Z إن كانت في الوقت، وبلا لاحقة إن لم تكن', () => {
    expect(qrTimestamp({ date: '2026-09-05', time: '01:15:00' })).toBe('2026-09-05T01:15:00');
    expect(qrTimestamp({ date: '2026-09-04', time: '22:15:00Z' })).toBe('2026-09-04T22:15:00Z');
  });
});
