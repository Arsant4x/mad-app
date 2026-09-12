#!/usr/bin/env node
/**
 * لا تُمسّ شجرةٌ تُقرأ — **حارسٌ لا وصيّة** (`ق-٦٢٦` · `ق-٦٣١`).
 *
 * ## الحادثة — مرّتين
 *
 * عُدِّل ملفُّ مصدرٍ **وحزمةُ الطرف إلى الطرف تعمل على الشجرة نفسِها**. فالتُقط
 * التعديلُ في منتصف التشغيل **وسقطت سبعةُ اختباراتٍ سليمة** — ومرّت `7/7` في
 * تشغيلٍ نظيف. **والحمرةُ تحت كتابةٍ متزامنة لا تُميَّز من انحدارٍ حقيقيّ**،
 * فتُشخَّص عبثاً. وهي الوجهُ الثالث للمورد المشترك (`ق-٥٩٣`): **ليس مزاحمةَ
 * معالجٍ ولا قاعدةً واحدةً — بل تغييرَ ما يُقرأ أثناء قراءته.**
 *
 * **وقعت مرّتين، ويومٌ واحدٌ لا يُنشئ عادة** — فما يُتذكَّر يُنسى.
 *
 * ## ما يمنعه بالضبط
 *
 * حين تكون **حزمةٌ قارئة** (`jest` · `vitest` · `playwright` · `tsc` · بناءٌ)
 * تعمل **على جذر المستودع نفسِه**:
 *   · **تحريرُ ملفٍّ تحت ذلك الجذر** (`Edit` · `Write` · `MultiEdit` · `NotebookEdit`).
 *   · **وأمرُ صدفةٍ يغيّر الشجرةَ أو ما تقرؤه**: `git checkout|switch|rebase|
 *     reset|stash|merge|pull` · `prisma generate|migrate|db push` · `npm install|ci`.
 *
 * والقراءةُ لا تُمنع: `git log` و`grep` و`cat` تمرّ. وتحريرُ ملفٍّ **في جذرٍ
 * آخر** يمرّ — فالقاعدةُ عن الشجرة التي تُقرأ لا عن كلّ شجرة.
 *
 * ## الشرطان (`ق-٦٣١`)
 *
 * **① يرفض ولا يصمت — ويسمّي الحزمةَ العاملة**: كلُّ رفضٍ يطبع معرّفَ العملية
 * وسطرَ أمرها، **فيُعرف ما يُنتظَر لا أنّ شيئاً يُنتظَر**.
 *
 * **② ومنفذُ تجاوزٍ معلَنٌ بأثرٍ يُسجَّل**: ملفُّ `.claude/allow-edit-while-reading`
 * يحمل سبباً في سطره الأول، **وينفذ عشرَ دقائق من آخر تعديلٍ له ثم يبطل** —
 * فمنفذٌ دائمٌ يعطّل الحارسَ صامتاً، وهو عينُ «لا شيء» الذي بُني ضدّه. وكلُّ
 * مرورٍ به **يُكتب سطراً** في `.claude/edit-while-reading.log` بالوقت والأداة
 * والملفّ والسبب والحزمة التي كانت تعمل — **والسجلُّ يُذكر في تقرير الجلسة**.
 *
 * ## حدُّه معلَن
 *
 * يقرأ العملياتِ من النظام (`Get-CimInstance` على ويندوز، `ps` على غيره).
 * **وإن تعذّر السؤالُ لم يدّعِ جواباً**: يطبع أنه لم يستطع أن يسأل، **ويسجّل
 * ذلك في السجلّ نفسِه**، ويمرّ — فتعذّرُ القياس حالةٌ ثالثةٌ تُعلَن، لا نفيٌ
 * ولا إثبات (`ق-٥٨٨`).
 */
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

/** ما يُعدّ قارئاً — أسماءٌ بحدود كلمات، وفي سياق `node` لا في أيّ عملية. */
const READER_NAME = /\b(jest|vitest|playwright|tsc|nest\s+build|vite\s+build)\b/i;
const NODE_CONTEXT = /\bnode(\.exe)?\b|\.m?js\b/i;

/** أوامرُ الصدفة التي تغيّر الشجرةَ أو ما تقرؤه الحزمة. */
const TREE_MUTATION = /\bgit\s+(checkout|switch|rebase|reset|stash|merge|pull|clean)\b|\bprisma\s+(generate|migrate|db\s+push)\b|\bnpm\s+(install|ci|i)\b|\bpnpm\s+(install|i)\b/;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const BYPASS_TTL_MS = 10 * 60 * 1000;

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // مُدخَل غير مفهوم ⇒ لا يُعطَّل العمل
}

const tool = String(payload?.tool_name ?? '');
const input = payload?.tool_input ?? {};

