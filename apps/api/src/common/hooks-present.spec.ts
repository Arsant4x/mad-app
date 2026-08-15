import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
  ];

  it.each(GATES)('بوّابة «%s» قائمة', (_name, marker) => {
    expect(readFileSync(hookPath, 'utf8')).toContain(marker);
  });

  it('كلٌّ منها يرفض بـexit 2 — لا تحذيراً يمرّ', () => {
    const src = readFileSync(hookPath, 'utf8');
    // أربع بوّابات ⇒ أربعة مخارج رافضة على الأقل. ورقمٌ أقلّ يعني أن إحداها
    // صارت تطبع ولا تمنع — وهو بالضبط ما تنهى عنه §8.11.
    expect((src.match(/process\.exit\(2\)/g) ?? []).length).toBeGreaterThanOrEqual(GATES.length);
  });
});
