import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * **التعطيلُ تحت الاختبار لا يصير نسياناً** (`ق-٢٩٢`، شرطُ المالك).
 *
 * `ScheduleModule` مُعطَّلٌ تحت الاختبار لأن مهمّةً تعمل كل دقيقة كانت تلتهم
 * عدّادَ ZATCA بين توكيدٍ وسابقه. **وثمنُ التعطيل**: لا اختبارَ يعبر تسجيلَ
 * المهام بعد اليوم — **فمن حذف التسجيل أو حذف `@Cron` لا يسقط له شيء**،
 * ونشحن مهمّةً لا تعمل في الإنتاج.
 *
 * فهذا الحارس يثبت ثلاثةً **من المصدر لا من قائمةِ أسماء**:
 *
 *   ① **التسجيل قائم** — `ScheduleModule.forRoot()` مذكورٌ في `app.module.ts`.
 *   ② **وبوّابتُه بيئةُ الاختبار وحدها** — لا تعطيلَ مطلق، ولا شرطٌ آخر يمنعه
 *      في الإنتاج.
 *   ③ **وكلُّ صفٍّ يحمل مهمّةً مجدولة مسجَّلٌ مزوّداً** في وحدةٍ ما — فمهمّةٌ
 *      بلا تسجيل لا تعمل ولو بقي `@Cron` مكتوباً فوقها.
 *
 * ⚠️ **وحدُّه معلَن**: يقرأ النصّ لا السلوك. من عطّل المهامَ بمتغيّر بيئةٍ في
 * الإنتاج لا يراه — يراه تشغيلٌ حقيقيّ.
 */
const SRC = join(__dirname, '..');
const APP_MODULE = join(SRC, 'app.module.ts');

/** يُفرِّغ التعليقات والنصوص — **فحارسٌ يقرأ نصّاً بلا هذا يُدين أمثلته** (`ق-٢٨١/ب`). */
export function blankNonCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, ' '));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !/\.spec\.ts$/.test(name)) out.push(p);
  }
  return out;
}

export interface ScheduledJob {
  file: string;
  /** اسمُ الصفّ الحاوي — وهو ما يجب أن يُسجَّل مزوّداً. */
  className: string;
}

/** كلُّ صفٍّ يحمل عضواً مزيَّناً بـ`@Cron`/`@Interval`/`@Timeout`. */
export function scheduledJobs(files: string[]): ScheduledJob[] {
  const out: ScheduledJob[] = [];
  for (const file of files) {
    const code = blankNonCode(readFileSync(file, 'utf8'));
    if (!/@(?:Cron|Interval|Timeout)\s*\(/.test(code)) continue;
    // الصفُّ الحاوي = آخرُ `class X` قبل الزخرفة.
    for (const m of code.matchAll(/@(?:Cron|Interval|Timeout)\s*\(/g)) {
      const before = code.slice(0, m.index);
      const cls = [...before.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].pop();
      if (cls) out.push({ file, className: cls[1] });
    }
  }
  return out;
}

/**
 * سطرُ تسجيل `ScheduleModule` **بنصّه الخام**.
 *
 * ⚠️ **يُبحَث عنه في الشيفرة المفرَّغة ويُقرأ من الخام**: التفريغُ يمسح ما بين
 * علامات النصّ، **فشرطُ `'test'` نفسُه يختفي منه** — وحارسٌ يقرأ المفرَّغ وحده
 * كان سيدين البوّابةَ الصحيحة. **والمفرَّغُ للعثور، والخامُ للحكم.**
 */
export function scheduleRegistration(appModule: string): string | null {
  const blanked = blankNonCode(appModule).split(/\r?\n/);
  const raw = appModule.split(/\r?\n/);
  const i = blanked.findIndex((l) => /ScheduleModule\.forRoot\s*\(/.test(l));
  return i < 0 ? null : raw[i];
}

describe('تسجيلُ المهام المجدولة باقٍ رغم تعطيلها تحت الاختبار (ق-٢٩٢)', () => {
  const appModule = readFileSync(APP_MODULE, 'utf8');

  it('🔴 ① التسجيل قائم، و② بوّابتُه بيئةُ الاختبار وحدها', () => {
    const line = scheduleRegistration(appModule);
    // مجسٌّ للمجسّ: غيابُ السطر يعني حذفَ التسجيل — لا نظافةَ الملفّ.
    if (!line) throw new Error('`ScheduleModule.forRoot()` غائبٌ عن `app.module.ts` — المهامُ لا تعمل في الإنتاج');

    expect(line).toMatch(/NODE_ENV/);
    expect(line).toMatch(/'test'|"test"/);
    // ولا شرطَ ثانٍ يمنعها في الإنتاج: البوّابةُ الوحيدة هي بيئةُ الاختبار.
    expect(line.match(/process\.env\.\w+/g) ?? []).toEqual(['process.env.NODE_ENV']);
  });

  it('🔴 ③ وكلُّ صفٍّ يحمل مهمّةً مجدولة مسجَّلٌ مزوّداً في وحدةٍ ما', () => {
    const files = walk(SRC);
    const jobs = scheduledJobs(files);
    // مجسٌّ للمجسّ: صفرُ مهامٍّ يعني أن القراءةَ أخفقت لا أن النظام بلا جدولة.
    expect(jobs.length).toBeGreaterThanOrEqual(3);

    const moduleSources = files.filter((f) => f.endsWith('.module.ts')).map((f) => blankNonCode(readFileSync(f, 'utf8')));
    const unregistered = [...new Set(jobs.map((j) => j.className))].filter(
      (cls) => !moduleSources.some((src) => new RegExp(`providers\\s*:\\s*\\[[^\\]]*\\b${cls}\\b`, 's').test(src)),
    );
    expect(unregistered).toEqual([]);
  });

  it('ولا يُخدع بذكرٍ في تعليقٍ أو نصّ — حالتان معلومتان', () => {
    const real = 'const x = [ScheduleModule.forRoot()];';
    const commented = '// ScheduleModule.forRoot() هنا سابقاً';
    expect(scheduleRegistration(real)).not.toBeNull();
    expect(scheduleRegistration(commented)).toBeNull();
  });
});
