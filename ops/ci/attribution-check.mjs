// ⛔ لا توقيعَ للوكيل فيما يُكتب على GitHub (القاعدةُ الدائمة ٤١ · `ق-١٦٤٣` · بوّابتُه بحكم `ق-١٦٤٥`/٤).
//
// خطّافُ `.githooks/commit-msg` يحذف أسطرَ التوقيع من رسالة الالتزام المحلّية، ولا يرى ما يُكتب على
// GitHub: عنوانَ الطلب ووصفَه، ورسالةَ الدمج المضغوط. وهذا السكربتُ يقرأ حدثَ السير
// (`$GITHUB_EVENT_PATH`) فيُسقط الوظيفةَ إن حمل أحدُها سطراً من الأصناف الثلاثة:
//
//   حدثُ الطلب  ⟸ العنوان · الوصف · رسائلُ التزاماته (ملفٌّ ثانٍ اختياريّ، سطرٌ لكلِّ رسالةٍ بصيغة JSON)
//   الدفعُ إلى main ⟸ رسائلُ الالتزامات فيه، ومنها رسالةُ الدمج المضغوط
//
// والنمطُ **يُقرأ من الخطّاف نفسِه** (سطر `PATTERN='…'`) فلا يفترق المصدران؛ و`[[:space:]]` يصير `\s`.
//
// ⚠️ وحدُّه: رسالةُ الدمج تُكتب لحظةَ الدمج فلا تُفحص قبله؛ يُسقط سيرُ `main` بعده فيُرى، ولا يمنعه.
//
// الاستعمال: node ops/ci/attribution-check.mjs <event.json> [commits.jsonl]
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../../.githooks/commit-msg', import.meta.url), 'utf8');
const src = hook.match(/^PATTERN='([^']+)'$/m)?.[1];
if (!src) {
  console.error('✖ لم يُقرأ سطرُ PATTERN من .githooks/commit-msg — لا حكم');
  process.exit(2);
}
const PATTERN = new RegExp(src.replace(/\[\[:space:\]\]/g, '\\s'), 'i');

export function offendingLines(text) {
  return String(text ?? '').split(/\r?\n/).filter((l) => PATTERN.test(l));
}

const [eventPath, commitsPath] = process.argv.slice(2);
if (!eventPath) {
  console.error('usage: node ops/ci/attribution-check.mjs <event.json> [commits.jsonl]');
  process.exit(2);
}
const event = JSON.parse(readFileSync(eventPath, 'utf8'));
const texts = [];
if (event.pull_request) {
  texts.push(['عنوانُ الطلب', event.pull_request.title], ['وصفُ الطلب', event.pull_request.body]);
  if (commitsPath) {
    readFileSync(commitsPath, 'utf8').split(/\r?\n/).filter(Boolean)
      .forEach((l, i) => texts.push([`التزامُ الطلب ${i + 1}`, JSON.parse(l)]));
  }
} else if (Array.isArray(event.commits)) {
  for (const c of event.commits) texts.push([`الالتزام ${String(c.id ?? '').slice(0, 8)}`, c.message]);
} else {
  console.error('✖ حدثٌ بلا طلبٍ ولا التزامات — لا حكم');
  process.exit(2);
}

const problems = [];
for (const [label, text] of texts) for (const l of offendingLines(text)) problems.push(`${label}: ${l.trim()}`);
console.log(`checked=${texts.length} problems=${problems.length}`);
for (const p of problems) console.log('✖ ' + p);
process.exit(problems.length ? 1 : 0);
