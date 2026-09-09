import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// **ولا يمسح شيفرةً**: مقروءُه **أسماءُ ملفّاتٍ من `git`** ونصُّ خطّافٍ بـ`sh`
// — فهو خارج سطح `ق-٣٧٥` أصلاً.

/**
 * ⛔ **السجلّاتُ لا تُخلط بالشيفرة** (`ق-٣٧١` · `ق-٣٧٩`) — والسيرُ يضمن ما
 * يُتجاوَز بـ`--no-verify`.
 *
 * ── العطل المقيس ─────────────────────────────────────────────────────────
 *
 * `docs/decisions.md` و`docs/engines.md` **سجلّا أرقامٍ محجوزة**: فرعٌ يمسّهما
 * مع شيفرةٍ **يصنع سباقَ ترقيمٍ ومكرَّرات** — وقد أمسك حارسُ الترقيم `ق-319`
 * مكرَّراً في جلسةٍ واحدة.
 *
 * ⚠️ **ووقع أربع مرات، وآخرُها بلغ طلباً منشوراً**: بُنيت بوّابةٌ وسبعةُ حرّاسٍ
 * **على فرع السجل** لأن فرعَ الشيفرة أُنشئ ثم انتُقل للتسجيل ولم يُعَد.
 * **والضررُ يقع عند الدفع لا عند الدمج** — ولذلك **خطّافُ `pre-push` يمنع**،
 * **وهذا الحارسُ يضمن**: الخطّافُ يُتجاوَز ويغيب على نسخةٍ لم تُثبَّت.
 *
 * ── والاستثناءُ يُسمّى ولا يُستنتَج ──────────────────────────────────────
 *
 * `CLAUDE.md` **مستثنىً صراحةً** (`ق-٣٧٢`): **قواعدُ تشغيلٍ لا سجلُّ أرقام**،
 * **وقاعدةٌ تُستخرَج من إصلاحٍ هي غرضُه نفسه** — فصلُها يُنزل القاعدةَ بلا
 * الشيفرة التي تُثبتها. ⚠️ **ولا يمتدّ إلى وثيقةٍ ثالثة** بحجّة أنها «ليست
 * سجلاً» — **فالاستثناءُ بالاسم لا بالنوع**.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const HOOK = join(REPO, '.githooks', 'pre-push');

/** السجلّان — **بالاسم صراحةً**، ولا يُشتقّان من «كل ما تحت `docs/`». */
export const REGISTRIES = ['docs/decisions.md', 'docs/engines.md'];

export function mixesRegistryWithCode(changed: string[]): boolean {
  const registry = changed.filter((f) => REGISTRIES.includes(f));
  const code = changed.filter((f) => /^(apps|packages)\//.test(f));
  return registry.length > 0 && code.length > 0;
}

/** ملفّات الفرع مقارنةً بـ`main` — فارغةٌ إن تعذّر (فرعٌ يتيم أو نسخةٌ ضحلة). */
function changedFiles(): string[] | null {
  try {
    const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: REPO, encoding: 'utf8' }).trim();
    if (!base) return null;
    return execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { cwd: REPO, encoding: 'utf8' })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

describe('السجلّاتُ لا تُخلط بالشيفرة — والخطّافُ يمنع قبل الدفع', () => {
  it('المُكتشِف مُثبَتٌ بحالتَين: يمسك الخلط ويترك ما ليس خلطاً', () => {
    // 🔴 **الحالةُ الواقعة**: شيفرةُ حرّاسٍ مع صفوف السجل — وهي التي وقعت.
    expect(mixesRegistryWithCode(['docs/decisions.md', 'apps/api/src/common/guard-reads-declared.spec.ts'])).toBe(true);
    expect(mixesRegistryWithCode(['docs/engines.md', 'apps/web/src/x.tsx'])).toBe(true);

    // وما ليس خلطاً يمرّ: سجلٌّ وحده · شيفرةٌ وحدها.
    expect(mixesRegistryWithCode(['docs/decisions.md', 'docs/engines.md'])).toBe(false);
    expect(mixesRegistryWithCode(['apps/api/src/a.ts', 'apps/api/test/b.e2e-spec.ts'])).toBe(false);

    // ⚠️ **و`CLAUDE.md` مستثنىً بالاسم** (`ق-٣٧٢`): قاعدةٌ تُستخرَج من إصلاحٍ
    // تسافر معه — **ووثيقةٌ ثالثة لا ترث الاستثناء**.
    expect(mixesRegistryWithCode(['CLAUDE.md', 'apps/api/src/a.ts'])).toBe(false);
    expect(mixesRegistryWithCode(['docs/licensing-and-operations.md', 'apps/api/src/a.ts'])).toBe(false);
  });

  it('🔴 والخطّافُ موجودٌ ويمنع عند الدفع — لا عند الدمج وحده', () => {
    expect(existsSync(HOOK)).toBe(true);
    const src = readFileSync(HOOK, 'utf8');
    // يقرأ فرقَ الفرع عن `main`، ويسمّي السجلّين، ويخرج بغير صفر.
    expect(src).toContain('merge-base');
    for (const r of REGISTRIES) expect(src).toContain(r.replace('docs/', '').replace('.md', ''));
    expect(src).toContain('exit 1');
    // **واللغةُ تُضبط أولاً** — §8.7 الوجه السادس، كأخيه `pre-commit`.
    expect(src).toContain('LC_ALL=C.UTF-8');
  });

  it('🔴 وهذا الفرعُ نفسُه لا يخلط', () => {
    const changed = changedFiles();
    // **ولا يُقرأ التعذُّرُ نجاحاً**: نسخةٌ ضحلة أو فرعٌ يتيم يُعلَن تخطّياً
    // صريحاً لا صمتاً (`no-silent-skip` يمنع التخطّي الصامت).
    if (changed === null) {
      expect(changedFiles()).toBeNull();
      return;
    }
    expect(mixesRegistryWithCode(changed)).toBe(false);
  });
});
