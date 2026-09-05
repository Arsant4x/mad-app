import { describe, expect, it } from 'vitest';
import { KSA_UTC_OFFSET_MIN, qrTimestamp, wallClockOf } from './wallClock';

/**
 * `ق-١٨٥`/`ق-١٨٨` — القيم نفسها التي يثبّتها اختبار الخادم
 * (`apps/api/src/common/wall-clock.util.spec.ts`)؛ فطرفا الساعة مربوطان بحقيقةٍ
 * واحدة لا بمصدرٍ واحد. كل حالةٍ ذاتُ وجهَين: اللحظة الواحدة يومان بانحرافَين.
 */
describe('ساعةُ الحائط عند الجهاز — نسخة المتصفّح', () => {
  const lateNight = new Date('2026-09-04T22:15:00.000Z'); // 01:15 من اليوم التالي بالرياض

  it('انحرافُ المملكة ⇒ محليٌّ بلا لاحقة، وغيرُه ⇒ UTC بلاحقة Z', () => {
    expect(wallClockOf(lateNight, KSA_UTC_OFFSET_MIN)).toEqual({ date: '2026-09-05', time: '01:15:00' });
    expect(wallClockOf(lateNight, 0)).toEqual({ date: '2026-09-04', time: '22:15:00Z' });
    expect(wallClockOf(lateNight, 240)).toEqual({ date: '2026-09-04', time: '22:15:00Z' });
  });

  it('طابعُ QR = IssueDate T IssueTime حرفاً', () => {
    expect(qrTimestamp({ date: '2026-09-05', time: '01:15:00' })).toBe('2026-09-05T01:15:00');
    expect(qrTimestamp({ date: '2026-09-04', time: '22:15:00Z' })).toBe('2026-09-04T22:15:00Z');
  });
});
