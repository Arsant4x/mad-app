// ينقل صفوفَ المهامّ من السجلّ إلى ملفّ أرشيفٍ بنصوصها كما هي (رأسُ القواعد · ق-١٦٤٤).
// الاستعمال: node apply-cleanup.mjs <decisions.md داخل نسخة العمل> <ملفّ الأرشيف> [--dry]
import { readFileSync, writeFileSync } from 'node:fs';

const [src, archivePath, flag] = process.argv.slice(2);
const dry = flag === '--dry';
const raw = readFileSync(src, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);
const ID = /ق-([٠-٩0-9]+)/;

// الأحكامُ بعد مراجعتي: قائمةُ الحذف ناقصاً ما أعدتُه إلى «قرار».
const OVERRIDE_KEEP = new Set([277, 278, 645, 1611, 1612, 1725, 2036, 2432, 2462, 3212, 3245, 3395, 3692, 3818, 3819, 3827, 3856, 3859, 3881]);
const removeTsv = readFileSync('D:/mad-app-scratch/review-279/remove-list.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'));
const remove = new Map();
for (const [line, id, kind] of removeTsv) if (!OVERRIDE_KEEP.has(Number(line))) remove.set(Number(line), { id, kind });

const isRow = (l) => l.startsWith('| **') && ID.test(l.split(' | ')[0]);
// تحقّقٌ: كلُّ سطرٍ في القائمة صفٌّ مرقّمٌ فعلاً، ورقمُه كما سُجّل.
for (const [n, { id }] of remove) {
  const l = lines[n - 1] ?? '';
  if (!isRow(l) || l.split(' | ')[0].match(ID)[1] !== id) throw new Error(`السطر ${n} ليس الصفَّ ${id}`);
}

