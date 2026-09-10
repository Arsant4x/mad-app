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
const d = (iso: string) => new Date(iso + 'T00:00:00');
/**
 * ⚠️ **بالتقويم المحلّي لا `toISOString`**: المولّد يحسب بالتقويم المحلّي
 * (`setMonth`/`setDate`)، **و`toISOString` يحوّل إلى UTC فيُنقص يوماً كاملاً**
 * في كل منطقةٍ شرقَ غرينتش — **فيُدين المولّدَ الصحيح بأربع كسراتٍ كاذبة**.
 * (وقعت فعلاً في أول تشغيلٍ لهذه المجموعة.)
 */
const iso = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

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
