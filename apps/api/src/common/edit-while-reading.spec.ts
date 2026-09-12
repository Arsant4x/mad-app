import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): ما يُقرأ هنا **مخرَجُ الخطّاف وسطورُ
// سجلّه** — رسالةُ الرفض بالاسم، وسطرُ `bypassed` بالسبب — وهي نصٌّ هو البيانات،
// لا شيفرةٌ تُجرَّد. (والملفُّ لا يمسح `.ts` أصلاً — لكنّ حارسَ الإعلان يراه
// قارئاً ومطابِقاً فيطلب الإعلان، **وإعلانٌ واعٍ خيرٌ من استثناء**.)
readsDeclaredStrings();

/**
 * ⭐ حارسُ «لا تُمسّ شجرةٌ تُقرأ» — **يُثبَت بالتشغيل لا بالقراءة** (`ق-٦٢٦` · `ق-٦٣١`).
 *
 * ## لماذا يُشغَّل الخطّافُ نفسُه
 *
 * `hooks-present.spec.ts` يحرس **وجودَ** البوّابة لا **صحّتَها** — وهو تمييزُ
 * «مكتوبة» عن «تعمل». وهذا الملفّ يُكمله: **يبني مستودعاً مؤقّتاً، ويُطلق قارئاً
 * مزيَّفاً يحمل جذرَه في سطر أمره، ثم يمرّر للخطّاف الحقيقيّ الحمولةَ التي يمرّرها
 * المُشغِّل** — ويقرأ حكمَه وسببَه وأثرَه.
 *
 * ## والحالتان المعلومتان قبل الثقة (`ق-٤٤٩`)
 *
 * لا قارئ ⇒ يمرّ · قارئٌ ⇒ يرفض **ويسمّيه**. وبينهما: أمرٌ قارئ يمرّ ولو
 * كان القارئُ يعمل، وتحريرُ جذرٍ آخر يمرّ، والمنفذُ يمرّ بأثرٍ إن كان حيّاً
 * ويبطل إن شاخ.
 *
 * ⚠️ **ومستودعٌ مؤقّتٌ لا هذا المستودع**: فالحزمةُ التي تشغّل هذا الاختبار
 * قارئةٌ لهذه الشجرة، **ولو اختُبر «لا قارئ» عليها لما وُجد قطّ** — ولا يُكتب
 * منفذٌ في `.claude/` الحقيقيّ أثناء تشغيلٍ حقيقيّ.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const HOOK = join(REPO, '.claude', 'hooks', 'block-edit-while-reading.mjs');

type Verdict = { status: number | null; stderr: string };

function runHook(payload: unknown, cwd: string): Verdict {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', cwd, timeout: 30000 });
  return { status: r.status, stderr: r.stderr ?? '' };
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

describe('حارسُ «لا تُمسّ شجرةٌ تُقرأ» (ق-٦٣١)', () => {
  let root: string;
  let reader: ReturnType<typeof spawn> | null = null;
  const editInRoot = () => ({ tool_name: 'Edit', tool_input: { file_path: join(root, 'src', 'x.ts'), old_string: 'a', new_string: 'b' } });

  beforeAll(async () => {
    root = mkdtemp('mad-app-ewr-');
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, '.claude'));
    mkdirSync(join(root, 'src'));
    // ⚠️ القارئُ المزيَّف يحمل الجذرَ **بشرطة مائلة أمامية**: فالسطرُ الذي يراه
    //    النظام يُقارَن بعد توحيد الشرطات، ومسارٌ بشرطاتٍ خلفية عبر صدفةٍ يفقدها.
    reader = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 90000)', '--', 'jest', root.replace(/\\/g, '/')], { stdio: 'ignore', windowsHide: true });
    await sleep(700); // حتى يظهر في قائمة العمليات
  }, 30000);

  afterAll(() => {
    reader?.kill();
    rmSync(root, { recursive: true, force: true });
  });

  function mkdtemp(prefix: string): string {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  it('🔴 قارئٌ يعمل + تحريرٌ في جذره ⇒ يرفض بـexit 2 ويسمّي العملية', () => {
    const v = runHook(editInRoot(), root);
    expect(v.status).toBe(2);
    expect(v.stderr).toContain('لا تُمسّ شجرةٌ تُقرأ');
    expect(v.stderr).toContain(String(reader!.pid)); // **بالاسم** — لا «شيءٌ يعمل»
    expect(v.stderr).toContain('jest');
    // والأثرُ مكتوب
    const log = readFileSync(join(root, '.claude', 'edit-while-reading.log'), 'utf8');
    expect(log).toContain('"kind":"refused"');
  });

  it('🔴 قارئٌ يعمل + أمرُ صدفةٍ يغيّر الشجرة ⇒ يرفض — والجذرُ يُقرأ من نصّ الأمر لا من مجلد العمل', () => {
    // مجلدُ العمل مجلدٌ مؤقّتٌ **بلا `.git`** — كما في الجلسة الحقيقية — فلو
    // قُرئ الجذرُ منه لعمي الحارس. والمسارُ في الأمر كما يُكتب فعلاً على كلّ
    // مضيف: بصيغة MSYS على ويندوز (`/c/Users/…`)، ومطلقاً عادياً على غيره
    // (`/tmp/…`) — ⚠️ **وأمسك السيرُ على لينكس أن الصيغةَ الثانية لم تكن تُقرأ**.
    const shellPath = /^[A-Za-z]:/.test(root) ? '/' + root.replace(/^([A-Za-z]):/, (_m, d: string) => d.toLowerCase()).replace(/\\/g, '/') : root;
    const v = runHook({ tool_name: 'Bash', tool_input: { command: `cd ${shellPath} && git checkout main 2>&1 | tail -1` } }, tmpdir());
    expect(v.status).toBe(2);
    expect(v.stderr).toContain(String(reader!.pid));
  });

  it('قارئٌ يعمل + أمرُ صدفةٍ قارئ ⇒ يمرّ بلا مسح', () => {
    const v = runHook({ tool_name: 'Bash', tool_input: { command: `cd ${root} && git log --oneline -3 && grep -rn foo src/` } }, tmpdir());
    expect(v.status).toBe(0);
  });

  it('قارئٌ يعمل + تحريرٌ في جذرٍ آخر ⇒ يمرّ — فالقاعدةُ عن الشجرة التي تُقرأ', () => {
    const other = mkdtemp('mad-app-ewr-other-');
    try {
      mkdirSync(join(other, '.git'));
      const v = runHook({ tool_name: 'Write', tool_input: { file_path: join(other, 'note.md'), content: 'x' } }, other);
      expect(v.status).toBe(0);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('⚠️ منفذٌ حيٌّ بسبب ⇒ يمرّ ويكتب الأثرَ بالسبب وبالقارئ', () => {
    const marker = join(root, '.claude', 'allow-edit-while-reading');
    writeFileSync(marker, 'إصلاحُ سطرٍ يمنع الحزمةَ من الاكتمال\n', 'utf8');
    try {
      const v = runHook(editInRoot(), root);
      expect(v.status).toBe(0);
      expect(v.stderr).toContain('المنفذ المعلَن');
      const last = readFileSync(join(root, '.claude', 'edit-while-reading.log'), 'utf8').trim().split('\n').pop() ?? '';
      const entry = JSON.parse(last) as { kind: string; reason: string; readers: number[] };
      expect(entry.kind).toBe('bypassed');
      expect(entry.reason).toBe('إصلاحُ سطرٍ يمنع الحزمةَ من الاكتمال');
      expect(entry.readers).toContain(reader!.pid);
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it('⛔ منفذٌ شاخ (أكثر من عشر دقائق) ⇒ يبطل ويُرفض التحرير', () => {
    const marker = join(root, '.claude', 'allow-edit-while-reading');
    writeFileSync(marker, 'سببٌ قديم\n', 'utf8');
    const old = new Date(Date.now() - 11 * 60 * 1000);
    utimesSync(marker, old, old);
    try {
      const v = runHook(editInRoot(), root);
      expect(v.status).toBe(2);
      expect(v.stderr).toContain('باطل');
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it('⛔ منفذٌ بلا سببٍ في سطره الأول ⇒ باطل', () => {
    const marker = join(root, '.claude', 'allow-edit-while-reading');
    writeFileSync(marker, '\n', 'utf8');
    try {
      const v = runHook(editInRoot(), root);
      expect(v.status).toBe(2);
      expect(v.stderr).toContain('بلا سببٍ');
    } finally {
      rmSync(marker, { force: true });
    }
  });

  /**
   * ⚠️ **تعذّرُ السؤال يبقى مفتوحاً — بإعلانٍ صاخبٍ وعدّ** (`ق-٦٦٩`).
   *
   * التعذّرُ يُصنَع بلا بابٍ خلفيّ: `PATH` فارغٌ فلا يُوجد `powershell` ولا `ps`
   * (`spawnSync` يعود بـ`ENOENT`) — وهو عينُ ما يقع حين تتجاوز الأداةُ مهلتَها.
   * فيُقاس أن الحارس **يقول إنه لم يحكم** (لافتةٌ لا سطرُ سجلّ)، **ويعدّ**: الأولى
   * `اليوم: 1`، والثانية `اليوم: 2` — فالتكرارُ يُرى لا يُستنتَج.
   */
  it('⚠️ تعذّرُ سؤال النظام ⇒ يمرّ بلافتةٍ صاخبة تقول «لم يحكم» وتعدّ التعذّرات — والعدُّ ينمو', () => {
    const noTools = { ...process.env, PATH: '', Path: '' };
    const first = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(editInRoot()), encoding: 'utf8', cwd: root, timeout: 30000, env: noTools });
    expect(first.status).toBe(0);
    expect(first.stderr).toContain('لم يحكم');
    expect(first.stderr).toContain('╔'); // لافتةٌ لا سطر
    expect(first.stderr).toContain('التعذّراتُ اليوم: 1 · الإجمال: 1');
    const entries = readFileSync(join(root, '.claude', 'edit-while-reading.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; scanMs?: number; error?: string });
    const failed = entries.filter((e) => e.kind === 'scan-failed');
    expect(failed).toHaveLength(1);
    expect(typeof failed[0].scanMs).toBe('number');
    expect(failed[0].error).toContain('ENOENT');

    const second = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(editInRoot()), encoding: 'utf8', cwd: root, timeout: 30000, env: noTools });
    expect(second.status).toBe(0);
    expect(second.stderr).toContain('التعذّراتُ اليوم: 2 · الإجمال: 2');
  });

  it('لا قارئ ⇒ يمرّ — الحالةُ الثانية المعلومة', async () => {
    reader!.kill();
    reader = null;
    await sleep(700);
    const v = runHook(editInRoot(), root);
    expect(v.status).toBe(0);
    expect(v.stderr).toBe('');
  }, 15000);

  it('الملفُّ موجودٌ ومربوطٌ على المحرِّرات وعلى Bash في settings.json', () => {
    expect(existsSync(HOOK)).toBe(true);
    const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8')) as { hooks?: { PreToolUse?: { matcher?: string; hooks?: { command?: string }[] }[] } };
    const pre = settings.hooks?.PreToolUse ?? [];
    const wiredOn = (matcher: string) => pre.some((e) => e.matcher === matcher && (e.hooks ?? []).some((h) => (h.command ?? '').includes('block-edit-while-reading.mjs')));
    expect(wiredOn('Bash')).toBe(true);
    expect(wiredOn('Edit|Write|MultiEdit|NotebookEdit')).toBe(true);
  });
});
