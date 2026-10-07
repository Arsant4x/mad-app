// يجمع صفوفَ القرّاء في ملفٍّ واحد بعمود مصدرٍ سابع، ويعدّ بالباب وبالحال، ويُبلغ عن الصفوف المعيبة.
// الاستعمال: node combine.mjs <مجلد الخرج>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const DIR = 'D:/mad-app-scratch/review-283';
const PARTS = 'C:/Users/mnqad/AppData/Local/Temp/claude/D--mad-app/fbb52e90-5a9d-44d1-b9a0-f65418c4ff30/scratchpad/parts';
export const SECTIONS = ['النواة المحاسبية', 'المبيعات والفوترة والضريبة', 'المشتريات والمخزون والتكلفة', 'العملاء والموردون والذمم والتحصيل', 'البنوك والصناديق والدفع الإلكتروني', 'نقاط البيع وأجهزتها', 'الصلاحيات والمستخدمون والفروع والمهام', 'الموارد البشرية والرواتب', 'العقارات وعقودها', 'المحرّكات العامة (العقود والتوقيع والنماذج والمستندات والأتمتة والمشاريع)', 'الأنشطة وملفّاتها', 'التجارة الإلكترونية والتطبيقات والمنصّات', 'التكاملات الحكومية والجهات', 'الأمن والخصوصية والامتثال', 'المنصّة والاشتراك والتشغيل', 'التوسّع (الدول والشركات الكبيرة والمجموعات والتطبيق الجامع)', 'الذكاء والتحليلات', 'الواجهة والتجربة', 'البنية الهندسية', 'الحدود المعلنة'];
export const STATES = ['مسجَّل', 'مُسح', 'قيد البناء', 'مبنيّ', 'ينتظر قرار صاحب المشروع', 'مؤجَّل', 'مستبعَد', 'غير محسوم'];
const files = [
  ...readdirSync(DIR).filter((f) => /^rows-[\w-]+\.tsv$/.test(f)).map((f) => join(DIR, f)),
];
const out = [];
const bad = [];
for (const f of files) {
  const src = f.split(/[\\/]/).pop().replace('.tsv', '');
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
    if (!l.trim() || l.startsWith('#')) return;
    const c = l.split('\t').map((s) => s.trim());
    const bareSt = (c[3] || '').replace(/[ً-ْ]/g, '');
    const canon = STATES.find((s) => s.replace(/[ً-ْ]/g, '') === bareSt);
    if (canon) c[3] = canon;
    if (c.length !== 6 || !SECTIONS.includes(c[0]) || !STATES.includes(c[3])) { bad.push(`${src}:${i + 1}: cols=${c.length} sec=${c[0]} st=${c[3]}`); return; }
    out.push([...c, src]);
  });
}
const count = (k) => out.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {});
writeFileSync(join(DIR, 'all-rows.tsv'), out.map((r) => r.join('\t')).join('\n') + '\n');
for (const s of SECTIONS) writeFileSync(join(DIR, 'sec', `${String(SECTIONS.indexOf(s) + 1).padStart(2, '0')}.tsv`), out.filter((r) => r[0] === s).map((r) => r.join('\t')).join('\n') + '\n');
console.log('files', files.length, 'rows', out.length, 'bad', bad.length);
console.log(count(0));
console.log(count(3));
for (const b of bad.slice(0, 40)) console.log('BAD', b);
