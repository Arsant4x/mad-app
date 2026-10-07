// يبني docs/management/scope-register.md من final-*.tsv (خمسة أعمدة: الباب · الاسم · الشرح · الحال · المرجع).
// الاستعمال: node build-register.mjs <ملفّ الخرج> <ملفّ المقدّمة>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [outPath, introPath, srcDir] = process.argv.slice(2);
const DIR = srcDir || 'D:/mad-app-scratch/review-283';
const SECTIONS = ['النواة المحاسبية', 'المبيعات والفوترة والضريبة', 'المشتريات والمخزون والتكلفة', 'العملاء والموردون والذمم والتحصيل', 'البنوك والصناديق والدفع الإلكتروني', 'نقاط البيع وأجهزتها', 'الصلاحيات والمستخدمون والفروع والمهام', 'الموارد البشرية والرواتب', 'العقارات وعقودها', 'المحرّكات العامة (العقود والتوقيع والنماذج والمستندات والأتمتة والمشاريع)', 'الأنشطة وملفّاتها', 'التجارة الإلكترونية والتطبيقات والمنصّات', 'التكاملات الحكومية والجهات', 'الأمن والخصوصية والامتثال', 'المنصّة والاشتراك والتشغيل', 'التوسّع (الدول والشركات الكبيرة والمجموعات والتطبيق الجامع)', 'الذكاء والتحليلات', 'الواجهة والتجربة', 'البنية الهندسية', 'الحدود المعلنة'];
const STATES = ['مبنيّ', 'قيد البناء', 'ينتظر قرار صاحب المشروع', 'مسجَّل', 'مُسح', 'مؤجَّل', 'مستبعَد', 'غير محسوم'];
const bare = (s) => s.replace(/[\u064B-\u0652]/g, '');
const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const rows = [];
const bad = [];
for (const f of readdirSync(DIR).filter((n) => /^final-\d+\.tsv$/.test(n)).sort()) {
  readFileSync(join(DIR, f), 'utf8').split(/\r?\n/).forEach((l, i) => {
    if (!l.trim() || l.startsWith('#')) return;
    const c = l.split('\t').map((s) => s.trim());
    const st = STATES.find((s) => bare(s) === bare(c[3] || ''));
    const sec = SECTIONS.find((s) => bare(s) === bare(c[0] || ''));
    if (c.length !== 5 || !st || !sec || !c[1] || !c[2]) { bad.push(`${f}:${i + 1} cols=${c.length} ${c[0]} | ${c[3]}`); return; }
    rows.push({ sec, name: c[1], expl: c[2], st, ref: c[4], f });
  });
}
// تكرارُ الاسم بعينه عبر الملفّات يُبلَغ ولا يُحذف آليّاً
const seen = new Map();
const dups = [];
for (const r of rows) { const k = bare(r.name); if (seen.has(k)) dups.push(`${r.name} (${seen.get(k)} و${r.f})`); else seen.set(k, r.f); }
const total = rows.length;
const byState = Object.fromEntries(STATES.map((s) => [s, rows.filter((r) => r.st === s).length]));
let md = readFileSync(introPath, 'utf8').replace('{{TOTAL}}', ar(total));
md += '\n## العددُ بكلِّ حال\n\n';
md += `* **المجموع: ${ar(total)} بنداً**\n`;
for (const s of STATES) md += `* ${s}: ${ar(byState[s])}\n`;
md += '\n**وبالأبواب** (المجموعُ، ثم ما بُني منه):\n\n';
SECTIONS.forEach((s, i) => { const rs = rows.filter((r) => r.sec === s); md += `* ${ar(i + 1)}. ${s}: ${ar(rs.length)}، المبنيُّ منها ${ar(rs.filter((r) => r.st === 'مبنيّ').length)}\n`; });
let n = 0;
SECTIONS.forEach((s, i) => {
  const rs = rows.filter((r) => r.sec === s);
  md += `\n## ${ar(i + 1)}. ${s}\n\n`;
  const ordered = s === 'الحدود المعلنة' ? rs.slice().sort((a, b) => limitNo(a.name) - limitNo(b.name)) : STATES.flatMap((st) => rs.filter((r) => r.st === st).sort((a, b) => a.name.localeCompare(b.name, 'ar')));
  for (const r of ordered) { n++; md += `* ${ar(n)}. **${r.name}** · ${r.expl} · **${r.st}** · ${r.ref}\n`; }
});
function limitNo(name) { const m = bare(name).match(/الحد\s*([٠-٩0-9]+)/); return m ? Number(m[1].replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) : 999; }
writeFileSync(outPath, md);
console.log(`rows=${total} bad=${bad.length} dupNames=${dups.length}`);
console.log(JSON.stringify(byState));
for (const b of bad.slice(0, 30)) console.log('BAD', b);
for (const d of dups.slice(0, 60)) console.log('DUP', d);
