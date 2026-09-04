import { deadlineView, noteDeadline, NOTE_DEADLINE_DAYS } from './note-deadline.util';

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * المهلة النظامية — **خمسة عشر يوماً من نهاية شهر الواقعة**، لا من الواقعة نفسها.
 * والفرق ليس تفصيلاً: واقعةٌ في أول الشهر تُعطي مهلةً تقارب خمسة وأربعين يوماً،
 * وواقعةٌ في آخره خمسة عشر — **فحسابُها من الواقعة يقصّر المهلة على كل تاجر**.
 */
describe('مهلة إصدار الإشعار', () => {
  it('تُحسب من نهاية الشهر لا من الواقعة', () => {
    // الأول والأخير من الشهر نفسه ⇒ **المهلة واحدة**.
    expect(iso(noteDeadline(utc('2026-09-01')))).toBe('2026-10-15');
    expect(iso(noteDeadline(utc('2026-09-30')))).toBe('2026-10-15');
    expect(NOTE_DEADLINE_DAYS).toBe(15);
  });

  it('وتصيب الأشهر ذات الثمانية والعشرين والحادي والثلاثين', () => {
    expect(iso(noteDeadline(utc('2026-02-10')))).toBe('2026-03-15'); // ٢٨ يوماً
    expect(iso(noteDeadline(utc('2024-02-10')))).toBe('2024-03-15'); // كبيسة — ٢٩
    expect(iso(noteDeadline(utc('2026-01-31')))).toBe('2026-02-15');
    expect(iso(noteDeadline(utc('2026-12-05')))).toBe('2027-01-15'); // عبور السنة
  });

  it('والحالة تُشتقّ: متأخّر · يقترب · في الموعد', () => {
    const event = utc('2026-09-10'); // المهلة 2026-10-15
    expect(deadlineView(event, utc('2026-09-20')).status).toBe('OK');
    expect(deadlineView(event, utc('2026-10-11')).status).toBe('DUE_SOON');
    expect(deadlineView(event, utc('2026-10-15')).status).toBe('DUE_SOON');
    expect(deadlineView(event, utc('2026-10-16')).status).toBe('LATE');
  });

  it('واليوم الأخير ليس تأخّراً — الحدّ داخلٌ لا خارج', () => {
    const v = deadlineView(utc('2026-09-10'), utc('2026-10-15'));
    expect(v.daysLeft).toBe(0);
    expect(v.status).not.toBe('LATE');
  });

  it('والحساب بتوقيت UTC لا محلياً — فلا ينزاح الشهر بمنطقة الخادم', () => {
    // آخر لحظة من الشهر بتوقيت UTC: قراءةٌ محليّة شرق غرينتش تنقلها إلى الشهر
    // التالي فتعطي مهلةً أطول بشهر. وهو عطل `assertPeriodOpen` بعينه.
    const lastMoment = new Date('2026-09-30T23:30:00Z');
    expect(iso(noteDeadline(lastMoment))).toBe('2026-10-15');
  });
});
