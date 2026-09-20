import { execFileSync } from 'child_process';
import { dayEndOf, dayStartOf, issuedWallClock, KSA_UTC_OFFSET_MIN, localDateOf, localYearOf, qrTimestamp, wallClockOf } from './wall-clock.util';

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

/**
 * `ق-١١٩٠` — يومُ الآن بإزاحةٍ معلَنة لا بمنطقة العملية.
 *
 * **الحكمُ يُثبَت بلحظاتٍ مُمرَّرة لا بنافذةٍ زمنية** (كما `quote-expiry`): فاختبارٌ ينتظر
 * `21:00 UTC` ليرى العطلَ يشهد ثلاثَ ساعاتٍ في اليوم ويصمت باقيَه.
 */
describe('حدودُ اليوم المعلَن', () => {
  // 22:30 UTC في ١٩ سبتمبر = 01:30 من ٢٠ سبتمبر بتوقيت الرياض — النافذةُ التي كانت تُسقط الحزمة.
  const lateNight = new Date('2026-09-19T22:30:00.000Z');

  it('بدايةُ اليوم ونهايتُه على هيئة `@db.Date` — وبلا إزاحةٍ يومُ UTC حدّاً معلَناً', () => {
    expect(dayStartOf(lateNight).toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(dayEndOf(lateNight).toISOString()).toBe('2026-09-19T23:59:59.999Z');
    // ومع إزاحة المملكة: اليومُ التالي — فالإزاحةُ هي التي تقرّر اليومَ، لا منطقةُ العملية.
    expect(dayStartOf(lateNight, KSA_UTC_OFFSET_MIN).toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(dayEndOf(lateNight, KSA_UTC_OFFSET_MIN).toISOString()).toBe('2026-09-20T23:59:59.999Z');
    // والسنةُ تتبع اليومَ المعلَن: آخرُ ساعةٍ من السنة بـUTC هي أولُ ساعةٍ من التالية بالرياض.
    expect(localYearOf(new Date('2026-12-31T22:00:00.000Z'))).toBe(2026);
    expect(localYearOf(new Date('2026-12-31T22:00:00.000Z'), KSA_UTC_OFFSET_MIN)).toBe(2027);
  });

  it('حكمُ «متأخّرة» = يومُ الاستحقاق المخزَّن قبل يومِ الآن المعلَن — ثابتٌ أيّاً كانت منطقةُ العملية', () => {
    const dueDate = new Date('2026-09-19'); // عمود `@db.Date` كما يصل من Prisma: منتصفُ ليل UTC
    const overdueAt = (now: Date) => dueDate < dayStartOf(now);
    expect(overdueAt(lateNight)).toBe(false); // ما زال ١٩ سبتمبر بـUTC
    expect(overdueAt(new Date('2026-09-20T00:00:00.000Z'))).toBe(true); // أوّلُ لحظةٍ من العشرين

    // والصيغةُ القديمة `setHours(0, 0, 0, 0)` تُجيب بإجابتَين لثلاث مناطق — وهي العطل. **تُقاس في
    // عمليةٍ لكلّ منطقة**: فـ`process.env.TZ` داخل صندوق jest نسخةٌ لا تبلغ ساعةَ Node (قِيس:
    // ثلاثُ مناطقَ أعطت جوابَ المنطقة المحيطة الواحد — مسبارٌ يشهد للبيئة لا للدالّة، `ق-٢٦٢`).
    const legacyVerdictIn = (zone: string): boolean => {
      const script = [
        'const due = new Date(process.argv[1]); const now = new Date(process.argv[2]);',
        'const today = new Date(now); today.setHours(0, 0, 0, 0);',
        'process.stdout.write(due < today ? "1" : "0");',
      ].join(' ');
      const out = execFileSync(process.execPath, ['-e', script, dueDate.toISOString(), lateNight.toISOString()], { env: { ...process.env, TZ: zone } });
      return out.toString() === '1';
    };
    const verdicts = Object.fromEntries(['Asia/Riyadh', 'UTC', 'America/Los_Angeles'].map((z) => [z, legacyVerdictIn(z)]));
    // مصادقةُ المسبار: ثلاثُ مناطقَ لا تُجيب جواباً واحداً — وإلا شهد التساوي لبيئةٍ لا لدالّة. وغربَ
    // غرينتش أسوأ: منتصفُ ليلِ يومِ الاستحقاق محلّياً يقع **بعد** منتصفه بـUTC، فالفاتورةُ «متأخّرة»
    // من أوّل ساعةٍ في يوم استحقاقها.
    expect(verdicts).toEqual({ 'Asia/Riyadh': true, UTC: false, 'America/Los_Angeles': true });
  });
});
