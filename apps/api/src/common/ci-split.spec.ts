import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): يقرأ **ملفّات سير `YAML`** وأسماءَ
// أوامرَ مكتوبةً نصّاً — **ولا شيفرةَ `TypeScript` يبحث فيها عن نمط**.
readsDeclaredStrings();

/**
 * `ق-٢٤٥` · `ق-٢٥٠` · `ق-٢٥١` — **تقسيمُ السير بوّابةً لا تعليقاً**.
 *
 * الخفيفُ (`web-tests-light.yml`) على كل دفع؛ والثقيلُ (`web-tests.yml`) عند **فتح**
 * الطلب لما يمسّ شيفرة، **وعند الدمج مطلقاً**. وحصةُ GitHub Actions نفدت في أسبوعين
 * بخمس وظائفٍ على كل دفع، فصار التفريقُ **بالمسار لا بالنيّة** (حكم المالك 2026-09-07).
 *
 * **ولماذا مُشغِّلان لا شرطٌ على الوظائف**: `paths` لا تعيش على الوظيفة، **ووظيفةٌ
 * تسأل عن الملفات المتغيّرة تكون قد بدأت فتُحاسَب**. فالتصفيةُ بالمسار لا تكون إلا
 * على المُشغِّل — ولذلك حُذفت شروطُ `if` من الوظائف: آليّتان تحكمان الشيءَ نفسه
 * تفترقان يوماً.
 *
 * مشتقٌّ لا قائمة، في ثلاثة أوجه:
 *   ① **الوظيفةُ الثقيلة** هي التي تحمل قاعدةً (`services:`) أو تبني صورةً
 *     (`docker build`) أو تشغّل متصفّحاً (`playwright`) — فيجب أن تكون في الملفّ
 *     الثقيل، وما سواها في الخفيف.
 *   ② **كلُّ فعلٍ يسمّيه مُشغِّلٌ يجب أن يكون معلَناً** (ق-٢٥٠: «بوّابةٌ على بابٍ لا
 *     يُطرَق» — `ready_for_review` ليست من الأنواع الافتراضية الثلاث).
 *   ③ **سطحُ التشغيل يغطّي سطحَ القراءة** (§8.7): كلُّ مدخلٍ في جذر المستودع
 *     **يسمّيه حارسٌ في `src/common`** يجب أن تغطّيه مساراتُ الخفيف — وإلا مرّ
 *     تغييرٌ يكسر حارساً بلا أن يعمل. وهكذا انكشف `.claude/**` و`deploy.sh`.
 *
 * حدُّه المعلَن: يقرأ الملفَّين نصّاً. ووظيفةٌ تُنشئ قاعدةً بطريقةٍ لا تُسمّى
 * `services:` ولا `docker` لا يراها — فتُوسَّع الإشارات لا القائمة. والوجهُ ③
 * **يُفرِط في التغطية عمداً**: يطالب بمسارٍ لكل مدخلٍ يُذكر اسمُه ولو في تعليق —
 * لأن تغطيةً زائدةً تكلّف تشغيلاً خفيفاً، وتغطيةً ناقصةً تكلّف حارساً أعمى.
 */
const WORKFLOWS = join(__dirname, '..', '..', '..', '..', '.github', 'workflows');
const HEAVY = join(WORKFLOWS, 'web-tests.yml');
const LIGHT = join(WORKFLOWS, 'web-tests-light.yml');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const COMMON = __dirname;

export interface JobBlock {
  name: string;
  body: string;
}

/** كتلُ الوظائف: من `  <name>:` تحت `jobs:` إلى الوظيفة التالية — بلا تعليقاتٍ كي لا يُقرأ الشرحُ حكماً. */
export function jobBlocks(yaml: string): JobBlock[] {
  const noComments = yaml
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  const jobsAt = noComments.indexOf('\njobs:\n');
  if (jobsAt < 0) return [];
  const body = noComments.slice(jobsAt + '\njobs:\n'.length);
  const out: JobBlock[] = [];
  const re = /^  ([A-Za-z0-9_-]+):\s*$/gm;
  const starts: { name: string; index: number }[] = [];
  for (const m of body.matchAll(re)) starts.push({ name: m[1], index: m.index ?? 0 });
  starts.forEach((s, i) => out.push({ name: s.name, body: body.slice(s.index, starts[i + 1]?.index ?? body.length) }));
  return out;
}

export const isHeavy = (job: JobBlock) => /^\s{4}services:\s*$/m.test(job.body) || /docker build/.test(job.body) || /playwright/i.test(job.body);

