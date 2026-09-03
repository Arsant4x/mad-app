import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * حارس التدرّج — **ملفٌ نُقل لا يُستورد من موضعه القديم.**
 *
 * ## لماذا (قرار المالك 2026-09-03 — الشرط الثاني قبل أول نقلٍ في اعتماد Monorepo)
 *
 * الانتقال إلى `packages/{shared,core,engines,activities}` تدريجيٌّ: كل محرّكٍ يُنقل حين
 * يُلمس. والخطر في التدرّج أن يبقى استيرادٌ يشير إلى الموضع القديم — يعمل ما دام ملفٌ
 * ناسخ أو `re-export` هناك، ثم يصير المسار القديم **بنيةً ثانية** لا أحد يعرف أيّها الأصل.
 *
 * ## كيف
 *
 * - سجلّ النقل `docs/monorepo-moves.json`: `{ moves: [{ from, to, movedOn, pr? }] }` —
 *   المساران نسبيان إلى جذر المستودع **بلا امتداد** (`apps/api/src/journal/journal-posting.util`
 *   أو مجلدٌ كامل `apps/api/src/journal`).
 * - يمسح كل `*.ts`/`*.tsx` تحت `apps/` (عدا `node_modules` · `dist` · `coverage`) ويحلّ
 *   **الاستيرادات النسبية** فقط؛ أي استيرادٍ يحلّ إلى `from` أو تحته يُسقط الحزمة.
 *
 * ## ميله وحدّه
 *
 * إنذارٌ كاذب لا صمتٌ كاذب: استيرادٌ من اختبارٍ يُنذر أيضاً — فالاختبار الذي يقرأ الموضع
 * القديم يشهد لبنيةٍ لم تعد. **والأسماء المستعارة** (`@/…`) لا تُحلّ هنا — ولا وجود لها
 * اليوم (مقيس 2026-09-03: `apps/web/src` يستورد نسبياً ٥٩١ مرة و`@/` صفراً)؛ تُضاف حين
 * يظهر أول استيرادٍ بها — بحالتَي اختبارٍ لا بتعديلٍ أعمى.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const MANIFEST = join(REPO, 'docs', 'monorepo-moves.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.next', 'generated']);

export type Move = { from: string; to: string; movedOn: string; pr?: string };
export type Offender = { file: string; spec: string; resolvesTo: string; from: string };

export function loadMoves(path = MANIFEST): Move[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { moves?: unknown };
  if (!Array.isArray(parsed.moves)) throw new Error(`سجلّ النقل بلا مصفوفة moves: ${path}`);
  for (const m of parsed.moves as Move[]) {
    if (!m.from || !m.to || !m.movedOn) throw new Error(`قيدُ نقلٍ ناقص: ${JSON.stringify(m)}`);
    if (/\.(ts|tsx|js)$/.test(m.from) || /\.(ts|tsx|js)$/.test(m.to)) throw new Error(`المسار يُكتب بلا امتداد: ${m.from} → ${m.to}`);
  }
  return parsed.moves as Move[];
}

export function listSources(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (!SKIP_DIRS.has(n)) walk(p);
      } else if (/\.tsx?$/.test(n)) out.push(p);
    }
  };
  walk(root);
  return out;
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

/** كل استيرادٍ نسبيّ يحلّ إلى موضعٍ قديمٍ مسجَّل. `read` قابلٌ للحقن كي يُثبَت الحارس بحالتَين بلا قرص. */
export function oldPathImports(
  files: string[],
  moves: Move[],
  repo = REPO,
  read: (f: string) => string = (f) => readFileSync(f, 'utf8'),
): Offender[] {
  if (moves.length === 0) return [];
  const offenders: Offender[] = [];
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec || !spec.startsWith('.')) continue;
      const rel = relative(repo, resolve(dirname(file), spec)).replace(/\\/g, '/');
      for (const mv of moves) {
        if (rel === mv.from || rel.startsWith(mv.from + '/')) {
          offenders.push({ file: relative(repo, file).replace(/\\/g, '/'), spec, resolvesTo: rel, from: mv.from });
        }
      }
    }
  }
  return offenders;
}

describe('حارس التدرّج — ملفٌ نُقل لا يُستورد من موضعه القديم', () => {
  const moves = loadMoves();
  // الحارس يفحص نفسه أيضاً — بلا استثناء. لذلك تُبنى استيرادات حالاته أدناه بدالة `imp()`
  // كي لا يحوي الملف نصَّ `from '...'` حرفياً (§8.7 الوجه الخامس: مجسٌّ يطابق نفسه — أمسك
  // الإثباتُ العكسي الأول هذا الملفَ نفسه ضمن المزروع).
  const sources = listSources(join(REPO, 'apps'));

  it('السطح غير فارغ — وإلا فالحارس يفحص العدم', () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.some((f) => f.endsWith('app.module.ts'))).toBe(true);
  });

  it('⭐ لا استيرادٌ نسبيٌّ يحلّ إلى موضعٍ قديمٍ مسجَّل في docs/monorepo-moves.json', () => {
    expect(oldPathImports(sources, moves).map((o) => `${o.file} ← ${o.spec} (${o.from})`)).toEqual([]);
  });

  // ⭐ الإثبات العكسي مبنيٌّ في الحارس: مُستخرِجٌ لا يمسك الحالة المعروفة أعمى.
  it('المُستخرِج يمسك ما يجب ويترك ما يجب — مُثبَتٌ بحالاتٍ معروفة', () => {
    const repo = resolve('/repo');
    const file = join(repo, 'apps', 'api', 'src', 'pos', 'pos.service.ts');
    const imp = (spec: string) => `import { x } from '${spec}';\n`;
    const read = () => imp('../journal/journal-posting.util') + imp('@nestjs/common') + imp('../journal');
    const at = (from: string) => oldPathImports([file], [{ from, to: 'packages/core/journal', movedOn: '2026-09-03' }], repo, read);
    expect(at('apps/api/src/journal/journal-posting.util').length).toBe(1); // ملفٌ نُقل — يُمسك
    expect(at('apps/api/src/journal').length).toBe(2); // مجلدٌ نُقل — يُمسك ما تحته والمجلد نفسه
    expect(at('apps/api/src/journal/other-file').length).toBe(0); // ملفٌ آخر — يُترك
    expect(at('apps/api/src/journal-x').length).toBe(0); // بادئةٌ مشابهة بلا فاصل — تُترك
    expect(oldPathImports([file], [], repo, read)).toEqual([]); // سجلٌّ فارغ — لا إنذار
  });

  it('سجلّ النقل يرفض القيود الناقصة والامتدادات', () => {
    expect(() => loadMoves(join(__dirname, 'no-such-manifest.json'))).toThrow();
  });
});
