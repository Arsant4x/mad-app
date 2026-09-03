import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * حارس السجلَّين والفهرس — `docs/engines.md` · `docs/decisions.md` · `docs/INDEX.md`.
 *
 * ## لماذا (قرار المالك 2026-09-01)
 *
 * ثلاثٌ وخمسون وثيقة تخطيطٍ حملت **٨١٤ مرجعَ `ق-N` بـ٧٢ رقماً مميّزاً، ٥٦ منها في
 * ملفَين فأكثر** (عدٌّ بـ`LC_ALL=C.UTF-8` — المعتمد مرجعاً بقرار المالك 2026-09-03؛
 * عدٌّ أسبق بلا لغة أعطى ٤٩٦/٦٣ وسقط بحكم `§8.7` الوجه السادس)،
 * و`L2-19` مستعمَلٌ للتذكيرات ومقترَحٌ للنماذج في آن. فالسجل يُقفل الرقم:
 * **يُحجز منه لا يُختار**. والحارس يُسقط الحزمة عند ثلاثة:
 *
 *   ① معرّف محرّكٍ `L<طبقة>-<رقم>` مُستشهَدٌ به في `docs/plans/` **وليس في السجل**.
 *   ② معرّفٌ **مكرَّر** في أيٍّ من السجلَّين.
 *   ③ ملفٌ في `docs/plans/` **بلا صفٍّ في الفهرس**، أو صفٌّ **بلا ملف** — بالاتجاهين.
 *
 * ## ميله المعلَن
 *
 * إنذارٌ كاذب لا صمتٌ كاذب: وثيقةٌ جديدة لم تُفهرس بعد **تُنذر**، ورقمٌ اقتُرح في
 * وثيقةٍ ولم يُحجز **يُنذر**. والإنذار يُراجَع بدقيقة؛ والصمت يعيش سنين — وقد عاش:
 * التصادم في `L2-19` مرّ أسبوعاً بلا أن يراه أحد.
 *
 * ## حدّه
 *
 * - `ق-N` **لا يُفحص هنا** في الوثائق: الرمز مُحمَّلٌ بمعنيَين (قرارٌ حاجب في الخطة
 *   الموحّدة · قيدٌ مرقَّم في وثائق الأنشطة — ١٢ وثيقة تعرّف `ق-1` بغير التكلفة).
 *   ففحصُ استشهاداته يُنذر على كل قيدٍ محلّي. يُفحص **تفرّده في السجل** فقط، ويُفكّ
 *   التحميل عند اعتماد كل وثيقة (`decisions.md`).
 * - و`C1…C18` (وثيقتان) نظامٌ محلّي معلَنٌ في `engines.md`، لا يُفحص.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const DOCS = join(REPO, 'docs');
const PLANS = join(DOCS, 'plans');

const read = (p: string) => readFileSync(p, 'utf8');

/** معرّفات المحرّكات — مدىً لاتينيّ صريح، فلا اعتماد على لغة البيئة. */
const ENGINE_ID = /\bL[0-4]-[0-9]{1,2}\b/g;
/** معرّفات القرارات في السجل — الأرقام العربية تُوحَّد إلى لاتينية قبل المقارنة. */
const DECISION_ID = /ق-([0-9]+|[٠-٩]+)/g;
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * المعرّفات **المسجَّلة**: ما يظهر في عمود الجدول الأول **داخل كودٍ أو تعريض** — لا في
 * النثر ولا نصّاً مجرَّداً (فالإحالات في جداول الملخّص تُكتب مجرَّدةً عمداً).
 *
 * ⚠️ وتُقرأ **كل** الامتدادات في الخلية لا أولها: أول كتابةٍ أخذت أول `code` قبل أول
 * `**bold**`، فسقط `ق-٥` لأن خليته `**ق-٥ — … (`SPEC §15.9`)**` والكود الداخلي
 * لا يحمل رقماً — فعُدّ السجل ١٧ لا ١٨. كشفه شرط «السطح غير فارغ» لا المراجعة.
 */
export function registeredIds(markdown: string, idRe: RegExp): string[] {
  const ids: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const firstCell = line.split('|')[1] ?? '';
    const spans = [...firstCell.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*/g)].map((m) => m[1] ?? m[2] ?? '');
    const seen = new Set<string>();
    for (const span of spans) for (const id of span.match(idRe) ?? []) seen.add(toLatin(id));
    ids.push(...seen);
  }
  return ids;
}