/** كتلةُ `pull_request:` تحت `on:` — بلا تعليقات. */
function eventBlock(yaml: string, event: 'pull_request' | 'push'): string {
  // ⚠️ يُوحَّد سطرُ النهاية أولاً: نسخةُ العمل على ويندوز تحمل `CRLF` بعد
  //    `checkout`، فنمطٌ يكتب `\n` صراحةً **يمرّ محلياً حين كُتب ويسقط بعد
  //    أول تربيع** — وقد وقع فعلاً على هذا الملفّ (§8.7: البيئة جزءٌ من المجسّ).
  const clean = yaml
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  const at = clean.indexOf(`\n  ${event}:`);
  if (at < 0) return '';
  const rest = clean.slice(at + 1);
  const end = rest.slice(1).search(/\n {0,2}\S/) + 1;
  return end <= 0 ? rest : rest.slice(0, end);
}

const prBlock = (yaml: string) => eventBlock(yaml, 'pull_request');

/** كتلةُ `push:` — يُقرأ منها أن الدمجَ بلا تصفيةِ مسارات. */
export const pushBlock = (yaml: string) => eventBlock(yaml, 'push');

/** الأنواعُ المعلَنة — وغيابُ السطر يعني الافتراضيةَ الثلاث (وهي **لا** تشمل `ready_for_review`). */
export function declaredTypes(yaml: string): string[] {
  const m = prBlock(yaml).match(/^\s{4}types:\s*\[([^\]]*)\]/m);
  return m ? m[1].split(',').map((s) => s.trim()) : ['opened', 'synchronize', 'reopened'];
}

/** مساراتُ `push` — وغيابُها يعني «كلَّ دمجٍ يُفحص»، وهو ما صُحِّح في ق-٢٧٢. */
export function pushPaths(yaml: string): string[] | null {
  const block = pushBlock(yaml);
  if (!/^\s{4}paths:\s*$/m.test(block)) return null;
  return [...block.matchAll(/^\s{6}- '([^']+)'/gm)].map((m) => m[1]);
}

/** مساراتُ `pull_request` — وغيابُ `paths:` يعني «كلَّ مسار». */
export function declaredPaths(yaml: string): string[] | null {
  const block = prBlock(yaml);
  if (!/^\s{4}paths:\s*$/m.test(block)) return null;
  return [...block.matchAll(/^\s{6}- '([^']+)'/gm)].map((m) => m[1]);
}

/** هل يغطّي مسارٌ من القائمة هذا المدخلَ الجذريّ؟ */
export const covers = (paths: string[], entry: string) => paths.some((p) => p === entry || p.startsWith(`${entry}/`));

/** مداخلُ الجذر التي **يسمّيها** حارسٌ في `src/common` — مشتقّةٌ من القرص والمصدر معاً. */
export function namedRootEntries(): string[] {
  const specs = readdirSync(COMMON, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => readFileSync(join(COMMON, f), 'utf8'))
    .join('\n');
  return readdirSync(REPO_ROOT)
    .filter((e) => e !== 'node_modules' && e !== '.git')
    .filter((e) => specs.includes(`'${e}'`));
}

