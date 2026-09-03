import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectTags, listTestFiles, normalizeStatus, parseSpec, TAG_RE, type SpecRow } from './spec-tags.util';

/**
 * حارس الطبقة ① — **الحالة تُشتقّ من الاختبارات ولا تُكتب** (قرار المالك 2026-09-03).
 *
 * الوسم في **أول اسم الاختبار**: `[SPEC 4.5] …` أو `[SPEC 4.5 4.6] …` — **للمبنيّ فقط**.
 * (المثال هنا بلا `it(` عمداً: في أول تشغيلٍ قرأ الحارس مثالَي توثيقه هذا وسمَين حقيقيَّين.)
 * وثلاثة حرّاس معتمدة (وأثمنها الثالث بحكم المالك):
 *
 *   ① وسمٌ يشير إلى بندٍ لا وجود له في `SPEC.md` → يُسقط.
 *   ② بندٌ تقول الوثيقة عنه ✅ **بلا اختبارٍ موسومٍ يعمل** → يُسقط — إلا ما أُعلن دَيناً في
 *      `docs/spec-untested.json` (مِسنَن: يُحذف يوم يُوسَم اختباره، وإن بقي مكتوباً بعد سداده أسقط).
 *   ③ بندٌ له اختبارٌ موسومٌ يعمل **والوثيقة تقول ⬜ أو 🟨 أو غيرهما** → يُسقط — **فهو الذي يمسك
 *      تخلّف SPEC عن الشيفرة.**
 *
 * وحارسٌ رابع لازم للثلاثة: وسمٌ على اختبارٍ متخطّى (`it.skip` · `it.todo` · `xit`) ادّعاءٌ بلا تشغيل → يُسقط.
 *
 * حدّه المقيس (2026-09-03): ٢٧٣ بنداً، منها **١٧٩** في جداولٍ لها عمودُ حالة (`mad-app` أو `الحالة`)
 * و**٩٤** في جداولٍ بلا عمودِ حالة (أولوية فقط) — هذه لا تدّعي شيئاً فلا تُحاسَب على ✅/⬜، ووسمُها جائز.
 *
 * **سطح الإثبات ثلاثة أنواعٍ كلها تعمل في CI**: وحدات `src` (`api-unit`) · الحيّة `*.live.spec.ts` وطرفٌ
 * إلى طرف `apps/api/test/*.e2e-spec.ts` (`db-integration` عبر `npm run test:e2e`) · الويب `*.test.tsx`
 * (`vitest`). مقيس 2026-09-03: **معظم بنود ✅ لا يثبتها إلا e2e** (٤٧٩ اختباراً في ٨٢ ملفاً) —
 * فحصرُ السطح في `src` كان سيُعلن ٧٧ دَيناً كاذباً. والنوع يُذكر في التقرير المشتقّ.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const SPEC = join(REPO, 'SPEC.md');
const UNTESTED = join(REPO, 'docs', 'spec-untested.json');
const TEST_ROOTS = [join(REPO, 'apps', 'api', 'src'), join(REPO, 'apps', 'api', 'test'), join(REPO, 'apps', 'web', 'src')];

export function loadUntested(path = UNTESTED): string[] {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { ids?: unknown };
  if (!Array.isArray(doc.ids) || !doc.ids.every((x) => typeof x === 'string' && /^[0-9]+\.[0-9]+$/.test(x))) {
    throw new Error(`docs/spec-untested.json: ids يجب أن تكون مصفوفةَ معرّفاتٍ N.N`);
  }
  return doc.ids as string[];
}

describe('حارس الطبقة ① — [SPEC N.N] في اسم الاختبار، والحالة تُشتقّ لا تُكتب', () => {
  const rows = parseSpec(readFileSync(SPEC, 'utf8'));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const files = listTestFiles(TEST_ROOTS);
  const { tagged, testCount } = collectTags(files, REPO);
  const active = tagged.filter((t) => !t.skipped);
  const provenIds = new Set(active.flatMap((t) => t.ids));
  const untested = new Set(loadUntested());

  it('السطح غير فارغ — وإلا فالحارس يفحص العدم', () => {
    expect(rows.length).toBeGreaterThanOrEqual(273);
    expect(rows.filter((r) => r.status !== null).length).toBeGreaterThanOrEqual(179);
    expect(files.length).toBeGreaterThanOrEqual(50);
    expect(testCount).toBeGreaterThan(300);
  });

  it('⭐ ① كل وسمٍ يشير إلى بندٍ موجودٍ في SPEC.md', () => {
    const unknown = tagged.flatMap((t) => t.ids.filter((id) => !byId.has(id)).map((id) => `${id} ← ${t.file}: ${t.name}`));
    expect(unknown).toEqual([]);
  });

  it('⭐ ② كل بندٍ تقول الوثيقة عنه ✅ له اختبارٌ موسومٌ يعمل — أو دَينٌ معلَن في docs/spec-untested.json', () => {
    const doneRows = rows.filter((r) => r.status !== null && normalizeStatus(r.status) === 'done');
    const fresh = doneRows.filter((r) => !provenIds.has(r.id) && !untested.has(r.id)).map((r) => `${r.id} (سطر ${r.line}) ${r.text.slice(0, 60)}`);
    expect(fresh).toEqual([]);
  });

  it('⭐ ②-مِسنَن: الدَّين المعلَن ينقص ولا يبقى مكتوباً بعد سداده', () => {
    const settled = [...untested].filter((id) => provenIds.has(id)).map((id) => `${id} — له اختبارٌ موسوم الآن: احذفه من spec-untested.json`);
    const stale = [...untested].filter((id) => {
      const r = byId.get(id);
      return !r || r.status === null || normalizeStatus(r.status) !== 'done';
    }).map((id) => `${id} — لم يعد ✅ في الوثيقة (أو لا وجود له): احذفه من spec-untested.json`);
    expect({ settled, stale }).toEqual({ settled: [], stale: [] });
  });

  it('⭐⭐ ③ كل بندٍ له اختبارٌ موسومٌ يعمل تقول الوثيقة عنه ✅ — وإلا فالوثيقة متخلّفة عن الشيفرة', () => {
    const lagging = [...provenIds]
      .map((id) => byId.get(id))
      .filter((r): r is SpecRow => !!r && r.status !== null && normalizeStatus(r.status) !== 'done')
      .map((r) => `${r.id} (سطر ${r.line}) الوثيقة تقول «${r.status}» والاختبار يثبته — حدّث SPEC.md`);
    expect(lagging).toEqual([]);
  });

  it('④ لا وسمٌ على اختبارٍ متخطّى — ادّعاءٌ بلا تشغيل', () => {
    expect(tagged.filter((t) => t.skipped).map((t) => `${t.file}: ${t.name}`)).toEqual([]);
  });

  // ⭐ الإثبات العكسي مبنيٌّ في الحارس — المُستخرِجان يمسكان ما يجب ويتركان ما يجب.
  it('المُستخرِجات مُثبَتةٌ بحالاتٍ معروفة', () => {
    const spec = [
      '## 4. المبيعات',
      '| # | الخدمة | النموذج | mad-app | أولوية |',
      '|---|---|---|---|---|',
      '| 4.5 | سندات قبض | ✅ | ✅ | عالية |',
      '| 4.6 | أعمار الذمم | ⬜ | 🟨 | متوسطة |',
      '## 20. نشاط بلا حالة',
      '| # | الخدمة | أولوية |',
      '|---|---|---|',
      '| 20.1 | خدمةٌ ذات أولوية | عالية |',
      'نثرٌ فيه | 9.9 | لا يُحتسب لأنه لا يبدأ بعمود',
    ].join('\n');
    const rows = parseSpec(spec);
    expect(rows.map((r) => `${r.id}:${r.status}`)).toEqual(['4.5:✅', '4.6:🟨', '20.1:null']); // العمود الرابع لا الثالث؛ وبلا رأسٍ لا حالة
    expect(rows.map((r) => normalizeStatus(r.status ?? '⬜'))).toEqual(['done', 'partial', 'todo']);

    // العيّنات تُبنى بدالةٍ كي لا يحوي هذا الملف `it('[SPEC …` حرفياً — وإلا عدّها الحارس وسوماً حقيقية
    // على بنودٍ حقيقية (وقع ذلك في أول تشغيل: ٤ «وسوم» و٢ «تخلّف» من عيّناته هو — §8.18، حارسٌ يقرأ اختباره).
    const call = (fn: string, name: string) => `${fn}('${name}', () => {});`;
    const src = [
      call('it', '[SPEC 4.5] سند القبض يُخصَّص جزئياً'),
      call('test', '[SPEC 4.5 4.6] بندان باختبارٍ واحد'),
      call('it.skip', '[SPEC 7.1] متخطّى'),
      call('xit', '[SPEC 7.2] معطَّل'),
      call('it', 'بلا وسم — (§8.11) إحالةٌ إلى CLAUDE لا إلى SPEC'),
      call('it', 'وسمٌ في الوسط [SPEC 4.5] لا يُحتسب'),
      call('describe', '[SPEC 4.9] على describe لا يُحتسب'),
      '// ' + call('it', '[SPEC 9.1] اختبارٌ معلَّق بتعليقٍ لا يُحتسب'),
      ' * ' + call('it', '[SPEC 9.2] مثالٌ في توثيقٍ لا يُحتسب'),
    ].join('\n');
    const { tagged, testCount } = collectTags(['/repo/apps/api/src/x/x.spec.ts'], '/repo', () => src);
    expect(testCount).toBe(6); // describe لا يُعدّ اختباراً، والمعلَّق والتوثيق يُسقَطان قبل المطابقة
    expect(tagged.map((t) => `${t.ids.join('+')}${t.skipped ? '(skip)' : ''}`)).toEqual(['4.5', '4.5+4.6', '7.1(skip)', '7.2(skip)']);
    expect(TAG_RE.test('[SPEC 4.5]x')).toBe(true);
    expect(TAG_RE.test('[SPEC 4]')).toBe(false); // معرّفٌ بلا نقطة ليس بنداً
    expect(TAG_RE.test(' [SPEC 4.5]')).toBe(false); // ليس في أول الاسم
  });
});
