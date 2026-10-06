// دقائقُ السير لكلِّ وظيفةٍ في نافذةٍ زمنية، مقرّبةً إلى الدقيقة صعوداً (كما تُحتسب).
// node ci-by-job.mjs <since> <until>
// ⚠️ بحثُ GitHub المرشَّح يقف عند 1000 تشغيل: فالنافذةُ تُختار تحته، والأداةُ تسقط إن بلغته.
import { execFileSync } from 'node:child_process';
const [since, until] = process.argv.slice(2);
if (!since || !until) {
  console.error('usage: node ci-by-job.mjs <since> <until>');
  process.exit(2);
}
const gh = (p) => JSON.parse(execFileSync('gh', ['api', p], { maxBuffer: 1 << 26 }).toString('utf8'));
const range = `${since}..${until}`;
const runs = [];
let reported = 0;
for (let page = 1; page <= 10; page++) {
  const r = gh(`repos/Arsant4x/mad-app/actions/runs?created=${encodeURIComponent(range)}&per_page=100&page=${page}`);
  reported = r.total_count;
  runs.push(...r.workflow_runs);
  if (r.workflow_runs.length < 100) break;
}
if (runs.length >= 1000 || reported > runs.length) {
  console.error(`✖ النافذة ${range} بلغت سقف البحث: عُدّ ${runs.length} من ${reported}. ضيّقها.`);
  process.exit(1);
}
const byJob = new Map();
let total = 0;
const heavyByEvent = new Map();
const heavyRuns = []; // لكلّ تشغيلٍ ثقيل: مجموعُ دقائقه وأطولُ وظيفة (ما ينتظره الطلبُ على GitHub بالتوازي)
for (const run of runs) {
  const jobs = gh(`repos/Arsant4x/mad-app/actions/runs/${run.id}/jobs?per_page=100`).jobs;
  let heavySum = 0;
  let heavyMax = 0;
  const heavyWall = {};
  for (const job of jobs) {
    if (!job.started_at || !job.completed_at || job.conclusion === 'skipped') continue;
    const ms = new Date(job.completed_at) - new Date(job.started_at);
    const m = Math.ceil(ms / 60000);
    const key = `${run.name} :: ${job.name}`;
    const e = byJob.get(key) ?? { n: 0, min: 0, wall: [] };
    e.n++;
    e.min += m;
    e.wall.push(ms / 60000);
    byJob.set(key, e);
    total += m;
    if (run.name === 'web-tests' && job.name !== 'gate') {
      heavySum += m;
      heavyMax = Math.max(heavyMax, ms / 60000);
      heavyWall[job.name] = ms / 60000;
      heavyByEvent.set(run.event, (heavyByEvent.get(run.event) ?? 0) + m);
    }
  }
  if (heavySum) heavyRuns.push({ heavySum, heavyMax, heavyWall });
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const ts = runs.map((r) => r.created_at).sort();
console.log(`range=${range} runs=${runs.length} first=${ts[0]} last=${ts[ts.length - 1]} job_minutes_rounded=${total}`);
for (const [k, e] of [...byJob].sort((a, b) => b[1].min - a[1].min)) {
  console.log(`  ${e.min}\t${e.n}\tmedian_wall=${median(e.wall).toFixed(1)}\t${k}`);
}
console.log(`heavy_runs=${heavyRuns.length} heavy_minutes=${heavyRuns.reduce((s, h) => s + h.heavySum, 0)} by_event=${JSON.stringify(Object.fromEntries(heavyByEvent))}`);
console.log(`heavy_parallel_wall_median=${median(heavyRuns.map((h) => h.heavyMax)).toFixed(1)} heavy_serial_wall_median=${median(heavyRuns.map((h) => Object.values(h.heavyWall).reduce((s, x) => s + x, 0))).toFixed(1)}`);