describe('تقسيمُ السير: الثقيلُ بمُشغِّلٍ على مسارات الشيفرة، والخفيفُ على كل دفع (ق-٢٤٥ · ق-٢٥٠ · ق-٢٥١)', () => {
  const heavy = readFileSync(HEAVY, 'utf8');
  const light = readFileSync(LIGHT, 'utf8');

  it('المُقسِّم والقارئون مُثبَتون بحالتَين لكلٍّ', () => {
    const sample = ['on:', '  push:', '    branches: [main]', '  pull_request:', '    types: [opened, ready_for_review]', '    paths:', "      - 'apps/**'", 'env:', '  A: b', 'jobs:', '  a:', '    runs-on: x', '    services:', '      db: {}', '  b:', '    runs-on: x', '    steps: []', ''].join('\n');
    const bare = sample.replace('    types: [opened, ready_for_review]\n', '').replace("    paths:\n      - 'apps/**'\n", '');
    const blocks = jobBlocks(sample);
    expect(blocks.map((b) => b.name)).toEqual(['a', 'b']);
    expect(isHeavy(blocks[0])).toBe(true);
    expect(isHeavy(blocks[1])).toBe(false);
    expect(declaredTypes(sample)).toEqual(['opened', 'ready_for_review']);
    expect(declaredTypes(bare)).toEqual(['opened', 'synchronize', 'reopened']);
    expect(declaredPaths(sample)).toEqual(['apps/**']);
    expect(declaredPaths(bare)).toBeNull();
    expect(covers(['docs/**'], 'docs')).toBe(true);
    expect(covers(['docsx/**'], 'docs')).toBe(false);
    // والقارئُ يعمل على `CRLF` كما على `LF` — الحالتان معروفتا النتيجة.
    expect(pushBlock(sample)).toContain('branches: [main]');
    expect(pushBlock(sample.replace(/\n/g, '\r\n'))).toContain('branches: [main]');
    // وقارئُ مسارات `push` مُثبَتٌ بحالتَين: معلَنةٌ تُقرأ، وغائبةٌ تعود فراغاً.
    const withPushPaths = ['on:', '  push:', '    branches: [main]', '    paths:', "      - 'apps/**'", '  pull_request:', '    types: [opened]', 'env:', '  A: b', ''].join('\n');
    expect(pushPaths(withPushPaths)).toEqual(['apps/**']);
    expect(pushPaths(sample)).toBeNull();
  });

  it('السطح غير فارغ — ثلاثُ وظائفٍ ثقيلة في ملفّها، واثنتان خفيفتان في ملفّهما', () => {
    expect(jobBlocks(heavy).map((j) => j.name).sort()).toEqual(['db-integration', 'nginx-cache', 'playwright']);
    expect(jobBlocks(light).map((j) => j.name).sort()).toEqual(['api-unit', 'vitest']);
  });

  it('🔴 كلُّ وظيفةٍ ثقيلة في الملفّ الثقيل، وكلُّ وظيفةٍ في الخفيف ليست ثقيلة', () => {
    expect(jobBlocks(heavy).filter((j) => !isHeavy(j)).map((j) => j.name)).toEqual([]);
    expect(jobBlocks(light).filter(isHeavy).map((j) => j.name)).toEqual([]);
  });

  it('🔴 مُشغِّلُ الثقيل: لا `synchronize`، ومساراتُ شيفرةٍ بلا وثائق، و`push` إلى `main` بالمسارات نفسها (ق-٢٧٢)', () => {
    expect(declaredTypes(heavy)).not.toContain('synchronize');
    expect(declaredTypes(heavy)).toContain('opened');
    const paths = declaredPaths(heavy) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    // وثائقيٌّ في مسارات الثقيل يُبطل «الوثائقيُّ عند الدمج وحده».
    expect(paths.filter((p) => p.endsWith('.md') || p.startsWith('docs/'))).toEqual([]);
    // ⚠️ (ق-٢٧٢) **«ما يصل `main` يُفحص بما يخصّه»** — تصحيحُ ق-٢٥١ بقياس: كان
    //    هنا «`push` **بلا** `paths`»، فدفع الدمجُ الوثائقيُّ ثقيلاً كاملاً بلا
    //    شيءٍ يُفحص (٤ من ١٥ دمجةً في يوم ≈ ٣٦ دقيقة). **والمساراتُ واحدةٌ لا
    //    قائمتان**: تطابقُ `push` و`pull_request` محروسٌ هنا، فقائمتان تفترقان يوماً.
    expect(pushBlock(heavy)).toContain('branches: [main]');
    expect(pushPaths(heavy)).toEqual(paths);
  });

  it('🔴 مُشغِّلُ الخفيف: `synchronize` معلَنةٌ، وكلُّ فعلٍ مسمّىً معلَنٌ، ويحمل tsc وبناءَ الويب و`concurrency`', () => {
    expect(declaredTypes(light)).toContain('synchronize');
    const lightText = jobBlocks(light).map((j) => j.body).join('\n');
    expect(lightText).toContain('npx tsc --noEmit -p tsconfig.json');
    expect(lightText).toContain('npm run build --workspace apps/web');
    expect(lightText).toContain("npx jest --roots '<rootDir>/src'");
    for (const yaml of [heavy, light]) {
      // `\s+` بين الأسطر لا `\n` — فالمستودع على ويندوز قد يحمل CRLF.
      expect(yaml).toMatch(/^concurrency:\s+group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s+cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/m);
    }
  });

  it('🔴 سطحُ التشغيل يغطّي سطحَ القراءة: كلُّ مدخلٍ جذريٍّ يسمّيه حارسٌ في `src/common` له مسارٌ في الخفيف', () => {
    const named = namedRootEntries();
    expect(named.length).toBeGreaterThan(3); // مجسٌّ يرى صفراً ليس مجسّاً
    const paths = declaredPaths(light) ?? [];
    expect(named.filter((e) => !covers(paths, e))).toEqual([]);
  });
});