// الكتل: من عنوانٍ إلى ما قبل العنوان التالي.
const heads = [0];
lines.forEach((l, i) => { if (i > 0 && /^#{1,6} /.test(l)) heads.push(i); });
heads.push(lines.length);
const drop = new Set();
const archive = [];
let wholeBlocks = 0, rowsMoved = 0, emptyTables = 0;
for (let b = 0; b < heads.length - 1; b++) {
  const [s, e] = [heads[b], heads[b + 1]];
  const rows = [];
  for (let i = s; i < e; i++) if (isRow(lines[i])) rows.push(i + 1);
  if (!rows.length) continue;
  const moved = rows.filter((n) => remove.has(n));
  if (!moved.length) continue;
  if (moved.length === rows.length && s > 0) {
    // الكتلةُ كلُّها مهامّ: تنتقل بعنوانها ونثرها وجدولها.
    wholeBlocks++;
    if (dry) console.log(`whole block ${s + 1}..${e}: ${lines[s].slice(0, 110)} · prose lines=${lines.slice(s + 1, e).filter((l) => l.trim() && !l.startsWith('|')).length}`);
    for (let i = s; i < e; i++) drop.add(i);
    archive.push(...lines.slice(s, e));
    rowsMoved += moved.length;
    continue;
  }
  // كتلةٌ مختلطة: ينتقل الصفُّ وحدَه مع رأس جدوله.
  archive.push(/^#{1,6} /.test(lines[s]) ? lines[s] : '### (رأسُ السجلّ)', '');
  let lastTable = -1;
  for (const n of moved) {
    let t = n - 1;
    while (t > s && lines[t - 1].startsWith('|')) t--;
    if (t !== lastTable) {
      if (lastTable !== -1) archive.push('');
      archive.push(lines[t], lines[t + 1]);
      lastTable = t;
    }
    archive.push(lines[n - 1]);
    drop.add(n - 1);
    rowsMoved++;
  }
  archive.push('');
  // جدولٌ لم يبقَ فيه إلا رأسُه يُحذف رأسُه.
  for (let i = s; i < e; i++) {
    if (!lines[i].startsWith('|') || (i > 0 && lines[i - 1].startsWith('|'))) continue;
    let j = i;
    while (j < e && lines[j].startsWith('|')) j++;
    const body = [];
    for (let k = i + 2; k < j; k++) if (!drop.has(k)) body.push(k);
    if (j - i > 2 && body.length === 0) { drop.add(i); drop.add(i + 1); emptyTables++; }
  }
}
if (rowsMoved !== remove.size) throw new Error(`نُقل ${rowsMoved} والمطلوب ${remove.size}`);

const kept = lines.filter((_, i) => !drop.has(i));
const before = lines.filter(isRow).length;
const after = kept.filter(isRow).length;
console.log(`rows before=${before} moved=${rowsMoved} after=${after} wholeBlocks=${wholeBlocks} emptyTablesDropped=${emptyTables} linesBefore=${lines.length} linesAfter=${kept.length}`);
const byKind = {};
for (const { kind } of remove.values()) byKind[kind] = (byKind[kind] || 0) + 1;
console.log('moved by kind', byKind);
if (dry) process.exit(0);

// إشارةٌ في رأس السجلّ بعد العنوان.
const titleAt = kept.findIndex((l) => l.startsWith('# سجلّ القرارات'));
const note = [
  '',
  `> ⚖️ **هذا السجلّ للقرارات وحدَها** (رأسُ القواعد الدائمة في \`CLAUDE.md\` · \`ق-١٦٤٤\`، بنصّ صاحب المشروع 2026-10-05). والصفوفُ التي سُجّلت لمهامّ لا لقرارات (${rowsMoved} صفّاً: توجيهاتُ جلسات · نتائجُ تنفيذ · دمجٌ وحذفٌ وتشغيل · قياسٌ وبحثٌ بلا حكم) **نُقلت بنصوصها وأرقامها كما كانت** إلى [\`docs/archive/decisions-task-rows.md\`](archive/decisions-task-rows.md)، فرقمٌ تُحيل إليه الشيفرةُ أو الوثائقُ ولا تجده هنا تجده هناك سجلَّ وقائعٍ لا قراراً.`,
];
kept.splice(titleAt + 1, 0, ...note);
writeFileSync(src, kept.join(eol));

const head = [
  '<!-- no-id-scan: أرشيفُ صفوفٍ نُقلت من سجلّ القرارات بنصوصها كما كانت؛ وما فيها من ذكر «صورة الهوية» توثيقٌ لا دعوة. -->',
  '',
  '# صفوفُ المهامّ المنقولة من سجلّ القرارات',
  '',
  '> **نُقلت من `docs/decisions.md` في توجيه ٢٧٩ (2026-10-05)** بحكم صاحب المشروع، رأسُ القواعد الدائمة في `CLAUDE.md` (`ق-١٦٤٤`):',
  '> «**ما ليس قرارًا لا يدخله أبدًا، ومكانُه ملفُّ الوقائع … واحذف الآن كلَّ صفٍّ سُجّل لمهمّةٍ لا لقرار.**»',
  '>',
  `> **${rowsMoved} صفّاً** بنصوصها وأرقامها حرفاً كما كانت، وبعناوين أقسامها ورؤوس جداولها، بترتيبها في السجلّ. ونُقلت ولم تُمحَ لأن الشيفرةَ والوثائقَ تُحيل إلى أرقامٍ منها، فتبقى الإحالةُ مقروءة.`,
  '> **وهي سجلُّ وقائعٍ لا قرارات**: لا يُبنى عليها حكم، ولا يُضاف إليها صفّ. والقراراتُ في `docs/decisions.md` وحدَه.',
  '>',
  '> والتصنيفُ بالاختبار الثالث من رأس القواعد («لو انتهت هذه المهمّة، أيبقى هذا ساريًا؟»)، وما فيه حكمٌ ساري مع المهمّة بقي في السجلّ، وعند الشكّ بقي. والطريقةُ وأعدادُها في `docs/archive/scratch/decisions-cleanup-279.md`.',
  '',
];
writeFileSync(archivePath, [...head, ...archive].join(eol) + eol);
console.log(`written: ${src} and ${archivePath}`);
