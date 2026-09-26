import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): البوّاباتُ تُثبَت **بعلاماتٍ حرفيّة**
// في ملفّ الخطّاف (`TREE_MUTATION.test(cmd)` وأخواتها) — وهي سلاسلُ نصّية،
// **فتجريدُ النصوص يمحو العلاماتِ فيعود الحارسُ بلا بوّابةٍ واحدة**.
readsDeclaredStrings();

/**
 * حارسٌ على **البوّابات نفسها** — تطبيقاً لـ§8.11.
 *
 * البوّابات الثلاث في `.claude/hooks/` كانت **غير متتبَّعة**، فتحمي جهازاً واحداً.
 * وتتبّعها يوصلها الفريق — **ولا يمنع حذفها ولا تعطيلها**. فقاعدة «كل قاعدة
 * تُنفَّذ بوّابةً» تسري على هذا الملف نفسه: **ما الذي يمنع إزالة الخطّاف؟**
 *
 * هذا الاختبار. يسقط إن اختفى الخطّاف، أو انقطع ربطه في `settings.json`، أو
 * سقطت إحدى البوّابات الثلاث من داخله.
 *
 * ⚠️ **وحدّه معلَن، ويجب أن يُقرأ:** يحرس **وجود** البوّابات لا **صحّتها**.
 * فحصُ سلوكها يقع في الإثبات العكسي عند كل تعديل (§8.8) — وهذا يمنع الاختفاء
 * لا الانحراف. وهو تمييز §8.5: «مكتوبة» ليست «تعمل».
 */
