// كسرٌ متعمَّد لإثباتٍ بالعكس (القاعدة ١١ · §8.8): يقف إن كان الهدفُ غيرَ ملتزَم (§8.8 الوجه الخامس)، ويُثبت وقوعَ الكسر بعدّ النمط.
// الاستعمال: node break.mjs <worktree> <file-rel> <find-file> <replace-file>   ثم الاستعادةُ: git -C <worktree> checkout -- <file-rel>
// ⚠️ نهايةُ السطر تُطابَق بنهاية الملفّ نفسِه (§8.7 الوجه الخامس عشر): نسخةُ العمل على ويندوز قد تكون CRLF والنمطُ LF.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const [wt, rel, findFile, replFile] = process.argv.slice(2);
try {
  execFileSync('git', ['-C', wt, 'diff', '--quiet', '--', rel]);
} catch {
  console.error(`STOP: ${rel} has uncommitted changes`);
  process.exit(2);
}
const path = join(wt, rel);
const src = readFileSync(path, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const norm = (s) => s.replace(/\r?\n$/, '').replace(/\r?\n/g, eol);
const find = norm(readFileSync(findFile, 'utf8'));
const repl = norm(readFileSync(replFile, 'utf8'));
const n = src.split(find).length - 1;
if (n !== 1) {
  console.error(`STOP: pattern found ${n} times`);
  process.exit(3);
}
const next = src.replace(find, repl);
writeFileSync(path, next);
const after = readFileSync(path, 'utf8');
console.log(`break landed: ${after === next && after !== src ? 1 : 0}`);
