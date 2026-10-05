import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * حارسُ فحص التوقيع على GitHub (`ops/ci/attribution-check.mjs` · السيرُ `attribution.yml`).
 *
 * القاعدةُ الدائمة ٤١ (`ق-١٦٤٣`) وبوّابتُها الثالثة بحكم `ق-١٦٤٥`/٤: الخطّافُ لا يرى عنوانَ الطلب
 * ولا وصفَه ولا رسالةَ الدمج المضغوط، فالسكربتُ يقرأها من حدث السير. وهذا الحارسُ يشغّله فعلاً على
 * أحداثٍ مصنوعة: حالاتٌ يجب أن تُسقطه، وأخرى يجب أن يمرّ عليها؛ ويُثبت أن النمطَ يُقرأ من الخطّاف
 * وأن السيرَ يستدعيه بالمسار نفسِه.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO, 'ops', 'ci', 'attribution-check.mjs');

// أسطرُ التوقيع تُبنى بدالّةٍ لا تُكتب حرفياً، كي لا يحملها هذا الملفُّ نصّاً يُنسخ إلى رسالة.
const sig = {
  co: () => ['Co', 'Authored', 'By: Someone <a@b.c>'].join('-'),
  session: () => ['Claude', 'Session: 0f1e2d3c'].join('-'),
  tool: () => 'Generated with [' + 'Claude Code](https://example.invalid)',
};

function run(event: object, commits?: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'attr-'));
  try {
    const ev = join(dir, 'event.json');
    writeFileSync(ev, JSON.stringify(event));
    const args = [SCRIPT, ev];
    if (commits) {
      const c = join(dir, 'commits.jsonl');
      writeFileSync(c, commits.map((m) => JSON.stringify(m)).join('\n') + '\n');
      args.push(c);
    }
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pr = (title: string, body: string) => ({ pull_request: { title, body } });

describe('لا توقيعَ فيما يُكتب على GitHub — القاعدة ٤١ (ق-١٦٤٥/٤)', () => {
  it('النمطُ يُقرأ من الخطّاف نفسِه، والسيرُ يستدعي السكربتَ بمساره', () => {
    const hook = readFileSync(join(REPO, '.githooks', 'commit-msg'), 'utf8');
    expect(hook).toMatch(/^PATTERN='[^']+'$/m);
    expect(readFileSync(SCRIPT, 'utf8')).toContain("readFileSync(new URL('../../.githooks/commit-msg'");
    const wf = readFileSync(join(REPO, '.github', 'workflows', 'attribution.yml'), 'utf8');
    expect(wf).toContain('node ops/ci/attribution-check.mjs "$GITHUB_EVENT_PATH"');
    expect(wf).toMatch(/types: \[[^\]]*\bedited\b[^\]]*\]/); // تعديلُ الوصف يُشغّله
    expect(wf).toMatch(/push:\s*\n\s*branches: \[main\]/); // ورسالةُ الدمج على main
  });

  it('⭐ يُسقط على سطر توقيعٍ في الوصف والعنوان والتزامات الطلب ورسالة الدمج', () => {
    expect(run(pr('عنوان', `وصفٌ واضح\n\n${sig.tool()}`)).code).toBe(1);
    expect(run(pr(`عنوان ${sig.tool()}`, 'وصف')).code).toBe(1);
    expect(run(pr('عنوان', 'وصف'), ['fix: شيء', `fix: آخر\n\n${sig.session()}`]).code).toBe(1);
    const merged = run({ commits: [{ id: 'abcdef1234', message: `docs: x (#1)\n\n${sig.co()}` }] });
    expect(merged.code).toBe(1);
    expect(merged.out).toContain('الالتزام abcdef12');
  });

  it('يمرّ على النصّ الواضح، وعلى ذكر الاسم في وسط السطر', () => {
    const r = run(pr('عنوان', `وصفٌ يذكر ${sig.co()} في وسطه لا في أوّله`), ['fix: شيء']);
    expect(r).toEqual({ code: 0, out: expect.stringContaining('checked=3 problems=0') });
    expect(run({ commits: [{ id: 'a', message: 'docs: x (#1)\n\nنصٌّ واضح.' }] }).code).toBe(0);
    expect(run(pr('عنوان', null as unknown as string)).code).toBe(0); // وصفٌ فارغ
  });

  it('حدثٌ بلا طلبٍ ولا التزامات لا حكمَ فيه', () => {
    expect(run({ ref: 'x' }).code).toBe(2);
  });
});
