#!/usr/bin/env node
/**
 * ⭐ **يربط بوّابات المستودع على مستوى المستخدم** — `ق-١٤٩`.
 *
 * ## العطل الذي يعالجه — مقيسٌ لا مفترَض
 *
 * البوّابة (`block-shell-text-writes.mjs`) كانت **مبنيّةً وصحيحة منذ
 * 2026-08-15**، وربطُها في `‎.claude/settings.json` **بمسارٍ نسبيّ**:
 *
 *     "command": "node .claude/hooks/block-shell-text-writes.mjs"
 *
 * والمسار النسبيّ يعني أن الربط **لا يُقرأ إلا في جلسةٍ جذرُها المستودع**.
 * وجلسةُ 2026-09-04 كان جذرها `C:/Users/mnqad/Desktop/mad-app` — مجلَّدٌ آخر
 * فيه `‎.claude/` بلا خطّافات. **فوقعت الحادثة الرابعة والبوّابة قائمة**:
 * `gh pr create --body "…"` بعلاماتٍ خلفية، فنفّذت الصدفة ما بينها.
 *
 * ⬅️ **بوّابةٌ صحيحة في نطاقٍ لا يشمل الفاعل = لا بوّابة** (`ق-١٤٨`).
 *
 * ## ما يفعله
 *
 * يضيف الربط إلى `~/.claude/settings.json` **بمسارٍ مطلق**، فلا يعود جذرُ
 * الجلسة شرطاً. **ولا يمسّ ما سواه** في الملف، ولا يكرّر ربطاً قائماً.
 *
 * ## ⚠️ وحدّه معلَن
 *
 * إعداداتُ المستخدم **خارج المستودع** — فلا يحرسها اختبار. وهذا السكربت
 * **يجعل الإصلاح قابلاً للتكرار** على جهازٍ جديد بأمرٍ واحد، ولا يجعله
 * مضموناً. والحارس الوحيد المتاح هو تشغيله: `node .claude/hooks/install-user-hooks.mjs`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * ⭐ **البوّاباتُ تُقرأ من ملفّ الإعدادات المتتبَّع لا من قائمةٍ هنا** (`ق-٦٣١`).
 *
 * كان هذا الملفُّ يعرف بوّابةً واحدةً بالاسم. ولمّا أُضيفت ثانية (`block-edit-while-reading`)
 * صار أمامنا أن نكتب اسمها هنا أيضاً — **قائمةٌ ثانية تفترق عن الأولى يوماً**
 * فتُربط بوّابةٌ ولا تُربط أختُها **صامتةً**. ⇒ فيُقرأ ربطُ كلّ بوّابةٍ ومطابِقُها
 * من `.claude/settings.json` نفسِه، **ويُحوَّل مسارُها النسبيّ إلى مطلق** — لا أكثر.
 */
const HOOKS_DIR = resolve(import.meta.dirname).replace(/\\/g, '/');
const REPO_SETTINGS = resolve(import.meta.dirname, '..', 'settings.json');
const SETTINGS_DIR = join(homedir(), '.claude');
const SETTINGS = join(SETTINGS_DIR, 'settings.json');

const repo = JSON.parse(readFileSync(REPO_SETTINGS, 'utf8'));
/** `[{ matcher, command(absolute), file }]` — لكلّ أمرٍ في كلّ مطابِق. */
const wanted = [];
for (const entry of repo.hooks?.PreToolUse ?? []) {
  for (const h of entry.hooks ?? []) {
    const m = String(h.command ?? '').match(/^node\s+\.claude\/hooks\/([\w.-]+\.mjs)$/);
    if (!m) continue;
    const file = m[1];
    if (!existsSync(join(HOOKS_DIR, file))) {
      console.error(`⛔ ملف البوّابة غير موجود: ${join(HOOKS_DIR, file)}`);
      process.exit(1);
    }
    wanted.push({ matcher: entry.matcher, command: `node ${HOOKS_DIR}/${file}`, file });
  }
}
if (wanted.length === 0) {
  console.error(`⛔ لا بوّابةَ مربوطةً في ${REPO_SETTINGS} — لا شيءَ يُثبَّت.`);
  process.exit(1);
}

mkdirSync(SETTINGS_DIR, { recursive: true });

let settings = {};
if (existsSync(SETTINGS)) {
  try {
    settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  } catch (e) {
    // ⚠️ ملفٌّ تالف **لا يُستبدل**: إعدادات المستخدم ليست ملكنا.
    console.error(`⛔ ${SETTINGS} غير صالح — أصلحه يدوياً ثم أعد التشغيل.\n${String(e)}`);
    process.exit(1);
  }
}

settings.hooks ??= {};
settings.hooks.PreToolUse ??= [];

let added = 0;
for (const w of wanted) {
  const present = settings.hooks.PreToolUse.some(
    (entry) => entry?.matcher === w.matcher && (entry.hooks ?? []).some((h) => String(h?.command ?? '').includes(w.file)),
  );
  if (present) continue;
  let entry = settings.hooks.PreToolUse.find((e) => e?.matcher === w.matcher);
  if (!entry) {
    entry = { matcher: w.matcher, hooks: [] };
    settings.hooks.PreToolUse.push(entry);
  }
  entry.hooks ??= [];
  entry.hooks.push({ type: 'command', command: w.command });
  added += 1;
}

if (added === 0) {
  console.log(`✅ الربطُ قائمٌ على مستوى المستخدم لكلّ البوّابات (${wanted.length}) — لا تغيير.`);
  process.exit(0);
}

writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

// **يُقرأ ما كُتب** — «نجح الأمر» ليس دليلاً على أن الناتج صحيح.
const back = JSON.parse(readFileSync(SETTINGS, 'utf8'));
const missing = wanted.filter(
  (w) => !(back.hooks?.PreToolUse ?? []).some((entry) => entry?.matcher === w.matcher && (entry.hooks ?? []).some((h) => String(h?.command ?? '').includes(w.file))),
);
if (missing.length) {
  console.log(`⛔ كُتب الملف ولم يظهر عند القراءة: ${missing.map((w) => `${w.matcher} → ${w.file}`).join(' · ')}`);
  process.exit(1);
}
console.log(`✅ رُبطت ${added} بوّابة/بوّابات في ${SETTINGS}:\n${wanted.map((w) => `   [${w.matcher}] ${w.command}`).join('\n')}`);
process.exit(0);
