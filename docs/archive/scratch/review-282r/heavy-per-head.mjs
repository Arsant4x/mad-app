// لكلّ تشغيلٍ ثقيل (`web-tests`) في نافذة: حدثُه ورأسُه وفرعُه ودقائقُ وظائفه الثقيلة، سطرَ JSON.
// node heavy-per-head.mjs <since> <until> > out.jsonl
// ⚠️ بحثُ GitHub يقف عند 1000: تسقط الأداةُ إن بلغته.
import { execFileSync } from 'node:child_process';
const [since, until] = process.argv.slice(2);
const gh = (p) => JSON.parse(execFileSync('gh', ['api', p], { maxBuffer: 1 << 26 }).toString('utf8'));
const range = `${since}..${until}`;
const runs = [];
let reported = 0;
for (let page = 1; page <= 10; page++) {
  const r = gh(`repos/Arsant4x/mad-app/actions/workflows/web-tests.yml/runs?created=${encodeURIComponent(range)}&per_page=100&page=${page}`);
  reported = r.total_count;
  runs.push(...r.workflow_runs);
  if (r.workflow_runs.length < 100) break;
}
if (runs.length >= 1000 || reported > runs.length) {
  console.error(`✖ ${range}: ${runs.length} من ${reported}، ضيّق النافذة`);
  process.exit(1);
}
for (const run of runs) {
  const jobs = gh(`repos/Arsant4x/mad-app/actions/runs/${run.id}/jobs?per_page=100`).jobs;
  let minutes = 0;
  const per = {};
  for (const j of jobs) {
    if (j.name === 'gate' || !j.started_at || !j.completed_at || j.conclusion === 'skipped') continue;
    const m = Math.ceil((new Date(j.completed_at) - new Date(j.started_at)) / 60000);
    minutes += m;
    per[j.name] = { m, c: j.conclusion };
  }
  if (!minutes) continue;
  console.log(JSON.stringify({ id: run.id, event: run.event, branch: run.head_branch, sha: run.head_sha, at: run.created_at, attempt: run.run_attempt, conclusion: run.conclusion, minutes, per, prs: (run.pull_requests ?? []).map((p) => p.number) }));
}
console.error(`${range}: runs=${runs.length}`);
