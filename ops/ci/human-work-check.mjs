// Checks a pull request or a push against the "human work" list (standing
// rule in CLAUDE.md): added lines of product code carry no emoji, no decision
// reference, no work method word and no Arabic comment; commit messages and
// the pull request title are short English "type(scope): subject" lines.
//
// Only added lines are checked. Existing code is cleaned when its file is
// touched for another reason.
//
// Usage:
//   node ops/ci/human-work-check.mjs <event.json> [commits.jsonl]
// The diff is read from git, so the checkout needs the base commit.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { addedLines, appliesTo, isGitMergeOfMain, lineProblems, messageProblems } from './human-work.mjs';

const [eventPath, commitsPath] = process.argv.slice(2);
if (!eventPath) {
  console.error('usage: node ops/ci/human-work-check.mjs <event.json> [commits.jsonl]');
  process.exit(2);
}
const event = JSON.parse(readFileSync(eventPath, 'utf8'));
const git = (...args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

let range;
const messages = [];
if (event.pull_request) {
  const base = git('merge-base', event.pull_request.base.sha, 'HEAD').trim();
  range = [base, 'HEAD'];
  messages.push(['pull request title', event.pull_request.title]);
  if (commitsPath) {
    readFileSync(commitsPath, 'utf8').split(/\r?\n/).filter(Boolean)
      .forEach((l, i) => messages.push([`commit ${i + 1}`, JSON.parse(l)]));
  }
} else if (event.before && event.after) {
  const zero = /^0+$/.test(event.before);
  range = zero ? [`${event.after}~1`, event.after] : [event.before, event.after];
  for (const c of event.commits ?? []) messages.push([`commit ${String(c.id ?? '').slice(0, 8)}`, c.message]);
} else {
  console.error('event has neither a pull request nor a push range');
  process.exit(2);
}

const diff = git('diff', '--unified=0', '--no-color', '--diff-filter=AMR', ...range, '--', 'apps', 'packages');
const lines = addedLines(diff).filter((l) => appliesTo(l.path));

const problems = [];
for (const [label, text] of messages) {
  if (isGitMergeOfMain(text)) continue;
  for (const p of messageProblems(text)) problems.push(`${label}: ${p}: ${String(text).split('\n')[0]}`);
}
for (const l of lines) for (const p of lineProblems(l.text, l.path)) problems.push(`${l.path}:${l.line}: ${p}: ${l.text.trim().slice(0, 100)}`);

console.log(`messages=${messages.length} added-lines=${lines.length} problems=${problems.length}`);
for (const p of problems) console.log(`x ${p}`);
process.exit(problems.length ? 1 : 0);
