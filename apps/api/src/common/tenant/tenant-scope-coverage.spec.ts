import { Prisma } from '@mad-app/db';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../source-scan.util';
import { TENANT_SCOPED_MODELS } from './tenant-scope.extension';
import { BORROWED_FROM_EXPOSED, TENANT_SCOPE_EXCEPTIONS, type ScopeLayer } from './tenant-scope-exceptions';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): أسماءُ الجداول في الهجرات ومفاتيحُ
// `KNOWN_WEAK` في الحارس الحيّ **سلاسلُ نصّية** — فتجريدُها يُعمي المقارنة.
readsDeclaredStrings();

/**
 * ⚖️ **حارسُ تغطية العزل — الطبقتان معاً، مقارَنتَين بالمخطّط** (`ق-٦٥٢`).
 *
 * ## العطلُ الذي أنشأه
 *
 * **المخطّطُ لم يُقارَن بقائمة التطبيق قطّ قبل 2026-09-12.** الحارسُ الحيّ
 * (`rls-coverage.live`) يقرأ **القاعدةَ وحدَها** (`relforcerowsecurity`)، وقائمةُ
 * `TENANT_SCOPED_MODELS` **يدويةٌ بلا شاهد** — فنموذجٌ يحمل `companyId` ولا يدخل
 * القائمةَ يمرّ بلا أن يسأله أحد. وأوّلُ قياسٍ (مشتقٌّ من `Prisma.dmmf`) وجد **ثمانيةً**
 * خارج القائمة: ستّةً تحميها القاعدةُ وحدَها **ولا يسمّيها حارس**، واثنين بلا طبقة.
 *
 * ## القاعدة — بصياغة المالك
 *
 * > **كلُّ نموذجٍ يحمل `companyId` إمّا في القائمة أو مُعلَنٌ بحجّته.**
 *
 * وشرطاه: **①** الطبقتان **معاً** — القائمةُ (التطبيق) والهجراتُ (القاعدة: `FORCE` وسياسة)
 * — **فمغطّىً في واحدةٍ يُعلَن لا يمرّ**. **②** والإعلانُ يقول **أيَّ طبقةٍ تحميه ولماذا
 * تكفي** — لا «مستثنى». **ومِسنَنٌ لا سقف**: إعلانٌ لم يعد يطابق الواقع يُسقط الحزمة،
 * فلا يبقى الدَّينُ مكتوباً بعد سداده.
 *
 * ## المصادرُ الثلاثة — كلُّها مشتقّة
 *
 * `Prisma.dmmf` للنماذج وأعمدتها وأسماء جداولها · `TENANT_SCOPED_MODELS` مستوردةً من
 * مصدرها · **ونصُّ الهجرات كلِّها** لـ`ENABLE`/`FORCE`/`CREATE POLICY` — لا القاعدةُ
 * الحيّة، فهذا الحارسُ يعمل بلا قاعدةٍ ويُكمل الحيَّ لا يكرّره. **والقائمتان
 * (`none`/`app-only` هنا و`KNOWN_WEAK` هناك) تُقارَنان في الاتجاهين** كي لا تفترقا.
 *
 * ## حدُّه معلَن
 *
 * يقرأ الهجراتِ نصّاً، فسياسةٌ أُسقطت بهجرةٍ لاحقة (`DROP POLICY`) لا يراها — والحارسُ
 * الحيّ يراها. والاثنان معاً هما الطبقتان مقروءتَين من مصدرَين.
 */
const REPO = join(__dirname, '..', '..', '..', '..', '..');
const MIGRATIONS = join(REPO, 'apps', 'api', 'prisma', 'migrations');
const LIVE_GUARD = join(__dirname, 'rls-coverage.live.spec.ts');

const models = Prisma.dmmf.datamodel.models;
const tableOf = (name: string): string => {
  const m = models.find((x) => x.name === name);
  if (!m) throw new Error(`نموذجٌ غيرُ موجود في المخطّط: ${name}`);
  return m.dbName ?? m.name;
};
const owned = models.filter((m) => m.fields.some((f) => f.name === 'companyId')).map((m) => m.name as Prisma.ModelName);

const migrationsSql = readdirSync(MIGRATIONS)
  .map((d) => join(MIGRATIONS, d, 'migration.sql'))
  .filter((p) => existsSync(p))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

function dbLayer(table: string): { enable: boolean; force: boolean; policy: boolean } {
  return {
    enable: new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`).test(migrationsSql),
    force: new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`).test(migrationsSql),
    policy: new RegExp(`CREATE POLICY [^\\n]* ON "${table}"`).test(migrationsSql),
  };
}

/** الطبقةُ الفعلية كما تقرؤها المصادر — لا كما تقول الإعلانات. */
function actualLayer(model: Prisma.ModelName): 'both' | ScopeLayer {
  const inList = TENANT_SCOPED_MODELS.has(model);
  const db = dbLayer(tableOf(model));
  const dbFull = db.force && db.policy;
  if (inList && dbFull) return 'both';
  if (!inList && dbFull) return 'db-only';
  if (inList && !dbFull) return 'app-only';
  return 'none';
}

