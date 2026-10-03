// ملخّصُ الفحص الأمنيّ في السير (ق-١٥٧٠ · ق-١٥٧٦): يقرأ تقاريرَ الأدوات الثلاث ويكتب جدولاً بالخطورة.
//
// ⚖️ **يمنع الحرجَ الآن، والعاليَ من 2026-11-03** (`ق-١٥٨٦`، بحكم صاحب المشروع: «ثم يصير الفحصُ مانعاً للحرِج، والعالي بعد
//    شهر»). كان وضعَ إبلاغٍ (`ق-١٥٧٠`) حتى أُصلحت الحرجتان (`#695`) والسبعُ العالية في المكتبات (`#696`). ويُطبع في كلِّ تشغيلٍ
//    كم بقي على منع العالي وما يمنعه لو كان اليوم، فلا يأتي موعدُه مفاجأة. **وتقريرٌ غائبٌ أو لا يُقرأ يُسقط كما كان**: أداةٌ
//    معطوبة تُخرج صفراً يشبه النظافة (السجلّ §8.7 الوجه الحادي عشر).
//
// الاستعمال: node .github/security/summarize.mjs <npm|semgrep|trivy-image|trivy-config> <ملفّ> [<ملفّ> …]
// و`SECURITY_TODAY=YYYY-MM-DD` يُثبّت يومَ الحكم لإثبات منطق الموعد وحدَه، ولا يُضبط في السير.
import { readFileSync } from 'node:fs';

const [kind, ...files] = process.argv.slice(2);
const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'UNKNOWN'];
const TOP = 15;
const HIGH_BLOCKS_FROM = '2026-11-03';

function load(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    fail(`التقريرُ غائب: ${file}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`التقريرُ لا يُقرأ JSON: ${file} (${text.length} بايت)`);
  }
}

function fail(msg) {
  console.log(`\n**✘ ${msg}** — الأداةُ لم تُخرج تقريرَها، فلا حكمَ على الشيفرة.\n`);
  process.exit(1);
}

const norm = (s) => {
  const u = String(s ?? 'UNKNOWN').toUpperCase();
  if (u === 'MODERATE' || u === 'WARNING') return 'MEDIUM';
  if (u === 'ERROR') return 'HIGH';
  return ORDER.includes(u) ? u : 'UNKNOWN';
};

function table(title, findings) {
  const counts = Object.fromEntries(ORDER.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity]++;
  const lines = [`### ${title}`, '', `| ${ORDER.join(' | ')} | المجموع |`, `|${ORDER.map(() => '---').join('|')}|---|`, `| ${ORDER.map((s) => counts[s]).join(' | ')} | ${findings.length} |`, ''];
  const top = [...findings].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)).slice(0, TOP);
  if (top.length) {
    lines.push('| الخطورة | المعرّف | الموضع | الوصف |', '|---|---|---|---|');
    const cell = (s, n = 140) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').slice(0, n);
    for (const f of top) lines.push(`| ${f.severity} | ${cell(f.id)} | ${cell(f.where)} | ${cell(f.title)} |`);
    if (findings.length > TOP) lines.push('', `… و${findings.length - TOP} غيرها في التقرير المرفوع.`);
  } else {
    lines.push('لا نتيجة.');
  }
  return lines.join('\n');
}

const sections = [];
const all = [];
for (const file of files) {
  const data = load(file);
  let findings = [];
  if (kind === 'npm') {
    if (!data.metadata || !data.metadata.vulnerabilities) fail(`تقريرُ npm audit بلا metadata.vulnerabilities: ${file}`);
    for (const [name, v] of Object.entries(data.vulnerabilities ?? {})) {
      const via = (v.via ?? []).find((x) => typeof x === 'object');
      findings.push({ severity: norm(v.severity), id: via?.url?.split('/').pop() ?? name, where: `${name} ${v.range ?? ''}`.trim(), title: via?.title ?? (v.isDirect ? 'مباشر' : 'غير مباشر') });
    }
  } else if (kind === 'semgrep') {
    if (!Array.isArray(data.results)) fail(`تقريرُ semgrep بلا results: ${file}`);
    findings = data.results.map((r) => ({ severity: norm(r.extra?.severity), id: r.check_id, where: `${r.path}:${r.start?.line}`, title: r.extra?.message ?? '' }));
    if ((data.errors ?? []).length) sections.push(`> ⚠️ أخطاءُ semgrep: ${data.errors.length} (في التقرير المرفوع).`);
  } else if (kind === 'trivy-image' || kind === 'trivy-config') {
    // تقريرٌ نظيفٌ قد يخلو من `Results`؛ فالعلامةُ على أنه تقريرُ Trivy أصلاً رقمُ مخطّطه.
    if (typeof data.SchemaVersion !== 'number' || !Array.isArray(data.Results ?? [])) fail(`ليس تقريرَ trivy (بلا SchemaVersion): ${file}`);
    for (const r of data.Results ?? []) {
      for (const v of r.Vulnerabilities ?? []) findings.push({ severity: norm(v.Severity), id: v.VulnerabilityID, where: `${r.Target} · ${v.PkgName} ${v.InstalledVersion}${v.FixedVersion ? ' ⟵ ' + v.FixedVersion : ''}`, title: v.Title ?? '' });
      for (const m of r.Misconfigurations ?? []) findings.push({ severity: norm(m.Severity), id: m.ID, where: r.Target, title: m.Title ?? '' });
    }
  } else {
    fail(`نوعٌ غير معروف: ${kind}`);
  }
  sections.push(table(`${kind} · ${file}`, findings));
  all.push(...findings);
}
const today = process.env.SECURITY_TODAY ?? new Date().toISOString().slice(0, 10);
const highBlocks = today >= HIGH_BLOCKS_FROM;
const blocking = highBlocks ? ['CRITICAL', 'HIGH'] : ['CRITICAL'];
const blocked = all.filter((f) => blocking.includes(f.severity));
const highNow = all.filter((f) => f.severity === 'HIGH').length;
const daysLeft = Math.round((Date.parse(HIGH_BLOCKS_FROM) - Date.parse(today)) / 86_400_000);
const verdict = blocked.length
  ? `**⛔ يُمنع: ${blocked.length} نتيجةً بخطورة ${blocking.join(' أو ')}** — تُصلح قبل الدمج.`
  : `**✔ لا ما يمنع** (${blocking.join(' و')}).`;
const schedule = highBlocks
  ? `العالي مانعٌ منذ ${HIGH_BLOCKS_FROM}.`
  : `العالي يصير مانعاً في ${HIGH_BLOCKS_FROM} (بعد ${daysLeft} يوماً)، ولو كان اليومَ لمنع هنا ${highNow}.`;
console.log(['## الفحصُ الأمنيّ (يمنع الحرجَ الآن، والعاليَ من ' + HIGH_BLOCKS_FROM + ')', '', verdict, schedule, '', ...sections].join('\n\n'));
process.exit(blocked.length ? 1 : 0);
