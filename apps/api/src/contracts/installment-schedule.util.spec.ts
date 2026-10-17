import { generateInstallmentSchedule, ScheduledInstallment } from './installment-schedule.util';

/**
 * **فترةُ الخدمة على القسط** (`ق-٤٧٤` · `ق-٤٧٥/②`).
 *
 * وهذه المجموعة تُثبت الشيءَ الذي بُني عليه الإيرادُ المؤجَّل كلُّه: **القسطُ
 * يستحقّ في أوّلِ فترته لا في آخرها**. ⇒ **فكلُّ قبضِ إيجارٍ قبضٌ عن خدمةٍ لم
 * تُقدَّم بعد** — ولا يلزم عقدٌ ربعيٌّ ولا سنويّ ليقع الخطأ.
 *
 * ⚠️ **والتغطيةُ تُثبَت بالتبليط لا بعدِّ الأقساط**: جدولٌ صحيحُ العدد وفيه
 * فجوةٌ يوم — **يُنتج شهراً لا مالكَ لإيراده**، ولا يراه عدٌّ.
 */
// Days are UTC midnights, as the service passes them (`new Date('YYYY-MM-DD')`) and as `@db.Date` stores them.
const d = (iso: string) => new Date(iso + 'T00:00:00Z');
const iso = (x: Date) => x.toISOString().slice(0, 10);

/** أيّامُ الفرق — للتحقّق من التلاصق بلا فجوةٍ ولا تداخل. */
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

function assertTiles(schedule: ScheduledInstallment[], start: Date, end: Date) {
  expect(iso(schedule[0].serviceStart)).toBe(iso(start));
  expect(iso(schedule[schedule.length - 1].serviceEnd)).toBe(iso(end));
  for (const s of schedule) {
    // لا فترةَ مقلوبة: النهايةُ لا تسبق البداية أبداً.
    expect(daysBetween(s.serviceStart, s.serviceEnd)).toBeGreaterThanOrEqual(0);
  }
  for (let i = 1; i < schedule.length; i++) {
    // تلاصقٌ تامّ: يومٌ واحدٌ بين نهايةِ السابق وبدايةِ اللاحق — لا فجوة ولا تداخل.
    expect(daysBetween(schedule[i - 1].serviceEnd, schedule[i].serviceStart)).toBe(1);
  }
}

