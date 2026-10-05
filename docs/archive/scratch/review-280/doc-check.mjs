// فحصُ الشَّرطات خارج علامتي الشيفرة، والفواصلِ التي لا تُرى في كلِّ موضع.
// الاستعمال: node doc-check.mjs <ملف>...   أو   node doc-check.mjs --self
import { readFileSync } from 'node:fs';

const DASH = /[-‐-―−﹘﹣－]/g;
const INVISIBLE = /[­​-‏⁠﻿]/g;

function check(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(INVISIBLE)) hits.push({ line: i + 1, kind: 'invisible', code: m[0].codePointAt(0).toString(16) });
    // علاماتُ الشيفرة: ما بين زوجٍ من «`» يُحذف قبل عدّ الشَّرطات.
    const outside = line.replace(/`[^`]*`/g, '');
    for (const m of outside.matchAll(DASH)) hits.push({ line: i + 1, kind: 'dash', code: m[0].codePointAt(0).toString(16), text: line.slice(0, 80) });
  });
  return hits;
}

if (process.argv[2] === '--self') {
  const mustHit = check('نصٌّ فيه شرطة - هنا');
  const mustNotHit = check('نصٌّ فيه `--roots` داخل الشيفرة');
  const invisibleHit = check('اسم‍مربوط');
  const ok = mustHit.length === 1 && mustNotHit.length === 0 && invisibleHit.length === 1;
  console.log(`self: mustHit=${mustHit.length} mustNotHit=${mustNotHit.length} invisible=${invisibleHit.length} ${ok ? 'OK' : 'BROKEN'}`);
  process.exit(ok ? 0 : 2);
}

let total = 0;
for (const f of process.argv.slice(2)) {
  const hits = check(readFileSync(f, 'utf8'));
  total += hits.length;
  for (const h of hits) console.log(`${f}:${h.line} ${h.kind} U+${h.code.toUpperCase()} ${h.text ?? ''}`);
  console.log(`${f}: ${hits.length}`);
}
process.exit(total ? 1 : 0);
