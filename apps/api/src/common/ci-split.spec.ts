import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `ق-٢٤٥` — **تقسيمُ السير بوّابةً لا تعليقاً**: الخفيفُ على كل دفع، والثقيلُ عند فتح
 * الطلب ودمجه وحده. حصةُ GitHub Actions المجانية نفدت في أسبوعٍ بخمس وظائفٍ على كل دفع.
 *
 * مشتقٌّ لا قائمة: **الوظيفةُ الثقيلة هي التي تحمل قاعدةً** (`services:`) **أو تبني
 * صورةً** (`docker build`) **أو تشغّل متصفّحاً** (`playwright`) — فيجب أن تحمل شرطَ
 * الحدث؛ **والوظيفةُ التي لا تحمل شيئاً من ذلك خفيفةٌ** فيجب ألّا تحمله — وإلا صار
 * الدفعُ بلا فحصٍ أصلاً. ويوجب `concurrency` كي لا تُنفَق دقائقُ تشغيلٍ تجاوزه دفعٌ أحدث.
 *
 * حدُّه المعلَن: يقرأ الملفَّ نصّاً بتقسيمه إلى كتل الوظائف؛ وظيفةٌ تُنشئ قاعدةً بطريقةٍ
 * لا تُسمّى `services:` ولا `docker` لا يراها — فتُوسَّع الإشارات لا القائمة.
 */
const WORKFLOW = join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'web-tests.yml');
const GATE = /if:\s*github\.event_name == 'push' \|\| contains\(fromJSON\('\["opened","reopened","ready_for_review"\]'\), github\.event\.action\)/;

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
export const hasGate = (job: JobBlock) => GATE.test(job.body);

/** الأفعالُ التي يسمّيها شرطُ الثقيل — تُقرأ من الشرط نفسه لا من قائمةٍ مكتوبة. */
export function gateActions(yaml: string): string[] {
  const m = yaml.match(/contains\(fromJSON\('\[([^\]]*)\]'\), github\.event\.action\)/);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

/** الأنواعُ المعلَنة تحت `pull_request:` — وغيابُ السطر يعني الافتراضيةَ الثلاث. */
export function declaredTypes(yaml: string): string[] {
  const at = yaml.indexOf('\n  pull_request:');
  if (at < 0) return [];
  const rest = yaml.slice(at + 1);
  const end = rest.search(/\n(?![ \t#])\S/);
  const block = end < 0 ? rest : rest.slice(0, end);
  const m = block.replace(/^\s*#.*$/gm, '').match(/^\s{4}types:\s*\[([^\]]*)\]/m);
  return m ? m[1].split(',').map((s) => s.trim()) : ['opened', 'synchronize', 'reopened'];
}

describe('تقسيمُ السير: الثقيلُ يحمل شرطَ الحدث والخفيفُ لا يحمله (ق-٢٤٥)', () => {
  const yaml = readFileSync(WORKFLOW, 'utf8');
  const jobs = jobBlocks(yaml);

  it('المُقسِّم مُثبَت بحالتَين: يفصل الكتل ويميّز الثقيل', () => {
    const sample = ['on: push', 'jobs:', '  a:', '    runs-on: x', '    services:', '      db: {}', '  b:', '    runs-on: x', '    steps: []', ''].join('\n');
    const blocks = jobBlocks(sample);
    expect(blocks.map((b) => b.name)).toEqual(['a', 'b']);
    expect(isHeavy(blocks[0])).toBe(true);
    expect(isHeavy(blocks[1])).toBe(false);
    expect(hasGate(blocks[0])).toBe(false);
  });

  it('السطح غير فارغ — خمسُ وظائف، ثلاثٌ ثقيلة', () => {
    expect(jobs.map((j) => j.name).sort()).toEqual(['api-unit', 'db-integration', 'nginx-cache', 'playwright', 'vitest']);
    expect(jobs.filter(isHeavy).map((j) => j.name).sort()).toEqual(['db-integration', 'nginx-cache', 'playwright']);
  });

  it('🔴 كل وظيفةٍ ثقيلة تحمل الشرط — وكل خفيفةٍ لا تحمله', () => {
    const wrong = jobs.filter((j) => isHeavy(j) !== hasGate(j)).map((j) => `${j.name}: heavy=${isHeavy(j)} gate=${hasGate(j)}`);
    expect(wrong).toEqual([]);
  });

  it('🔴 والخفيفُ يحمل tsc وبناءَ الويب، والملفُّ يحمل concurrency يُلغي تشغيلَ الطلب المتجاوَز لا تشغيلَ main', () => {
    const light = jobs.filter((j) => !isHeavy(j));
    const lightText = light.map((j) => j.body).join('\n');
    expect(lightText).toContain('npx tsc --noEmit -p tsconfig.json');
    expect(lightText).toContain('npm run build --workspace apps/web');
    // `\s+` بين الأسطر لا `\n` — فالمستودع على ويندوز قد يحمل CRLF، والشكلُ لا المسافةُ هو المحروس.
    expect(yaml).toMatch(/^concurrency:\s+group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s+cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/m);
  });

  // (ق-٢٤٧) الثقب الذي كاد يمرّ: الشرطُ يسمّي `ready_for_review` وهو **ليس من الأنواع
  // الافتراضية**، فبلا إعلانه لا يصل الحدثُ السيرَ — بوّابةٌ على بابٍ لا يُطرَق.
  it('قارئُ الأنواع والأفعال مُثبَت بحالتَين: معلَنةٌ تُقرأ، وغائبةٌ تعود للافتراضية', () => {
    const withTypes = ['on:', '  push:', '    branches: [main]', '  pull_request:', '    types: [opened, ready_for_review]', '    paths:', "      - 'x'", 'env:', '  A: b', ''].join('\n');
    const without = ['on:', '  push:', '    branches: [main]', '  pull_request:', '    paths:', "      - 'x'", 'env:', '  A: b', ''].join('\n');
    expect(declaredTypes(withTypes)).toEqual(['opened', 'ready_for_review']);
    expect(declaredTypes(without)).toEqual(['opened', 'synchronize', 'reopened']);
    expect(gateActions(`if: contains(fromJSON('["opened","reopened"]'), github.event.action)`)).toEqual(['opened', 'reopened']);
    expect(gateActions('if: always()')).toEqual([]);
  });

  it('🔴 كل فعلٍ يسمّيه الشرطُ الثقيل معلَنٌ في أنواع `pull_request` — و`synchronize` معلَنةٌ كي يعمل الخفيفُ على كل دفع', () => {
    const types = declaredTypes(yaml);
    const named = gateActions(yaml);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((a) => !types.includes(a))).toEqual([]);
    expect(types).toContain('synchronize');
  });
});
