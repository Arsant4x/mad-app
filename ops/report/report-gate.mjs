// بوّابةُ التقرير (قاعدة المالك 2026-09-18 · ق-١٠٤٧): «تأكد دايما ان التقرير فيه كل شي».
// الاستعمال: node report-gate.mjs <التقرير.md> <الوقائع.md>
// كلُّ سطرٍ غيرِ فارغٍ في ملفّ الوقائع (لا يبدأ بـ#) يجب أن يظهر حرفياً في التقرير — وإلا خروجٌ 1 يسمّي الغائب.
// ويرفض أيضاً: {{ placeholder }} · بايت NUL · رقماً بشكل IP · قائمةَ وقائعَ فارغة (لا حكم على لا شيء) · تقريراً بلا قسم «سجلُّ النطاق»
// · وإحالةً إلى تقريرٍ آخر أو صورةٍ لا يسمّيها سطرُ «أُرسل» في الوقائع.
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
// ⚖️ ق-١٦٤٩ (القاعدة الدائمة ٤٢): «كلُّ تقريرٍ يحدّث سجلَّ النطاق بما أُضيف أو تغيّر حالُه، ويذكر ذلك في قسمٍ منه اسمُه
// «سجلُّ النطاق»». العنوانُ يُطابَق بعد نزع الحركات، فـ«سجلُّ» و«سجلّ» و«سجل» سواء. وحدُّها: تقرأ وجودَ القسم لا صدقَه.
const bare = r.replace(/[ً-ْٰ]/g, '');
if (!/^#{1,6}[ \t]*سجل النطاق[ \t]*\r?$/m.test(bare)) problems.push('لا قسمَ «سجلُّ النطاق» في التقرير (ق-١٦٤٩ · القاعدة ٤٢)');
// ⚖️ ق-١٦٥٥ (القاعدة الدائمة ٤٤): «كلُّ تقريرٍ تكتبه يُرسل إليّ ملفّاً في الدور نفسِه، ولا تُحيل في تقريرٍ إلى تقريرٍ أو ملفٍّ
// لم يصلني». فكلُّ تقريرٍ آخر (`report-…md`) وكلُّ صورةٍ يذكرها التقريرُ يجب أن يُسمّى في سطرٍ من الوقائع يبدأ بـ«أُرسل»
// كُتب لحظةَ الإرسال، والمطابقةُ باسم الملفّ وحدَه. والتقريرُ نفسُه مستثنى (يُرسل بعد البوّابة). وحدُّها: تقرأ الإعلانَ في
// الوقائع لا الإرسالَ نفسَه، ولا ترى إلا التقاريرَ والصور.
const fileBase = (p) => p.replace(/\\/g, '/').split('/').pop().toLowerCase();
const sent = new Set();
for (const f of lines) {
  if (!/^•?\s*أرسل/.test(f.replace(/[ً-ْٰ]/g, ''))) continue;
  for (const m of f.matchAll(/`([^`]+)`/g)) sent.add(fileBase(m[1]));
}
const selfBase = fileBase(report);
const cited = new Set();
for (const m of r.matchAll(/[^\s`«»()،:]+\.(?:md|jpe?g|png)\b/gi)) {
  const b = fileBase(m[0]);
  if (b === selfBase) continue;
  if (/^report-/.test(b) || /\.(jpe?g|png)$/.test(b)) cited.add(b);
}
for (const b of cited) if (!sent.has(b)) problems.push(`يُحال إلى ${b} ولا سطرَ «أُرسل» يسمّيه في الوقائع (ق-١٦٥٥ · القاعدة ٤٤)`);
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
  // The archive lives in the ops repository (rikzapp/rikz-ops, cloned at D:/rikz-ops) since October 2026.
  // A scratch file counts as committed when its path is under docs/archive/scratch there, or when its
  // content is a blob on main in either repository (research that became a product document).
  const OPS = process.env.RIKZ_OPS_REPO || 'D:/rikz-ops';
  const PRODUCT = 'D:/mad-app';
  const SCRATCH = 'D:/mad-app-scratch';
  const treeOf = (repo) => {
    const git = (...a) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 1 << 28 }).toString('utf8');
    git('fetch', '-q', 'origin');
    return git('ls-tree', '-r', '-z', 'origin/main').split('\0').filter(Boolean);
  };
  const opsTree = treeOf(OPS);
  const paths = new Set(opsTree.map((l) => l.split('\t')[1]));
  const blobs = new Set([...opsTree, ...treeOf(PRODUCT)].map((l) => l.split('\t')[0].split(' ')[2]));
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