/** كل معرّفٍ مذكورٍ في وثائق التخطيط — بلا تمييز موضعه. */
export function citedEngineIds(dir: string): Map<string, string[]> {
  const where = new Map<string, string[]>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const text = read(join(dir, f));
    for (const id of new Set(text.match(ENGINE_ID) ?? [])) {
      where.set(id, [...(where.get(id) ?? []), f]);
    }
  }
  return where;
}

/** أسماء الملفات التي يربطها الفهرس بـ`plans/…`. */
export function indexedFiles(indexMd: string): string[] {
  return [...indexMd.matchAll(/\]\(plans\/([^)]+)\)/g)].map((m) => decodeURIComponent(m[1]));
}

const dup = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

describe('حارس السجلَّين والفهرس — الرقم يُحجز لا يُختار', () => {
  const engines = read(join(DOCS, 'engines.md'));
  const decisions = read(join(DOCS, 'decisions.md'));
  const index = read(join(DOCS, 'INDEX.md'));
  const plans = readdirSync(PLANS).filter((n) => n.endsWith('.md')).sort();

  it('السطح غير فارغ — وإلا فالحارس يفحص العدم', () => {
    expect(plans.length).toBeGreaterThanOrEqual(53);
    expect(registeredIds(engines, ENGINE_ID).length).toBeGreaterThanOrEqual(64);
    expect(registeredIds(decisions, DECISION_ID).length).toBeGreaterThanOrEqual(18);
  });

  it('⭐ ① كل معرّف محرّكٍ مُستشهَدٍ به في docs/plans مسجَّلٌ في engines.md', () => {
    const registered = new Set(registeredIds(engines, ENGINE_ID));
    const offenders = [...citedEngineIds(PLANS)]
      .filter(([id]) => !registered.has(id))
      .map(([id, files]) => `${id} ← ${files.join(', ')}`);
    expect(offenders).toEqual([]);
  });

  it('⭐ ② لا معرّف مكرَّر في engines.md ولا في decisions.md', () => {
    expect(dup(registeredIds(engines, ENGINE_ID))).toEqual([]);
    expect(dup(registeredIds(decisions, DECISION_ID))).toEqual([]);
  });

  it('⭐ ③ الفهرس وملفات docs/plans متطابقان — بالاتجاهين', () => {
    const indexed = indexedFiles(index).sort();
    const missingFromIndex = plans.filter((f) => !indexed.includes(f));
    const missingOnDisk = indexed.filter((f) => !plans.includes(f));
    expect({ missingFromIndex, missingOnDisk }).toEqual({ missingFromIndex: [], missingOnDisk: [] });
  });

  // ⭐ الإثبات العكسي مبنيٌّ في الحارس: مُستخرِجٌ لا يمسك الحالة المعروفة أعمى.
  it('المُستخرِجات تمسك ما يجب وتترك ما يجب — مُثبَتةٌ بحالتَين', () => {
    const sample = '| `L2-19` | التذكيرات | 4 |\n| `L2-19` | مكرَّر | 1 |\nنثرٌ يذكر L9-99 لا يُحتسب مسجَّلاً\n| **ق-١ — التكلفة** | يحجب | 12 |\n| **ق-1 — مكرَّر بلاتيني** | x | 0 |';
    expect(registeredIds(sample, ENGINE_ID)).toEqual(['L2-19', 'L2-19']); // النثر لا يُسجِّل
    expect(dup(registeredIds(sample, ENGINE_ID))).toEqual(['L2-19']); // التكرار يُكشف
    expect(registeredIds(sample, DECISION_ID)).toEqual(['ق-1', 'ق-1']); // العربي واللاتيني رقمٌ واحد
    expect(indexedFiles('[`a.md`](plans/a.md) · [x](other/b.md)')).toEqual(['a.md']); // غير plans/ لا يُحتسب
    // ⚠️ الحالة التي أسقطت العدّ إلى ١٧: تعريضٌ يحوي كوداً داخلياً بلا رقم — يُقرأ الرقم من التعريض.
    expect(registeredIds('| **ق-٥ — تعدد الأنشطة (`SPEC §15.9`)** | x |', DECISION_ID)).toEqual(['ق-5']);
    expect(registeredIds('| L2-19 نصٌّ مجرَّد | إحالة |', ENGINE_ID)).toEqual([]); // المجرَّد لا يُسجِّل
  });
});
