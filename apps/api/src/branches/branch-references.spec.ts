import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from '../common/source-scan.util';
import { BRANCH_REFERENCES, nameList, OPEN_WHERE } from './branch-references';

// يقرأ بياناتٍ معلَنة عمداً (`ق-٣٧٥`): نصُّ المخطَّط بياناتُه — أسماءُ النماذج وأعمدتُها — لا شيفرةٌ تُجرَّد.
readsDeclaredStrings();

/**
 * 🔴 **حارسُ التصنيف** (`ق-١٤٣٥`): كلُّ نموذجٍ يحمل `branchId` في المخطَّط مصنَّفٌ في `BRANCH_REFERENCES` — **وإلا سقطت
 * الحزمة**، فنموذجٌ جديدٌ في فرعٍ لا يُفرَغ صامتاً عند حذف الفرع لأنه نُسي في القائمة. **ويُقرأ المخطَّطُ نفسُه** لا العميلُ
 * المولَّد (عميلُ Prisma مشتركٌ بين نسخ العمل، وآخرُ من ولّده يملكه).
 */
const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

function modelsWithBranchColumn(schema: string): string[] {
  const out: string[] = [];
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    if (/^\s*branchId\s+String/m.test(m[2])) out.push(m[1]);
  }
  return out.sort();
}

// لا وسمَ `[SPEC]` هنا عمداً: حارسٌ يقرأ المخطَّط والشيفرة ليس إثباتاً لبندٍ وإن مرّ به — والإثباتُ الحيّ في
// `test/branch-delete-contents.e2e-spec.ts`.
describe('ما يشير إلى الفرع مصنَّفٌ كلُّه — فحذفُ الفرع لا يُفرغ نموذجاً نُسي (ق-١٤٣٥)', () => {
  const inSchema = modelsWithBranchColumn(SCHEMA);

  it('المسبارُ يرى: يجد نموذجاً يحمل الفرع ولا يجد نموذجاً لا يحمله', () => {
    expect(inSchema).toContain('Invoice');
    expect(inSchema).not.toContain('Customer');
    expect(inSchema.length).toBeGreaterThan(10);
  });

  it('كلُّ نموذجٍ يحمل `branchId` في المخطَّط مصنَّفٌ — ولا تصنيفَ لنموذجٍ غائب', () => {
    const classified = Object.keys(BRANCH_REFERENCES).sort();
    const missing = inSchema.filter((m) => !classified.includes(m));
    const stale = classified.filter((m) => !inSchema.includes(m));
    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });

  it('ولكلِّ مستندٍ يُغلق حالُ «المفتوح» — وما سواه تاريخ', () => {
    const open = Object.entries(BRANCH_REFERENCES)
      .filter(([, kind]) => kind === 'open')
      .map(([model]) => model)
      .sort();
    expect(Object.keys(OPEN_WHERE).sort()).toEqual(open);
  });

  it('والرسالةُ تسمّي ولا تُغرق — عشرةُ أسماءٍ ثم «…»', () => {
    expect(nameList(['أ', 'ب'])).toBe('أ · ب');
    const twelve = Array.from({ length: 12 }, (_, i) => `ن${i + 1}`);
    expect(nameList(twelve)).toBe(`${twelve.slice(0, 10).join(' · ')} · …`);
  });
});
