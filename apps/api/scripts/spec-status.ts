/**
 * التقرير المشتقّ للطبقة ① — **الحالة تُشتقّ من الاختبارات ولا تُكتب** (قرار المالك 2026-09-03).
 *
 * يقرأ `SPEC.md` والوسوم `[SPEC N.N]` في أسماء الاختبارات (المصدر لا مخرَج jest) ويكتب
 * `docs/SPEC-status.md`: لكل بندٍ حالتُه في الوثيقة، وحالتُه المشتقّة، والاختبارات التي تثبته.
 * لا يعدّل `SPEC.md` — الحارس `spec-tags.spec.ts` هو الذي يُسقط الحزمة حين تختلف الوثيقة عن الشيفرة.
 *
 * التشغيل (من apps/api):
 *   npx ts-node scripts/spec-status.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectTags, listTestFiles, normalizeStatus, parseSpec } from '../src/common/spec-tags.util';

const REPO = join(__dirname, '..', '..', '..');
const rows = parseSpec(readFileSync(join(REPO, 'SPEC.md'), 'utf8'));
const files = listTestFiles([join(REPO, 'apps', 'api', 'src'), join(REPO, 'apps', 'api', 'test'), join(REPO, 'apps', 'web', 'src')]);
const { tagged, testCount } = collectTags(files, REPO);
const untestedDoc = JSON.parse(readFileSync(join(REPO, 'docs', 'spec-untested.json'), 'utf8')) as { ids: string[]; notes?: Record<string, string> };
const untested = untestedDoc.ids;
const untestedNotes = untestedDoc.notes ?? {};

const proofs = new Map<string, { file: string; name: string; kind: string }[]>();
for (const t of tagged.filter((x) => !x.skipped))
  for (const id of t.ids) proofs.set(id, [...(proofs.get(id) ?? []), { file: t.file, name: t.name, kind: t.e2e ? 'e2e' : t.live ? 'حيّ' : t.file.startsWith('apps/web/') ? 'ويب' : 'وحدة' }]);

const DOC = { done: '✅', partial: '🟨', todo: '⬜', other: '·' } as const;
const withStatus = rows.filter((r) => r.status !== null);
const proven = withStatus.filter((r) => proofs.has(r.id));
const docDone = withStatus.filter((r) => normalizeStatus(r.status!) === 'done');
const lagging = proven.filter((r) => normalizeStatus(r.status!) !== 'done');
const unproven = docDone.filter((r) => !proofs.has(r.id));

const lines: string[] = [];
lines.push('# حالة SPEC المشتقّة من الاختبارات — تقريرٌ مولَّد، لا يُحرَّر بيد');
lines.push('');
lines.push(`> يولّده \`apps/api/scripts/spec-status.ts\` من \`SPEC.md\` ومن الوسوم \`[SPEC N.N]\` في أسماء الاختبارات.`);
lines.push(`> **الحالة تُشتقّ ولا تُكتب** (قرار المالك 2026-09-03). والحارس \`spec-tags.spec.ts\` يُسقط الحزمة حين تختلف الوثيقة عن الشيفرة.`);
lines.push('');
lines.push('| القياس | العدد |');
lines.push('|---|---|');
lines.push(`| بنود SPEC | ${rows.length} |`);
lines.push(`| منها في جداولٍ لها عمودُ حالة | ${withStatus.length} |`);
lines.push(`| تقول الوثيقة ✅ | ${docDone.length} |`);
lines.push(`| لها اختبارٌ موسومٌ يعمل (مشتقّةً ✅) | ${proven.length} |`);
lines.push(`| ✅ في الوثيقة بلا اختبارٍ موسوم (دَينٌ معلَن في spec-untested.json) | ${unproven.length} (منها ${unproven.filter((r) => untested.includes(r.id)).length} معلَنة) |`);
lines.push(`| اختبارٌ يثبتها والوثيقة تقول غير ✅ (تخلّف SPEC) | ${lagging.length} |`);
lines.push(`| اختباراتٌ موسومة / كل الاختبارات | ${tagged.filter((t) => !t.skipped).length} / ${testCount} |`);
lines.push('');
lines.push('| # | البند | الوثيقة | المشتقّة | الاختبارات التي تثبته |');
lines.push('|---|---|---|---|---|');
for (const r of rows) {
  const p = proofs.get(r.id) ?? [];
  const doc = r.status === null ? '—' : DOC[normalizeStatus(r.status)];
  const derived = r.status === null ? (p.length ? '✅' : '—') : p.length ? '✅' : untested.includes(r.id) ? '⬜ (دَين معلَن)' : '⬜';
  const note = untestedNotes[r.id] ? `⚠️ ${untestedNotes[r.id].replace(/\|/g, '\\|')}` : '';
  const tests = p.map((x) => `\`${x.file.replace(/^apps\//, '')}\` :: ${x.name.replace(/\|/g, '\\|')} (${x.kind})`).join('<br>') || note || '—';
  lines.push(`| ${r.id} | ${r.text.replace(/\|/g, '\\|').slice(0, 90)} | ${doc} | ${derived} | ${tests} |`);
}
writeFileSync(join(REPO, 'docs', 'SPEC-status.md'), lines.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ rows: rows.length, withStatus: withStatus.length, docDone: docDone.length, proven: proven.length, unproven: unproven.length, lagging: lagging.length, taggedTests: tagged.length, testCount }));