describe('فترةُ الخدمة على القسط (ق-٤٧٤ · ق-٤٧٥)', () => {
  it('🔴 القسطُ يستحقّ في أوّلِ فترته — وهو المحدِّد كلُّه', () => {
    const start = d('2026-01-01');
    const schedule = generateInstallmentSchedule(start, d('2026-12-31'), 12000, 'monthly');

    expect(schedule).toHaveLength(12);
    for (const s of schedule) expect(iso(s.serviceStart)).toBe(iso(s.dueDate));
    // ⇒ فقبضُ القسط في يوم استحقاقه قبضٌ عن شهرٍ كاملٍ لم يُقدَّم منه يوم.
    expect(iso(schedule[0].dueDate)).toBe('2026-01-01');
    expect(iso(schedule[0].serviceEnd)).toBe('2026-01-31');
  });

  it('🔴 الفتراتُ تُبلِّط مدّةَ العقد كلَّها — بلا فجوةٍ ولا تداخل (شهريّ)', () => {
    const start = d('2026-01-01');
    const end = d('2026-12-31');
    assertTiles(generateInstallmentSchedule(start, end, 12000, 'monthly'), start, end);
  });

  it('🔴 وكذلك حين يبدأ العقدُ في غير أوّل الشهر — وهو ١٦٪ من العقود الحيّة', () => {
    const start = d('2026-03-15');
    const end = d('2027-03-14');
    const schedule = generateInstallmentSchedule(start, end, 12000, 'monthly');
    assertTiles(schedule, start, end);
    // فترةُ القسط الأولى تعبر حدَّ الشهر: نصفُها في مارس ونصفُها في أبريل.
    expect(iso(schedule[0].serviceStart)).toBe('2026-03-15');
    expect(iso(schedule[0].serviceEnd)).toBe('2026-04-14');
  });

  it('🔴 والقسطُ الربعيّ يغطّي ثلاثةَ أشهرٍ بطبيعته', () => {
    const start = d('2026-01-01');
    const end = d('2026-12-31');
    const schedule = generateInstallmentSchedule(start, end, 12000, 'quarterly');

    expect(schedule).toHaveLength(4);
    assertTiles(schedule, start, end);
    expect(iso(schedule[0].serviceEnd)).toBe('2026-03-31');
    expect(iso(schedule[1].serviceStart)).toBe('2026-04-01');
  });

  it('والأخيرُ يبتلع باقيَ المدّة كما يبتلع باقيَ المبلغ', () => {
    // خمسةٌ ونصف شهراً: العددُ يُقرَّب إلى ستّة، والخطوةُ السادسة تمتدّ خارج
    // العقد — فتُقصَر النهايةُ على نهاية العقد لا على الخطوة.
    const start = d('2026-01-01');
    const end = d('2026-06-15');
    const schedule = generateInstallmentSchedule(start, end, 6000, 'monthly');

    assertTiles(schedule, start, end);
    expect(iso(schedule[schedule.length - 1].serviceEnd)).toBe('2026-06-15');
  });

  it('مجسٌّ للمجسّ: التبليطُ يُدين فجوةً مصنوعة ويقبل الصحيح', () => {
    const start = d('2026-01-01');
    const end = d('2026-03-31');
    const good = generateInstallmentSchedule(start, end, 3000, 'monthly');
    expect(() => assertTiles(good, start, end)).not.toThrow();

    // فجوةُ يومٍ واحد في المنتصف — لا يراها عدُّ الأقساط، ويراها التبليط.
    const holed = good.map((s, i) => (i === 0 ? { ...s, serviceEnd: d('2026-01-30') } : s));
    expect(() => assertTiles(holed, start, end)).toThrow();
  });

  it('ولا فترةَ مقلوبة مهما فرَط التقريب — عقدُ يومٍ واحد', () => {
    const start = d('2026-01-01');
    const end = d('2026-01-01');
    const schedule = generateInstallmentSchedule(start, end, 100, 'monthly');

    expect(schedule).toHaveLength(1);
    expect(daysBetween(schedule[0].serviceStart, schedule[0].serviceEnd)).toBe(0);
  });
});

