import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): اتجاهُ الاستيراد يُقرأ من **مسار
// الوحدة داخل جملة `import`** — **وهو سلسلةٌ نصّية**. **فتجريدُ النصوص يمحو
// المسارات فيعود الحارسُ بلا استيرادٍ واحد.**
readsDeclaredStrings();

/**
 * حارس اتجاه الاستيراد — **`activities → engines → core → shared` ولا عكس.**
 *
 * ## لماذا (قرار المالك 2026-09-03 — القاعدة «أ» في `CLAUDE.md §3`، اعتماد Monorepo)
 *
 * «المحرّك لا يعرف نشاطاً. خرقٌ واحد يربط المحرّكات بالأنشطة ويجعل أي فصلٍ لاحق مستحيلاً.»
 * والإنفاذ آليٌّ من أول جلسةٍ بعد الاعتماد. `eslint` غير مثبَّتٍ في المستودع (مقيس
 * 2026-09-03: سكربت `lint` يفشل بـ«غير معروف»)، فهذا الحارس هو البوّابة الأولى على
 * الهيكل **الحالي** — مجلدات `apps/api/src` — ويُستبدل بقاعدة أداة lint عند نقل المجلدات.
 *
 * ## كيف
 *
 * - `docs/monorepo-layers.json`: `layers` تصنيف **كل** مجلدٍ علويّ في `apps/api/src` إلى
 *   `infra | shared | core | engine | activity` (الرتبة: shared=0 · infra=core=1 · engine=2 ·
 *   activity=3 — فالبنية التقنية نواةٌ بمعيار المالك «ما لا يعمل النظام بدونه»، والتسمية
 *   `infra` توثيقٌ لا رتبة)، و`baseline` الخروقات **الموجودة يوم الاعتماد** على مستوى
 *   الملف — دَينٌ معلَن.
 * - يمسح كل `*.ts` غير الاختبارات تحت `apps/api/src/<وحدة>/` ويحلّ الاستيرادات النسبية
 *   العابرة للوحدات؛ استيرادٌ من رتبةٍ أدنى إلى أعلى = خرق.
 * - **مِسنَنٌ لا سقف**: خرقٌ خارج `baseline` يُسقط الحزمة، وقيدٌ في `baseline` لم يعد
 *   خرقاً يُسقطها أيضاً — كي لا يبقى الدَين مكتوباً بعد سداده. الدَين ينقص ولا يزيد.
 *
 * ## حدّه
 *
 * الاختبارات مستثناة (تستورد عبر الوحدات لتُثبت). والاستيرادات غير النسبية (حزم npm)
 * لا تعبّر عن طبقة. والويب خارج هذا الحارس حتى تُعرَّف طبقاته.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const SRC = join(REPO, 'apps', 'api', 'src');
const LAYERS_FILE = join(REPO, 'docs', 'monorepo-layers.json');

export type Layer = 'infra' | 'shared' | 'core' | 'engine' | 'activity';
export const RANK: Record<Layer, number> = { shared: 0, infra: 1, core: 1, engine: 2, activity: 3 };
export type Edge = { file: string; spec: string; from: string; to: string };
export type Baseline = { file: string; to: string; reason?: string };
export type LayersDoc = { layers: Record<string, Layer>; baseline: Baseline[] };

export function loadLayers(path = LAYERS_FILE): LayersDoc {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Partial<LayersDoc>;
  if (!doc.layers || typeof doc.layers !== 'object') throw new Error(`لا layers في ${path}`);
  if (!Array.isArray(doc.baseline)) throw new Error(`لا baseline في ${path}`);
  for (const [m, l] of Object.entries(doc.layers)) if (!(l in RANK)) throw new Error(`طبقةٌ غير معروفة للوحدة ${m}: ${l}`);
  return doc as LayersDoc;
}

export function moduleDirs(src = SRC): string[] {
  return readdirSync(src)
    .filter((n) => statSync(join(src, n)).isDirectory())
    .sort();
}

function walk(d: string, out: string[]): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(n)) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

/** الحواف العابرة للوحدات من الكود غير الاختباري. `read` و`files` قابلان للحقن للإثبات بحالتَين. */
export function crossModuleEdges(
  src = SRC,
  files: string[] = walk(src, []),
  read: (f: string) => string = (f) => readFileSync(f, 'utf8'),
): Edge[] {
  const modOf = (p: string): string | null => {
    const parts = relative(src, p).split(sep);
    return parts.length > 1 && !parts[0].startsWith('..') ? parts[0] : null;
  };
  const edges: Edge[] = [];
  for (const file of files) {
    // الاختبارات تُستثنى هنا — في الدالة نفسها لا في المسح فقط — كي يصدق استثناؤها على أي قائمةٍ تُحقَن.
    // (كشفته حالة الاختبار: كانت تعدّ استيراد `journal.spec.ts` حافةً لأن الاستثناء كان في `walk` وحدها.)
    if (/\.(spec|test)\.ts$/.test(file)) continue;
    const from = modOf(file);
    if (!from) continue;
    for (const m of read(file).matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec || !spec.startsWith('.')) continue;
      const to = modOf(resolve(dirname(file), spec) + sep + 'x');
      if (!to || to === from) continue;
      edges.push({ file: relative(join(src, '..', '..', '..'), file).replace(/\\/g, '/'), spec, from, to });
    }
  }
  return edges;
}

