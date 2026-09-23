import { hourBucket, mailQuotaCrossing, parseMailDailyLimit } from './mail-quota.util';

describe('⑬A1 — حدُّ البريد يُنذر قبل أن يُبلغ، مرّةً عند العبور (ق-١٣٣٣)', () => {
  it('① ثمانون بالمئة إنذار — عند العبور لا عند الإقامة فوقها', () => {
    expect(mailQuotaCrossing(159, 160, 200)).toBe('warn');
    expect(mailQuotaCrossing(160, 161, 200)).toBeNull();
    expect(mailQuotaCrossing(100, 101, 200)).toBeNull();
  });

  it('② البلوغُ خطأٌ مسمّى — عند العبور وحدَه', () => {
    expect(mailQuotaCrossing(199, 200, 200)).toBe('limit');
    expect(mailQuotaCrossing(200, 201, 200)).toBeNull();
    // قفزةٌ تعبر العتبتين معاً تُسمّى بالأشدّ — البلوغ.
    expect(mailQuotaCrossing(150, 205, 200)).toBe('limit');
  });

  it('③ عتبةُ الإنذار تُقرَّب إلى الأعلى — فحدٌّ صغيرٌ لا يُنذر قبل وقته', () => {
    // 80% من 10 = 8؛ ومن 7 = 5.6 ⟵ 6.
    expect(mailQuotaCrossing(7, 8, 10)).toBe('warn');
    expect(mailQuotaCrossing(4, 5, 7)).toBeNull();
    expect(mailQuotaCrossing(5, 6, 7)).toBe('warn');
  });

  it('④ بلا حدٍّ معلَن لا عتبة — العدّادُ يعدّ ولا يُنذر', () => {
    expect(mailQuotaCrossing(159, 160, null)).toBeNull();
    expect(mailQuotaCrossing(0, 1, 0)).toBeNull();
  });

  it('⑤ الدلوُ أوّلُ الساعة بتوقيتٍ عالميّ — لا بتوقيت العملية', () => {
    expect(hourBucket(new Date('2026-09-23T21:59:59.999Z')).toISOString()).toBe('2026-09-23T21:00:00.000Z');
    expect(hourBucket(new Date('2026-09-23T22:00:00.000Z')).toISOString()).toBe('2026-09-23T22:00:00.000Z');
  });

  it('⑥ الحدُّ المعلَن عددٌ صحيحٌ موجب أو لا حدّ — ولا تخمينَ لقيمةٍ لم تُقرأ', () => {
    expect(parseMailDailyLimit('200')).toBe(200);
    expect(parseMailDailyLimit(' 50000 ')).toBe(50000);
    for (const bad of [undefined, '', '0', '-5', '1e3', '200 رسالة', '2.5', '١٠٠', '99999999999999999999']) {
      expect(parseMailDailyLimit(bad)).toBeNull();
    }
  });
});
