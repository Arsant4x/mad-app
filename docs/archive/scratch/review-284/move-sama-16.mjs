// ينقل السؤال ١٦ في sama.md من القسم ثانياً إلى قسمٍ خامسٍ جديد قبل الأرصدة، فيتسلسل الترقيمُ بلا إعادة ترقيم.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2];
const L = readFileSync(p, 'utf8').split('\n');
const i = L.findIndex((l) => l.startsWith('@@MOVE16@@'));
if (i < 0 || !L[i + 1].startsWith('السند:') || L[i + 2].trim() !== '') throw new Error('شكلُ السؤال ١٦ غيرُ المتوقَّع');
const q = [L[i].replace('@@MOVE16@@', ''), L[i + 1]];
L.splice(i, 3);
const h5 = L.findIndex((l) => l.startsWith('### خامساً: الأرصدة'));
const h6 = L.findIndex((l) => l.startsWith('### سادساً: تحصيل'));
if (h5 < 0 || h6 < 0) throw new Error('عنوانا القسمين غائبان');
L[h6] = L[h6].replace('### سادساً:', '### سابعاً:');
L[h5] = L[h5].replace('### خامساً:', '### سادساً:');
L.splice(h5, 0, '### خامساً: التغذية البنكية عبر المصرفية المفتوحة', '', ...q, '');
writeFileSync(p, L.join('\n'));
console.log('moved; headings:', L.filter((l) => l.startsWith('### ')).map((l) => l.slice(4, 14)).join(' | '));
