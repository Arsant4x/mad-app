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

const HOOK = resolve(import.meta.dirname, 'block-shell-text-writes.mjs').replace(/\\/g, '/');
const SETTINGS_DIR = join(homedir(), '.claude');
const SETTINGS = join(SETTINGS_DIR, 'settings.json');
const COMMAND = `node ${HOOK}`;

if (!existsSync(HOOK)) {
  console.error(`⛔ ملف البوّابة غير موجود: ${HOOK}`);
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

const already = settings.hooks.PreToolUse.some((entry) =>
  entry?.matcher === 'Bash' && (entry.hooks ?? []).some((h) => String(h?.command ?? '').includes('block-shell-text-writes.mjs')),
);

if (already) {
  console.log('✅ الربط قائمٌ على مستوى المستخدم — لا تغيير.');
  process.exit(0);
}

settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: COMMAND }] });
writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

// **يُقرأ ما كُتب** — «نجح الأمر» ليس دليلاً على أن الناتج صحيح.
const back = JSON.parse(readFileSync(SETTINGS, 'utf8'));
const wired = (back.hooks?.PreToolUse ?? []).some((entry) =>
  (entry.hooks ?? []).some((h) => String(h?.command ?? '').includes('block-shell-text-writes.mjs')),
);
console.log(wired ? `✅ رُبطت البوّابة في ${SETTINGS}\n   ${COMMAND}` : '⛔ كُتب الملف ولم يظهر الربط عند القراءة');
process.exit(wired ? 0 : 1);
