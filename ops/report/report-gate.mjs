// بوّابةُ التقرير (قاعدة المالك 2026-09-18 · ق-١٠٤٧): «تأكد دايما ان التقرير فيه كل شي».
// الاستعمال: node report-gate.mjs <التقرير.md> <الوقائع.md>
// كلُّ سطرٍ غيرِ فارغٍ في ملفّ الوقائع (لا يبدأ بـ#) يجب أن يظهر حرفياً في التقرير — وإلا خروجٌ 1 يسمّي الغائب.
// ويرفض أيضاً: {{ placeholder }} · بايت NUL · رقماً بشكل IP · قائمةَ وقائعَ فارغة (لا حكم على لا شيء).
import { readFileSync } from 'node:fs';
const [report, facts] = process.argv.slice(2);
if (!report || !facts) { console.error('usage: node report-gate.mjs <report.md> <facts.md>'); process.exit(2); }
const r = readFileSync(report, 'utf8');
// تعليقُ الوقائع «# » (مربّعٌ فمسافة) أو «#» وحده — لا كلُّ ما يبدأ بمربّع: أسطرُ الطلبات «#493 CLEAN …»
// وقائعُ، وكانت تُسقَط صامتةً حتى 2026-09-20 (التوجيه ٢٤٠) — أداةُ قياسٍ تستثني فئةً ممّا تقيسه ولا تقول (§8.7).
const isComment = (s) => s === '#' || /^#\s/.test(s);
const lines = readFileSync(facts, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !isComment(s));
if (lines.length === 0) { console.error('✖ قائمةُ الوقائع فارغة — لا حكم'); process.exit(2); }
const problems = [];
for (const f of lines) if (!r.includes(f)) problems.push('غائب عن التقرير: ' + f);
if (r.includes('{{')) problems.push('بقي {{ placeholder }}');
if (r.includes(String.fromCharCode(0))) problems.push('بايت NUL في التقرير');
if (/(\d{1,3}\.){3}\d{1,3}/.test(r)) problems.push('رقمٌ بشكل IP في التقرير');
// ⚖️ ق-١٥٩٦ (القاعدة الدائمة ٣٨): «لا يبقى ناتجُ بحثٍ أو مسحٍ أو رسالةٍ في المسوّدة وحدَها، بل يُلتزم في المستودع في الجلسة
// نفسِها». بالخيار --archive-since=YYYY-MM-DD: كلُّ md/tsv/csv في المسوّدة كُتب منذ ذلك اليوم يجب أن يكون في origin/main،
// بمساره تحت docs/archive/scratch أو بمحتواه في أيّ موضع. ويُستثنى ما ليس ناتجاً: أجسامُ الطلبات ورسائلُ الالتزام ونسخُ
// السجلّ وجرودُ النقل وسجلّاتُ التشغيل، والتقريرُ والوقائعُ المعطيان هنا (يُلتزمان في طلب التسجيل).
const sinceArg = process.argv.find((a) => a.startsWith('--archive-since='));
if (sinceArg) {
  const { readdirSync, statSync } = await import('node:fs');
  const { join, relative, resolve } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const since = new Date(sinceArg.split('=')[1] + 'T00:00:00Z');
  const REPO = 'D:/mad-app';
  const SCRATCH = 'D:/mad-app-scratch';
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { maxBuffer: 1 << 28 }).toString('utf8');
  git('fetch', '-q', 'origin');
  const tree = git('ls-tree', '-r', '-z', 'origin/main').split('\0').filter(Boolean);
  const paths = new Set(tree.map((l) => l.split('\t')[1]));
  const blobs = new Set(tree.map((l) => l.split('\t')[0].split(' ')[2]));
  const EXEMPT = /(^|\/)(pr-|body|commit|results-|decisions-|apply-|inventory-|selection-|archive-manifest-|.*-log|.*-out)|\/(tmp|jest-cache[^/]*|node_modules)\//i;
  const skip = new Set([resolve(report), resolve(facts)].map((p) => p.replace(/\\/g, '/').toLowerCase()));
  const missing = [];
  let checked = 0;
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const full = join(dir, n).replace(/\\/g, '/');
      if (/\/(tmp|jest-cache[^/]*|node_modules|fake-docker)$/i.test(full)) continue;
      const st = statSync(full);
      if (st.isDirectory()) { walk(full); continue; }
      if (!/\.(md|tsv|csv)$/i.test(n) || st.mtime < since) continue;
      const rel = relative(SCRATCH, full).replace(/\\/g, '/');
      if (EXEMPT.test(rel) || skip.has(full.toLowerCase())) continue;
      checked++;
      if (paths.has('docs/archive/scratch/' + rel)) continue;
      const lf = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
      const sha = execFileSync('git', ['hash-object', '--stdin'], { input: lf }).toString().trim();
      if (!blobs.has(sha)) missing.push(rel);
    }
  };
  walk(SCRATCH);
  console.log(`archive-since=${sinceArg.split('=')[1]} checked=${checked} missing=${missing.length}`);
  for (const m of missing) problems.push('في المسوّدة وحدَها لم يُلتزم في main (ق-١٥٩٦): ' + m);
}
console.log(`facts=${lines.length} problems=${problems.length}`);
for (const p of problems) console.log('✖ ' + p);
process.exit(problems.length ? 1 : 0);