const knownWeakTables = (): string[] => {
  const src = readFileSync(LIVE_GUARD, 'utf8');
  const body = src.slice(src.indexOf('const KNOWN_WEAK'), src.indexOf('};', src.indexOf('const KNOWN_WEAK')));
  return [...body.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
};

describe('تغطيةُ العزل — كلُّ نموذجٍ يحمل companyId إمّا في القائمة أو مُعلَنٌ بحجّته (ق-٦٥٢)', () => {
  it('السطحُ مشتقٌّ من المخطّط لا مكتوبٌ بيد — ولا اسمَ في القائمة بلا نموذج', () => {
    expect(owned.length).toBeGreaterThan(60);
    const unknown = [...TENANT_SCOPED_MODELS].filter((n) => !models.some((m) => m.name === n));
    expect(unknown).toEqual([]);
  });

  it('🔴 لا نموذجَ مغطّىً في طبقةٍ واحدةٍ بلا إعلان — والمغطّى في الطبقتين لا يُعلَن', () => {
    const undeclaredPartial = owned.filter((m) => actualLayer(m) !== 'both' && !TENANT_SCOPE_EXCEPTIONS[m]);
    expect(undeclaredPartial).toEqual([]);

    // ⚠️ **مِسنَن**: إعلانٌ على نموذجٍ صار مغطّىً في الطبقتين دَينٌ مكتوبٌ بعد سداده.
    const deadDeclarations = (Object.keys(TENANT_SCOPE_EXCEPTIONS) as Prisma.ModelName[]).filter((m) => actualLayer(m) === 'both');
    expect(deadDeclarations).toEqual([]);
  });

  it('🔴 كلُّ إعلانٍ يطابق الطبقةَ الفعلية — لا «db-only» على ما فقد سياسته ولا «none» على ما صار محمياً', () => {
    const mismatched = (Object.entries(TENANT_SCOPE_EXCEPTIONS) as [Prisma.ModelName, { layer: ScopeLayer }][])
      .filter(([m, d]) => actualLayer(m) !== d.layer)
      .map(([m, d]) => ({ model: m, declared: d.layer, actual: actualLayer(m) }));
    expect(mismatched).toEqual([]);
  });

  it('والإعلانُ يقول لماذا تكفي الطبقة — لا وسماً بلا حجّة', () => {
    for (const [model, d] of Object.entries(TENANT_SCOPE_EXCEPTIONS)) {
      // حجّةٌ تُقرأ: أكثرُ من سطرٍ قصير، وتسمّي الطبقةَ أو الدَّين.
      expect({ model, long: d.why.length >= 60 }).toEqual({ model, long: true });
    }
  });

  it('🔴 القائمتان لا تفترقان: ما أُعلن هنا «none» أو «app-only» هو بعينه KNOWN_WEAK في الحارس الحيّ — والعكس', () => {
    const here = (Object.entries(TENANT_SCOPE_EXCEPTIONS) as [Prisma.ModelName, { layer: ScopeLayer }][])
      .filter(([, d]) => d.layer !== 'db-only')
      .map(([m]) => tableOf(m))
      .sort();
    const there = knownWeakTables().sort();
    expect(there.length).toBeGreaterThan(0); // القراءةُ نفسُها مُثبَتة — لا مقارنةُ فراغٍ بفراغ
    expect(here).toEqual(there);
  });

  it('🔴 ما بلا companyId ويُبلَغ عبر أبٍ مكشوف يُعلَن مكشوفاً — مشتقّاً من المخطّط', () => {
    const exposedParents = new Set((Object.entries(TENANT_SCOPE_EXCEPTIONS) as [string, { layer: ScopeLayer }][]).filter(([, d]) => d.layer === 'none').map(([m]) => m));
    // جذرُ المستأجر نفسُه — النموذجُ الذي تشير إليه علاقاتُ `company` — لا «يستعير» من أحد:
    // هو الحدُّ لا ما وراءه. **ويُشتقّ لا يُسمّى**، فلو أُعيدت تسميتُه بقي الاشتقاقُ صحيحاً.
    const rootModel = models
      .flatMap((m) => m.fields)
      .find((f) => f.kind === 'object' && (f.relationFromFields ?? []).includes('companyId'))?.type;
    expect(rootModel).toBeTruthy();
    const borrowedFromExposed = models
      .filter((m) => m.name !== rootModel && !m.fields.some((f) => f.name === 'companyId'))
      .filter((m) => m.fields.some((f) => f.kind === 'object' && f.isRequired && !f.isList && exposedParents.has(f.type)))
      .map((m) => m.name as Prisma.ModelName);
    expect(borrowedFromExposed.length).toBeGreaterThan(0); // اليوم: CompanyUserBranch — وصفرٌ هنا يعني عمىً لا سلامة
    const undeclared = borrowedFromExposed.filter((m) => !BORROWED_FROM_EXPOSED[m]);
    expect(undeclared).toEqual([]);
    const stale = (Object.keys(BORROWED_FROM_EXPOSED) as Prisma.ModelName[]).filter((m) => !borrowedFromExposed.includes(m));
    expect(stale).toEqual([]);
  });
});