describe('البوّابات التشغيلية موجودة ومربوطة (§8.11)', () => {
  const repoRoot = join(__dirname, '..', '..', '..', '..');
  const hookPath = join(repoRoot, '.claude', 'hooks', 'block-shell-text-writes.mjs');
  const settingsPath = join(repoRoot, '.claude', 'settings.json');

  it('ملف الخطّاف موجود', () => {
    expect(existsSync(hookPath)).toBe(true);
  });

  it('مربوطٌ في settings.json على PreToolUse لأداة Bash', () => {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const pre = settings?.hooks?.PreToolUse ?? [];
    const bash = pre.filter((e: { matcher?: string }) => e.matcher === 'Bash');
    expect(bash.length).toBeGreaterThan(0);
    const commands = bash.flatMap((e: { hooks?: { command?: string }[] }) =>
      (e.hooks ?? []).map((h) => h.command ?? ''),
    );
    expect(commands.some((c: string) => c.includes('block-shell-text-writes.mjs'))).toBe(true);
  });

  /**
   * البوّابات الثلاث بعلاماتها. **تُقرأ من الملف لا تُوصف** — والعلامة هي
   * الشرط الحاكم في كل بوّابة، لا تعليقٌ يشرحها. فحذف الشرط يُسقط الاختبار
   * ولو بقي التعليق.
   */
  const GATES: ReadonlyArray<readonly [string, string]> = [
    ['كتابة النصّ بالصدفة', 'INLINE_SCRIPT.test(cmd) && WRITES_FILE.test(cmd)'],
    ['python كعبُ المتجر', 'WindowsApps'],
    ['القاعدة التاسعة — هدفٌ مثبَّت', 'DESTRUCTIVE.test(cmd)'],
    ['الاقتباس العكسي في الوسائط', 'stripSafeSpans(cmd)'],
    // (ق-٢٥٤) طلبٌ يمسّ شيفرةً بلا فحصٍ ثقيلٍ في تاريخه — الثقبُ الذي فتحه
    // تقسيمُ السير بالمسار: الفتحُ مضى و`synchronize` لا تُشغّل الثقيل.
    ['الفحصُ الثقيل في تاريخ الطلب', 'const codeFiles = prFiles.filter(touches)'],
    // (ق-١٤٧٢) ويُشدَّد: كلُّ وظيفةٍ ثقيلة ناجحةٌ **على الرأس نفسِه** بتجزئته كاملة — لا أيُّ فحصٍ في أيّ تاريخ.
    ['الثقيلُ ناجحٌ على الرأس نفسِه', 'r.head_sha === head'],
    // (ق-٢٦٠) `UNKNOWN` تُنتظَر ثلاثاً ثم تُرفض — لا تُقبل فوراً (دمجٌ قبل أن
    // يُعرف شيء) ولا تُرفض فوراً (توقيفُ دمجٍ صالح بعد كل دمجٍ سابق).
    ['انتظارُ الحالة المجهولة', "status === 'UNKNOWN' && i < UNKNOWN_TRIES"],
  ];

  it.each(GATES)('بوّابة «%s» قائمة', (_name, marker) => {
    expect(readFileSync(hookPath, 'utf8')).toContain(marker);
  });

  /**
   * ⚠️ (ق-٢٥٤) **البوّابةُ تقرأ أسماءَ الوظائف الثقيلة ومساراتِها من المُشغِّل
   * نفسه** — لا من قائمةٍ في الخطّاف. فقائمةٌ ثانية تفترق عن الأولى يوماً،
   * وحينها تحرس البوّابةُ وظائفَ لم تعد موجودة وتُغفل ما حلّ محلَّها **صامتةً**.
   * فإن ظهر اسمُ وظيفةٍ ثقيلة مكتوباً في الخطّاف — سقط هذا الاختبار.
   */
  it('🔴 بوّابةُ الفحص الثقيل مشتقّةٌ من ملفّ السير لا من قائمةٍ فيها', () => {
    const src = readFileSync(hookPath, 'utf8');
    expect(src).toContain("resolve(repoRoot, '.github', 'workflows', 'web-tests.yml')");
    const heavyJobs = ['db-integration', 'nginx-cache', 'playwright'];
    const code = src.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, ''); // التعليقُ يشرح، والشيفرةُ تحكم
    expect(heavyJobs.filter((j) => code.includes(`'${j}'`) || code.includes(`"${j}"`))).toEqual([]);
  });

  it('كلٌّ منها يرفض بـexit 2 — لا تحذيراً يمرّ', () => {
    const src = readFileSync(hookPath, 'utf8');
    // أربع بوّابات ⇒ أربعة مخارج رافضة على الأقل. ورقمٌ أقلّ يعني أن إحداها
    // صارت تطبع ولا تمنع — وهو بالضبط ما تنهى عنه §8.11.
    expect((src.match(/process\.exit\(2\)/g) ?? []).length).toBeGreaterThanOrEqual(GATES.length);
  });

  /**
   * ⚠️ **ونطاقُ التحميل ليس نطاق الحراسة** (`ق-١٤٩`، 2026-09-04).
   *
   * الربط في `.claude/settings.json` **بمسارٍ نسبيّ**، فلا يُقرأ إلا في جلسةٍ
   * **جذرُها المستودع**. وجلسةٌ جذرُها مجلَّدٌ آخر تمضي **بلا بوّابة** — وقد
   * وقع ذلك فعلاً: الحادثة الرابعة من صنفها **والبوّابة قائمةٌ وصحيحة**.
   *
   * فالعلاج ربطٌ على مستوى المستخدم بمسارٍ مطلق، ومُنفِّذه هذا السكربت.
   *
   * ⚠️ **وحدُّ هذا الاختبار معلَن**: يحرس **وجود المُنفِّذ** لا **تشغيله** —
   * فإعدادات المستخدم خارج المستودع، ولا يراها السير. وهو تمييز `§8.5` نفسه:
   * «مكتوبة» ليست «تعمل»، **والمكتوبُ هنا أن للإصلاح أمراً واحداً يُعاد**.
   */
  it('ومُنفِّذ الربط على مستوى المستخدم موجودٌ ويقرأ البوّاباتِ من settings.json لا من قائمةٍ فيه', () => {
    const installer = join(repoRoot, '.claude', 'hooks', 'install-user-hooks.mjs');
    expect(existsSync(installer)).toBe(true);

    const src = readFileSync(installer, 'utf8');
    // ⭐ (ق-٦٣١) **لا قائمةَ ثانية**: كان يسمّي بوّابةً واحدةً بالاسم، فلمّا أُضيفت
    //    ثانية صار يقرأ الربطَ كلَّه من ملفّ الإعدادات المتتبَّع — فاسمُ بوّابةٍ
    //    مكتوبٌ هنا (خارج التعليق) يعني قائمةً تفترق يوماً عن الأولى.
    expect(src).toContain("resolve(import.meta.dirname, '..', 'settings.json')");
    const code = src.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');
    expect(code).not.toContain('block-shell-text-writes.mjs');
    expect(code).not.toContain('block-edit-while-reading.mjs');
    // مسارٌ مطلق لا نسبيّ — وإلا أعاد العلّة التي بُني لها.
    expect(src).toContain('resolve(import.meta.dirname');
    // ولا يستبدل إعدادات المستخدم: يقرأ ثم يضيف.
    expect(src).toContain('settings.hooks.PreToolUse ??= []');
  });
});