export function violations(edges: Edge[], layers: Record<string, Layer>): Edge[] {
  return edges.filter((e) => layers[e.from] && layers[e.to] && RANK[layers[e.to]] > RANK[layers[e.from]]);
}

const key = (v: { file: string; to: string }) => `${v.file} → ${v.to}`;

describe('حارس اتجاه الاستيراد — activities → engines → core → shared، ولا عكس', () => {
  const doc = loadLayers();
  const dirs = moduleDirs();
  const edges = crossModuleEdges();
  const found = violations(edges, doc.layers);
  const baseline = new Set(doc.baseline.map(key));

  it('السطح غير فارغ — وإلا فالحارس يفحص العدم', () => {
    expect(dirs.length).toBeGreaterThanOrEqual(51);
    expect(edges.length).toBeGreaterThan(100);
  });

  it('⭐ كل مجلدٍ علويّ مصنَّف، ولا تصنيفٌ لمجلدٍ لا وجود له — بالاتجاهين', () => {
    const classified = Object.keys(doc.layers).sort();
    expect({
      unclassified: dirs.filter((d) => !doc.layers[d]),
      stale: classified.filter((c) => !dirs.includes(c)),
    }).toEqual({ unclassified: [], stale: [] });
  });

  it('⭐ لا خرقٌ جديد خارج الدَين المعلَن في baseline', () => {
    const fresh = found.filter((v) => !baseline.has(key(v))).map((v) => `${key(v)}  [${doc.layers[v.from]} → ${doc.layers[v.to]}] via ${v.spec}`);
    expect(fresh).toEqual([]);
  });

  it('⭐ الدَين ينقص ولا يبقى مكتوباً بعد سداده — كل قيدٍ في baseline ما زال خرقاً', () => {
    const live = new Set(found.map(key));
    expect(doc.baseline.map(key).filter((k) => !live.has(k))).toEqual([]);
  });

  // ⭐ الإثبات العكسي مبنيٌّ في الحارس.
  it('المُستخرِج والحكم يمسكان ما يجب ويتركان ما يجب — مُثبَتان بحالاتٍ معروفة', () => {
    const src = resolve('/repo/apps/api/src');
    const f = (m: string, n: string) => join(src, m, n);
    // الاستيرادات المزيّفة تُبنى بدالةٍ كي لا يحوي هذا الملف نصَّ `from '...'` حرفياً —
    // وإلا أمسكه حارس التدرّج (moved-paths) بوصفه استيراداً حقيقياً (§8.7 الوجه الخامس).
    const imp = (spec: string) => `import { x } from '${spec}';\n`;
    const files = [f('journal', 'journal.service.ts'), f('pos', 'pos.service.ts'), f('journal', 'journal.spec.ts'), join(src, 'app.module.ts')];
    const contents: Record<string, string> = {
      [f('journal', 'journal.service.ts')]: imp('../units/units.service') + imp('@mad-app/db') + imp('./journal.util'),
      [f('pos', 'pos.service.ts')]: imp('../journal/journal-posting.util'),
      [f('journal', 'journal.spec.ts')]: imp('../units/fixture'),
      [join(src, 'app.module.ts')]: imp('./journal/journal.module'),
    };
    const edges = crossModuleEdges(src, files, (p) => contents[p]);
    expect(edges.map((e) => `${e.from}→${e.to}`).sort()).toEqual(['journal→units', 'pos→journal']); // الاختبار وملف الجذر والحزمة والداخلي لا يُحتسبون
    const layers: Record<string, Layer> = { journal: 'core', units: 'activity', pos: 'engine' };
    expect(violations(edges, layers).map((v) => `${v.from}→${v.to}`)).toEqual(['journal→units']); // نواةٌ تستورد نشاطاً = خرق · محرّكٌ يستورد نواة = سليم
    expect(violations(edges, { journal: 'core', units: 'core', pos: 'engine' })).toEqual([]); // الرتبة نفسها ليست خرقاً
    expect(violations(edges, { journal: 'core', pos: 'engine' })).toEqual([]); // وحدةٌ بلا طبقة لا تُحكم هنا — يمسكها اختبار الاتجاهين
  });
});