// ─── ما الذي يُمسّ، وأين جذرُه؟ ────────────────────────────────────────────
/** جذرُ المستودع: أقربُ مجلدٍ أعلى فيه `.git` (ملفاً أو مجلداً — فالشجراتُ الفرعية تحمله ملفاً). */
function repoRootOf(p) {
  let dir;
  try {
    dir = existsSync(p) && statSync(p).isDirectory() ? p : dirname(p);
  } catch {
    return null;
  }
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * ⚠️ **مجلدُ عمل الخطّاف ليس المستودع**: الجلسةُ تعمل من مجلدٍ بلا `.git`
 * (`Desktop/mad-app`) وكلُّ أمرٍ يبدأ بـ`cd /d/mad-app`. فلو قُرئ الجذرُ من
 * `cwd` وحدَه **لعمي حارسُ الصدفة عن كلّ أمرٍ صامتاً** — وهو عينُ ما نهى عنه
 * `ق-٤٤٩`: صفرٌ بلا إثباتِ آليةٍ عمىً. ⇒ **فتُقرأ الجذورُ من نصّ الأمر نفسِه**:
 * كلُّ مسارٍ مطلقٍ فيه، بصيغة `MSYS` (`/d/mad-app`) أو ويندوز (`D:\mad-app`).
 */
function rootsFromCommand(cmd) {
  const roots = new Set();
  const add = (p) => {
    const r = repoRootOf(resolve(p));
    if (r) roots.add(r);
  };
  if (process.platform === 'win32') {
    // صيغةُ `MSYS` (`/d/mad-app`) وصيغةُ ويندوز (`D:\mad-app` أو `D:/mad-app`).
    for (const m of cmd.matchAll(/(?<![\w:])\/([a-zA-Z])\/([^\s'"&|;()]+)/g)) add(`${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`);
    for (const m of cmd.matchAll(/\b([A-Za-z]):[\\/]([^\s'"&|;()]+)/g)) add(`${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`);
  } else {
    // ⚠️ **ومسارٌ مطلقٌ عاديٌّ على غير ويندوز** (`/home/dev/mad-app` · `/tmp/…`):
    //    أمسكه السيرُ على لينكس — كانت الصيغتان أعلاه وحدَهما، **فحارسُ الصدفة
    //    كان أعمى على كلّ مضيفٍ غير ويندوز** ولم يُرَ ذلك على جهاز التطوير.
    for (const m of cmd.matchAll(/(?<![\w:.])\/[^\s'"&|;()]+/g)) add(m[0]);
  }
  add(process.cwd());
  return [...roots];
}

let roots = [];
let what = '';
if (EDIT_TOOLS.has(tool)) {
  const fp = input.file_path ?? input.notebook_path;
  if (typeof fp !== 'string' || !fp) process.exit(0);
  const r = repoRootOf(resolve(fp));
  if (r) roots = [r];
  what = `${tool} → ${fp}`;
} else if (tool === 'Bash') {
  const cmd = String(input.command ?? '');
  if (!TREE_MUTATION.test(cmd)) process.exit(0); // أمرٌ قارئ — يمرّ بلا مسح
  roots = rootsFromCommand(cmd);
  what = `Bash → ${cmd.slice(0, 140)}`;
} else {
  process.exit(0);
}

if (roots.length === 0) process.exit(0); // خارج أيّ مستودع — ليس شأنَ هذا الحارس

// ─── من يقرأ هذه الشجرة الآن؟ ──────────────────────────────────────────────
const rootNorms = roots.map((r) => r.replace(/\\/g, '/').toLowerCase());
/** قارئٌ لأحد الجذور: اسمُ حزمةٍ بحدود كلمة، في سياق `node`، وسطرُ أمره يحمل الجذر. */
const isReaderOfRoot = (cmd) => {
  if (!READER_NAME.test(cmd) || !NODE_CONTEXT.test(cmd)) return false;
  const c = cmd.replace(/\\/g, '/').toLowerCase();
  return rootNorms.some((r) => c.includes(r));
};

/**
 * مهلةُ سؤال النظام عن العمليات — **رقمٌ مقيس لا مريح** (`ق-٦٦٠`).
 *
 * كانت `8 s` تقديراً. والقياس (2026-09-12، ويندوز، `Get-CimInstance Win32_Process`):
 *   خاملاً                          0.47–0.51 s
 *   تحت ثمانية عمّال `jest`        4.65–12.0 s (سؤالٌ واحد)
 *   ثلاثةُ أسئلةٍ متزامنة تحته     13.9–31.1 s · والأسوأ المرصود 35.4 s
 * **فسقط الحارسُ في 2 من 4 تشغيلاتٍ للحزمة الكاملة بـ`ETIMEDOUT` ومرّ التعديلُ بلا
 * حكم** — في اللحظة التي بُني ليغلقها. المهلةُ الآن تغطّي الأسوأَ المرصودَ بهامش
 * `1.7×`؛ **والمرورُ عند التعذّر يبقى معلِناً** (قرارُ فتحه أو إغلاقه للمالك).
 */
const SCAN_TIMEOUT_MS = 60_000;

/** يعيد `{ ok: true, readers: [{pid, cmd}] }` أو `{ ok: false, error }` — ولا يخترع جواباً. */
function scanReaders() {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'],
      { encoding: 'utf8', timeout: SCAN_TIMEOUT_MS, windowsHide: true },
    );
    if (r.status !== 0 || !r.stdout) return { ok: false, error: (r.stderr || r.error?.message || `exit ${r.status}`).trim() };
    let list;
    try {
      list = JSON.parse(r.stdout);
    } catch (e) {
      return { ok: false, error: `unparseable process list: ${e.message}` };
    }
    const rows = Array.isArray(list) ? list : [list];
    return {
      ok: true,
      readers: rows
        .filter((p) => typeof p?.CommandLine === 'string' && isReaderOfRoot(p.CommandLine))
        .map((p) => ({ pid: p.ProcessId, cmd: p.CommandLine })),
    };
  }

  const r = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: SCAN_TIMEOUT_MS });
  if (r.status !== 0 || !r.stdout) return { ok: false, error: (r.stderr || r.error?.message || `exit ${r.status}`).trim() };
  const readers = r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d+)\s+(.*)$/);
      return m ? { pid: Number(m[1]), cmd: m[2] } : null;
    })
    .filter((p) => p && isReaderOfRoot(p.cmd));
  return { ok: true, readers };
}

// السجلُّ والمنفذُ في الجذر الأول — وهو جذرُ الملفّ المحرَّر أو أولُ جذرٍ في الأمر.
const root = roots[0];
const LOG = join(root, '.claude', 'edit-while-reading.log');
const MARKER = join(root, '.claude', 'allow-edit-while-reading');

// كلُّ سطرٍ في السجلّ يحمل زمنَ السؤال (`scanMs`) — فالمهلةُ تُقاس من الأثر لا من مختبر.
const scanStartedAt = Date.now();
function trace(kind, extra) {
  const line = JSON.stringify({ at: new Date().toISOString(), kind, tool, what, scanMs: Date.now() - scanStartedAt, ...extra });
  try {
    appendFileSync(LOG, line + '\n', 'utf8');
  } catch {
    /* السجلُّ أثرٌ لا بوّابة — تعذّرُه لا يوقف الحكم */
  }
}

const scan = scanReaders();
if (!scan.ok) {
  // تعذّرُ السؤال يُعلَن ويُسجَّل — ولا يُقرأ نفياً.
  trace('scan-failed', { error: scan.error });
  console.error(`⚠️ حارسُ «لا تُمسّ شجرةٌ تُقرأ» لم يستطع أن يسأل النظامَ عن العمليات (${scan.error}) — مرّ التعديلُ بلا حكم، وسُجّل ذلك في ${LOG}`);
  process.exit(0);
}

if (scan.readers.length === 0) process.exit(0); // لا قارئ ⇒ لا مانع

const named = scan.readers.map((p) => `  · [${p.pid}] ${p.cmd.length > 220 ? p.cmd.slice(0, 220) + '…' : p.cmd}`).join('\n');

// ─── المنفذُ المعلَن — بسببٍ وأجلٍ وأثر ─────────────────────────────────────
if (existsSync(MARKER)) {
  const ageMs = Date.now() - statSync(MARKER).mtimeMs;
  const reason = (readFileSync(MARKER, 'utf8').split(/\r?\n/)[0] ?? '').trim();
  if (ageMs <= BYPASS_TTL_MS && reason) {
    trace('bypassed', { reason, readers: scan.readers.map((p) => p.pid) });
    console.error(`⚠️ مرّ التعديلُ بالمنفذ المعلَن — السبب: «${reason}» — والحزمةُ العاملة:\n${named}\nوسُجّل الأثرُ في ${LOG}`);
    process.exit(0);
  }
  const why = !reason ? 'بلا سببٍ في سطره الأول' : `عمرُه ${Math.round(ageMs / 60000)} دقيقة والأجلُ عشر`;
  console.error(`⛔ منفذُ التجاوز موجودٌ لكنه باطل (${why}) — يُعاد كتابتُه بسببٍ ليُحسب.`);
}

// ─── الرفض — بالاسم ─────────────────────────────────────────────────────────
trace('refused', { readers: scan.readers.map((p) => p.pid) });
console.error(
  `⛔ لا تُمسّ شجرةٌ تُقرأ (ق-٦٢٦): ${what}\n` +
    `الجذرُ ${roots.join(' · ')} تقرؤه الآن ${scan.readers.length === 1 ? 'حزمةٌ واحدة' : `${scan.readers.length} حزم`}:\n${named}\n` +
    `انتظر انتهاءها ثم أعد التعديل. وإن لزم التحريرُ الآن فاكتب السببَ في السطر الأول من\n` +
    `${MARKER}\n(ينفذ عشرَ دقائق ويُسجَّل كلُّ مرورٍ به في ${LOG}).`,
);
process.exit(2); // 2 = رفضٌ يُعاد إلى النموذج مع السبب
