// ما يوفّره «الثقيلُ مرّةً على الرأس الأخير قبل الدمج»: يقابل كلَّ تشغيلٍ ثقيلٍ لطلبٍ برأس ذلك الطلب عند الدمج.
import { readFileSync, readdirSync } from 'node:fs';
const runs = readdirSync('.').filter((f) => /^h-.*\.jsonl$/.test(f)).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const prs = readFileSync('merged-prs.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const finalByBranch = new Map(prs.map((p) => [p.branch, p]));
const s = { prRuns: 0, prMin: 0, finalFirst: 0, finalFirstMin: 0, finalExtra: 0, finalExtraMin: 0, nonFinal: 0, nonFinalMin: 0, nonFinalFailedMin: 0, unmerged: 0, unmergedMin: 0, push: 0, pushMin: 0 };
const seenFinal = new Set();
const perPr = new Map();
for (const r of runs.sort((a, b) => a.at.localeCompare(b.at))) {
  if (r.event === 'push') { s.push++; s.pushMin += r.minutes; continue; }
  s.prRuns++; s.prMin += r.minutes;
  const p = finalByBranch.get(r.branch);
  if (!p) { s.unmerged++; s.unmergedMin += r.minutes; continue; }
  perPr.set(p.number, (perPr.get(p.number) ?? 0) + 1);
  if (r.sha === p.head) {
    if (!seenFinal.has(p.number)) { seenFinal.add(p.number); s.finalFirst++; s.finalFirstMin += r.minutes; }
    else { s.finalExtra++; s.finalExtraMin += r.minutes; }
  } else {
    s.nonFinal++; s.nonFinalMin += r.minutes;
    if (r.conclusion === 'failure') s.nonFinalFailedMin += r.minutes;
  }
}
const counts = [...perPr.values()];
const docOnly = prs.filter((p) => p.files.length && p.files.every((f) => !/^(apps|packages|docker|\.github\/workflows)\/|^package(-lock)?\.json$/.test(f))).length;
console.log(JSON.stringify(s));
console.log(`merged=${prs.length} merged_with_heavy=${perPr.size} docs_only_merged=${docOnly} heavy_runs_per_merged_pr: median=${counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)]} max=${Math.max(...counts)} gt1=${counts.filter((c) => c > 1).length}`);
console.log(`merged_with_heavy_but_no_run_on_final_head=${[...perPr.keys()].filter((n) => !seenFinal.has(n)).length}`);
