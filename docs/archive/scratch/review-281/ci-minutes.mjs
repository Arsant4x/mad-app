// دقائقُ السير منذ لحظةٍ: كلُّ تشغيلٍ أُنشئ بعدها، ولكلِّ وظيفةٍ زمنُها مقرَّباً إلى الدقيقة صعوداً (كما تُحتسب).
// الاستعمال: node ci-minutes.mjs 2026-10-05T14:35:59Z
import { execFileSync } from 'node:child_process';

const since = process.argv[2];
if (!since) {
  console.error('usage: node ci-minutes.mjs <ISO since>');
  process.exit(2);
}
const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { maxBuffer: 1 << 26 }).toString('utf8'));
const runs = [];
for (let page = 1; page < 20; page++) {
  const r = gh(`repos/Arsant4x/mad-app/actions/runs?created=%3E%3D${encodeURIComponent(since)}&per_page=100&page=${page}`);
  runs.push(...r.workflow_runs);
  if (r.workflow_runs.length < 100) break;
}
let jobs = 0;
let minutes = 0;
let notCompleted = 0;
const byWorkflow = new Map();
for (const run of runs) {
  if (run.status !== 'completed') notCompleted++;
  const j = gh(`repos/Arsant4x/mad-app/actions/runs/${run.id}/jobs?per_page=100`).jobs;
  for (const job of j) {
    if (!job.started_at || !job.completed_at || job.conclusion === 'skipped') continue;
    const m = Math.ceil((new Date(job.completed_at) - new Date(job.started_at)) / 60000);
    jobs++;
    minutes += m;
    byWorkflow.set(run.name, (byWorkflow.get(run.name) ?? 0) + m);
  }
}
console.log(`runs=${runs.length} notCompleted=${notCompleted} jobs=${jobs} job_minutes_rounded=${minutes}`);
for (const [name, m] of byWorkflow) console.log(`  ${name}: ${m}`);