/**
 * البوّابةُ الثانية — «لا تُمسّ شجرةٌ تُقرأ» (`ق-٦٢٦` · `ق-٦٣١`).
 *
 * وجودُها وربطُها هنا؛ **وسلوكُها يُثبَت بالتشغيل** في `edit-while-reading.spec.ts`
 * — فهذا الملفّ يمنع الاختفاء لا الانحراف.
 */
describe('بوّابةُ «لا تُمسّ شجرةٌ تُقرأ» موجودةٌ ومربوطة (ق-٦٣١)', () => {
  const repoRoot = join(__dirname, '..', '..', '..', '..');
  const hookPath = join(repoRoot, '.claude', 'hooks', 'block-edit-while-reading.mjs');
  const settingsPath = join(repoRoot, '.claude', 'settings.json');

  it('ملف الخطّاف موجود', () => {
    expect(existsSync(hookPath)).toBe(true);
  });

  it.each(['Bash', 'Edit|Write|MultiEdit|NotebookEdit'])('مربوطٌ في settings.json على PreToolUse لمطابِق «%s»', (matcher) => {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const pre = settings?.hooks?.PreToolUse ?? [];
    const entries = pre.filter((e: { matcher?: string }) => e.matcher === matcher);
    expect(entries.length).toBeGreaterThan(0);
    const commands = entries.flatMap((e: { hooks?: { command?: string }[] }) => (e.hooks ?? []).map((h) => h.command ?? ''));
    expect(commands.some((c: string) => c.includes('block-edit-while-reading.mjs'))).toBe(true);
  });

  /** الشروطُ الحاكمة — تُقرأ من الملف لا تُوصف. */
  const GATES: ReadonlyArray<readonly [string, string]> = [
    ['أوامرُ الصدفة التي تغيّر الشجرة', 'TREE_MUTATION.test(cmd)'],
    ['الجذورُ تُقرأ من نصّ الأمر لا من مجلد العمل', 'rootsFromCommand(cmd)'],
    ['المنفذُ بأجلٍ لا دائم', 'ageMs <= BYPASS_TTL_MS'],
    ['تعذّرُ السؤال يُعلَن ويُسجَّل لا يُقرأ نفياً', "trace('scan-failed'"],
    ['الرفضُ يسمّي الحزمةَ العاملة', 'scan.readers.map((p) => `  · [${p.pid}]'],
  ];

  it.each(GATES)('بوّابة «%s» قائمة', (_name, marker) => {
    expect(readFileSync(hookPath, 'utf8')).toContain(marker);
  });

  it('يرفض بـexit 2 — لا تحذيراً يمرّ', () => {
    const src = readFileSync(hookPath, 'utf8');
    expect((src.match(/process\.exit\(2\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
