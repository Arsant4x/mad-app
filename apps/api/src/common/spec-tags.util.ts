import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * أدوات الطبقة ① — **الحالة تُشتقّ ولا تُكتب** (قرار المالك 2026-09-03).
 *
 * - `parseSpec` يقرأ `SPEC.md` بنيةً: كل صفٍّ رقمُه (`N.N`) ونصُّه وخليةُ حالته — **إن كان لجدوله
 *   عمودُ حالة** (رأسه `mad-app` أو `الحالة`). جدولٌ بلا هذا الرأس لا يحمل ادّعاء حالة (`null`):
 *   مقيس 2026-09-03 — ١٠ جداول «# | الخدمة | أولوية» بـ٨٥ صفاً لا تدّعي شيئاً، فلا تُوسَم ولا تُحاسَب.
 * - `collectTags` يقرأ أسماء الاختبارات في المصدر (لا مخرَج jest) ويستخرج الوسم `[SPEC 4.5]`
 *   أو `[SPEC 4.5 4.6]` **في أول الاسم** — لاتينيٌّ فينجو من `§8.7` الوجه السادس، ولا يصطدم بـ`§8.11`
 *   التي تشير إلى أقسام `CLAUDE.md`.
 */

export type SpecRow = {
  id: string;
  line: number;
  section: string;
  header: string | null;
  /** الخلية الخام لعمود الحالة، أو `null` إن لم يكن للجدول عمودُ حالة. */
  status: string | null;
  text: string;
};

export type Status = 'done' | 'partial' | 'todo' | 'other';

export const STATUS_HEADERS = ['mad-app', 'الحالة'];

const cellsOf = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());

export function parseSpec(markdown: string): SpecRow[] {
  const lines = markdown.split(/\r?\n/);
  let section = '';
  let header: { cells: string[]; statusIdx: number } | null = null;
  const rows: SpecRow[] = [];
  lines.forEach((l, i) => {
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      section = h[1].trim();
      header = null;
      return;
    }
    if (/^\|\s*#\s*\|/.test(l)) {
      const cells = cellsOf(l);
      header = { cells, statusIdx: cells.findIndex((c) => STATUS_HEADERS.includes(c)) };
      return;
    }
    const m = l.match(/^\|\s*([0-9]+\.[0-9]+)\s*\|/);
    if (!m) return;
    const cells = cellsOf(l);
    const status = header && header.statusIdx >= 0 ? (cells[header.statusIdx] ?? '') : null;
    rows.push({ id: m[1], line: i + 1, section, header: header ? header.cells.join(' | ') : null, status, text: cells[1] ?? '' });
  });
  return rows;
}

/** ✅ → done · 🟨 → partial · ⬜ → todo · وما سواها (🟡 ⚪ 🟠 …) → other. */
export function normalizeStatus(cell: string): Status {
  const c = cell.trim();
  if (c.startsWith('✅')) return 'done';
  if (c.startsWith('🟨')) return 'partial';
  if (c.startsWith('⬜')) return 'todo';
  return 'other';
}

export type TestTag = {
  file: string;
  name: string;
  ids: string[];
  /** `it.skip` · `it.todo` · `xit` — وسمٌ بلا تشغيلٍ ادّعاءٌ لا إثبات. */
  skipped: boolean;
  /** `*.live.spec.ts` لا تعمل في وظيفة api-unit (تعمل في db-integration). */
  live: boolean;
  /** `apps/api/test/*.e2e-spec.ts` — تعمل في وظيفة db-integration عبر `npm run test:e2e` (٧٧ مجموعة). */
  e2e: boolean;
};

/** سطح الوسم: اختبارات الوحدات والحيّة تحت `src`، واختبارات الطرف إلى الطرف تحت `apps/api/test`، واختبارات الويب. */
export const TEST_FILE_RE = /(\.(spec|test)|-spec)\.tsx?$/;

export const TAG_RE = /^\[SPEC ((?:[0-9]+\.[0-9]+)(?: [0-9]+\.[0-9]+)*)\]/;
const TEST_CALL_RE = /(?<![\w.])(x?it|x?test)(?:\.(only|skip|todo|concurrent))?\(\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/g;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.next']);

export function listTestFiles(roots: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (!SKIP_DIRS.has(n)) walk(p);
      } else if (TEST_FILE_RE.test(n)) out.push(p);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

/** كل اسم اختبارٍ (`it`/`test`) في الملفات — والموسوم منها يحمل معرّفاته. `read` قابلٌ للحقن للإثبات بحالتَين. */
export function collectTags(
  files: string[],
  repo: string,
  read: (f: string) => string = (f) => readFileSync(f, 'utf8'),
): { tagged: TestTag[]; testCount: number } {
  const tagged: TestTag[] = [];
  let testCount = 0;
  for (const file of files) {
    // أسطر التعليق الكاملة تُسقَط قبل المطابقة: اختبارٌ معلَّق بـ`//` أو مثالٌ في توثيقٍ ليس اختباراً يعمل.
    // (وقع فعلاً: توثيق الحارس نفسه حوى مثالَين فعُدّا وسمَين وبندَين «متخلّفَين».)
    const text = read(file)
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .join('\n');
    for (const m of text.matchAll(TEST_CALL_RE)) {
      testCount++;
      const [, fn, modifier, , name] = m;
      const tag = name.match(TAG_RE);
      if (!tag) continue;
      tagged.push({
        file: relative(repo, file).replace(/\\/g, '/'),
        name,
        ids: tag[1].split(' '),
        skipped: fn.startsWith('x') || modifier === 'skip' || modifier === 'todo',
        live: /\.live\.spec\.tsx?$/.test(file),
        e2e: /\.e2e-spec\.tsx?$/.test(file),
      });
    }
  }
  return { tagged, testCount };
}