describe('installment amounts follow the period each installment covers', () => {
  const amounts = (schedule: ScheduledInstallment[]) => schedule.map((s) => s.amount);
  const dues = (schedule: ScheduledInstallment[]) => schedule.map((s) => iso(s.dueDate));
  const total = (schedule: ScheduledInstallment[]) => Math.round(schedule.reduce((sum, s) => sum + Math.round(s.amount * 100), 0)) / 100;

  it('an 18 month annual contract at 18,000 is 12,000 for the first year and 6,000 for the last six months', () => {
    const start = d('2026-01-01');
    const end = d('2027-06-30');
    const schedule = generateInstallmentSchedule(start, end, 18000, 'annual');

    expect(dues(schedule)).toEqual(['2026-01-01', '2027-01-01']);
    expect(amounts(schedule)).toEqual([12000, 6000]);
    expect(schedule.map((s) => iso(s.serviceEnd))).toEqual(['2026-12-31', '2027-06-30']);
    assertTiles(schedule, start, end);
  });

  it('a last installment longer than the cycle carries its whole months', () => {
    // 29 months annual keeps today's count of two; the second covers 17 months.
    const start = d('2026-01-01');
    const end = d('2028-05-31');
    const schedule = generateInstallmentSchedule(start, end, 29000, 'annual');

    expect(dues(schedule)).toEqual(['2026-01-01', '2027-01-01']);
    expect(amounts(schedule)).toEqual([12000, 17000]);
  });

  it('the last installment weighs its whole months plus the share of the month its extra days fall in', () => {
    // May 1 to June 15: one whole month and 15 of June's 30 days, so 1.5 against 1 for the others.
    const start = d('2026-01-01');
    const end = d('2026-06-15');
    const schedule = generateInstallmentSchedule(start, end, 5500, 'monthly');

    expect(dues(schedule)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']);
    expect(amounts(schedule)).toEqual([1000, 1000, 1000, 1000, 1500]);
    assertTiles(schedule, start, end);
  });

  it('the amounts always add up to the contract value, the remainder on the last installment', () => {
    const schedule = generateInstallmentSchedule(d('2026-01-01'), d('2026-07-20'), 6645.17, 'monthly');
    expect(total(schedule)).toBe(6645.17);
    const head = amounts(schedule).slice(0, -1);
    expect(new Set(head).size).toBe(1);
  });

  it('a single installment still takes the whole value', () => {
    // 17 months annual keeps today's count of one installment.
    const schedule = generateInstallmentSchedule(d('2026-01-01'), d('2027-05-31'), 17000, 'annual');
    expect(amounts(schedule)).toEqual([17000]);
  });

  it('a duration that is an exact multiple of the cycle keeps its even schedule', () => {
    const cases: { start: string; end: string; value: number; cycle: string; dues: string[]; amounts: number[] }[] = [
      {
        start: '2026-01-01',
        end: '2026-12-31',
        value: 12000.03,
        cycle: 'monthly',
        dues: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => `2026-${m}-01`),
        amounts: [...new Array(11).fill(1000), 1000.03],
      },
      { start: '2026-01-01', end: '2026-12-31', value: 10000, cycle: 'quarterly', dues: ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'], amounts: [2500, 2500, 2500, 2500] },
      { start: '2026-01-01', end: '2027-12-31', value: 1000.03, cycle: 'semiannual', dues: ['2026-01-01', '2026-07-01', '2027-01-01', '2027-07-01'], amounts: [250, 250, 250, 250.03] },
      { start: '2026-03-15', end: '2028-03-14', value: 24000.01, cycle: 'annual', dues: ['2026-03-15', '2027-03-15'], amounts: [12000, 12000.01] },
    ];
    for (const c of cases) {
      const schedule = generateInstallmentSchedule(d(c.start), d(c.end), c.value, c.cycle);
      expect({ cycle: c.cycle, dues: dues(schedule), amounts: amounts(schedule) }).toEqual({ cycle: c.cycle, dues: c.dues, amounts: c.amounts });
    }
  });
});

describe('installment dates of a contract that starts at a month end', () => {
  const dues = (schedule: ScheduledInstallment[]) => schedule.map((s) => iso(s.dueDate));

  it('a monthly contract starting on 31 January falls due on the last day of each shorter month', () => {
    const start = d('2026-01-31');
    const end = d('2026-07-30');
    const schedule = generateInstallmentSchedule(start, end, 6000, 'monthly');

    expect(dues(schedule)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
    expect(schedule.map((s) => iso(s.serviceEnd))).toEqual(['2026-02-27', '2026-03-30', '2026-04-29', '2026-05-30', '2026-06-29', '2026-07-30']);
    expect(schedule.map((s) => s.amount)).toEqual([1000, 1000, 1000, 1000, 1000, 1000]);
    assertTiles(schedule, start, end);
  });

  it('and in a leap year February ends on the 29th', () => {
    const start = d('2028-01-31');
    const end = d('2028-07-30');
    const schedule = generateInstallmentSchedule(start, end, 6000, 'monthly');

    expect(dues(schedule)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30', '2028-05-31', '2028-06-30']);
    assertTiles(schedule, start, end);
  });

  it('a quarterly contract starting on 31 August keeps the month end of each quarter', () => {
    const start = d('2026-08-31');
    const end = d('2027-08-30');
    const schedule = generateInstallmentSchedule(start, end, 4000, 'quarterly');

    expect(dues(schedule)).toEqual(['2026-08-31', '2026-11-30', '2027-02-28', '2027-05-31']);
    expect(schedule.map((s) => s.amount)).toEqual([1000, 1000, 1000, 1000]);
    assertTiles(schedule, start, end);
  });
});
