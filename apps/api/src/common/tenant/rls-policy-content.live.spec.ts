import { Prisma, PrismaClient } from '@mad-app/db';
import { LIVE_SPEC_TIMEOUT_MS } from '../../../test/live-spec-timeout';
import { tenantOwnedModels } from '../../export/export-scope';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * **محتوى سياسات العزل — يُقرأ من القاعدة الحيّة ويُحكم عليه** (`ق-١٤٧٤` · التوجيه ٢٦٦ §٧أ).
 *
 * ## الثقب الذي يسدّه — مقيسٌ لا مفترَض
 *
 * كلُّ حارسٍ قبله يرى **وجودَ** السياسة لا **محتواها**: `rls-coverage.live` يقرأ `ENABLE`/`FORCE`،
 * و`rls-coverage.e2e` يعدّ السياسات (`> 0`)، و`tenant-scope-coverage` يطابق رأسَ العبارة في
 * الهجرة. **والسياساتُ المتساهلة تُجمع بـ`OR`** — فسياسةٌ ثانية `USING (true)` بجوار القانونيّة
 * **تُلغيها على الجدول كلّه**، وكلُّ حارسٍ منها يبقى أخضر: `FORCE` لم يتغيّر، والعددُ صار ٢،
 * والرأسُ مطابَق. **والاستعلامُ الخامّ لا يمرّ بامتداد المستأجر** (`tenant-scope.extension.ts`
 * يعترض عمليات النماذج وحدَها)، فعلى مساراتٍ خامّةٍ بلا مرشِّح **السياسةُ هي الطبقةُ الوحيدة**.
 *
 * ## كيف يحكم
 *
 * كلُّ سياسةٍ متساهلة في `public` إمّا **قانونيّة** (`companyId = app.company_id` لكلّ الأوامر)
 * أو **استثناءٌ معتمدٌ بعينه** — بجدوله واسمه وأمره ونصِّه كاملاً وحجّته. **والمطابقةُ تامّة**:
 * `includes('app.company_id')` يمرّر `… OR true` (عيبُ التشخيص في `rls-probe.live` بعينه).
 *
 * ⭐ **والنصُّ المتوقَّع مشتقٌّ من المُحلِّل نفسِه لا مكتوبٌ بيد**: عبارةُ المصدر (كما في الهجرة)
 * تُنشأ سياسةً على جدولٍ مؤقّت في معاملةٍ تُرجَع ثم تُقرأ من `pg_policies`. فلا يُكتب هنا
 * `::text` ولا أقواسٌ يضعها `pg_get_expr` بحسب نسخته — ولا مرشِّحٌ نمطيّ بين المصدر والمخرَج.
 * ومقيسٌ قبل البناء (2026-09-26 على `mad_app_clean` بـ`app_user`، Postgres 16.14): الشكلُ
 * القانونيّ على جدولٍ مؤقّت **يساوي** سياسةَ `accounts` الحيّة، وشكلُ `company_user_branches`
 * على جدولٍ مؤقّتٍ باسمه **يساوي** الحيّة؛ والأشكالُ الحيّة خمسُ مجموعات `97/1/1/1/1` على
 * `101` سياسةً في `100` جدول.
 *
 * ⚠️ **وحدُّه معلَن**: يحكم على **شكل** السياسة ولا يرى **من يضبط** المسنَدَين اللذين تقوم
 * عليهما ثلاثةُ استثناءات (`app.platform_admin` · `app.api_key_auth`) — فاستعلامٌ خامّ يضبطهما
 * خارج مواضعهما لا يراه هذا الحارس.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** سياسةٌ كما يعرضها `pg_policies` — والأدوارُ نصوصٌ لا `name[]`. */
type PolicyRow = {
  schema: string;
  table: string;
  name: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  check: string | null;
};

/** عبارةُ الشكل القانونيّ **بنصّ الهجرة** (`init/migration.sql` ونمطُه المعلَن للتكرار). */
const CANON_SRC = `"companyId" = current_setting('app.company_id', true)`;

type ApprovedSource = {
  table: string;
  name: string;
  cmd: 'ALL' | 'SELECT';
  using: string;
  check: string | null;
  /**
   * `true`: الاستثناءُ **يوسّع بجوار** القانونيّة ولا يغني عنها — فإن زالت القانونيّةُ من جدوله
   * سقط الحارس. `false`: الاستثناءُ **بديلُها** على جدوله.
   */
  alongsideCanonical: boolean;
  why: string;
};

/**
 * **الاستثناءاتُ المعتمدة — بعبارتها المصدرية حرفاً من هجرتها، وحجّتها.**
 * هجرةٌ قادمة بشكلٍ جديد مشروع تُسقط الحارسَ حتى تُعلن هنا — وهو المقصود.
 */
const APPROVED: ApprovedSource[] = [
  {
    table: 'company_users',
    name: 'tenant_isolation_company_users',
    cmd: 'ALL',
    using: `"companyId" = current_setting('app.company_id', true) OR current_setting('app.platform_admin', true) = 'true'`,
    check: `"companyId" = current_setting('app.company_id', true)`,
    alongsideCanonical: false,
    why: 'ق-٦٧٥ · ق-٦٦٢ — مسنَدُ الإدارة يقرأ الحساباتِ عبر المنشآت (عدُّ الراكبين على قالبٍ عامّ) ولا يكتب: الكتابةُ قانونيّةٌ وحدَها. الهجرة 20260913130000_company_users_rls.',
  },
  {
    table: 'permission_templates',
    name: 'tenant_isolation_permission_templates',
    cmd: 'ALL',
    using: `"companyId" IS NULL OR "companyId" = current_setting('app.company_id', true) OR current_setting('app.platform_admin', true) = 'true'`,
    check: `"companyId" = current_setting('app.company_id', true) OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')`,
    alongsideCanonical: false,
    why: 'ق-٦٧٥ — القالبُ العامُّ (بلا منشأة) يُرى قبل أيّ سياق لأن التسجيلَ الذاتيّ يقرؤه، والكتابةُ عليه لمسنَد الإدارة وحدَه. الهجرة 20260913120000_permission_templates_rls.',
  },
  {
    table: 'company_user_branches',
    name: 'tenant_isolation_company_user_branches',
    cmd: 'ALL',
    using: `EXISTS (SELECT 1 FROM "company_users" cu WHERE cu."id" = "company_user_branches"."companyUserId" AND cu."companyId" = current_setting('app.company_id', true))`,
    check: `EXISTS (SELECT 1 FROM "company_users" cu WHERE cu."id" = "company_user_branches"."companyUserId" AND cu."companyId" = current_setting('app.company_id', true))`,
    alongsideCanonical: false,
    why: 'ق-٦٥٣ — الجدولُ بلا companyId، فيُبلَغ العزلُ عبر أبيه company_users بشرط المنشأة نفسِه. الهجرة 20260913130000_company_users_rls.',
  },
  {
    table: 'api_keys',
    name: 'api_key_authentication',
    cmd: 'SELECT',
    using: `current_setting('app.api_key_auth', true) = 'true'`,
    check: null,
    alongsideCanonical: true,
    why: 'ق-١٢٩١ — المفتاحُ يُقدَّم قبل أن يُعرف مستأجرُه: قراءةٌ فقط، ومسارٌ واحد (runAsApiKeyLookup)، وبالبادئة الفريدة. وتبقى القانونيّةُ بجواره لكلّ ما عدا ذلك. الهجرة 20260923000000_api_keys.',
  },
  // ── قوالبُ النماذج (توجيه ٢٧٨ · ق-١٦٣٤): سياستان بدل القانونيّة على كلِّ جدول ──
  {
    table: 'form_templates',
    name: 'tenant_isolation_form_templates',
    cmd: 'ALL',
    using: `"companyId" = current_setting('app.company_id', true) OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')`,
    check: `"companyId" = current_setting('app.company_id', true) OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')`,
    alongsideCanonical: false,
    why: 'ق-١٦٣٤ — القالبُ العامُّ تملكه المنصّة: يكتبه مسنَدُ الإدارة وحدَه، وهذه السياسةُ وحدَها تحكم الحذف فلا يحذف مستأجرٌ قالباً عامّاً؛ ومسنَدُ الإدارة لا يقرأ نسخَ التجّار. الهجرة 20261004000000_form_templates.',
  },
  {
    table: 'form_templates',
    name: 'public_read_form_templates',
    cmd: 'SELECT',
    using: `"companyId" IS NULL`,
    check: null,
    alongsideCanonical: false,
    why: 'ق-١٦٣٤ — القالبُ العامُّ يُقرأ من كلِّ سياقٍ لتنسخ منه المنشأة؛ قراءةٌ فقط. الهجرة 20261004000000_form_templates.',
  },
  {
    table: 'form_template_items',
    name: 'tenant_isolation_form_template_items',
    cmd: 'ALL',
    using: `"companyId" = current_setting('app.company_id', true) OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')`,
    check: `"companyId" = current_setting('app.company_id', true) OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')`,
    alongsideCanonical: false,
    why: 'ق-١٦٣٤ — بنودُ القالب بنطاق قالبها وصياغته. الهجرة 20261004000000_form_templates.',
  },
  {
    table: 'form_template_items',
    name: 'public_read_form_template_items',
    cmd: 'SELECT',
    using: `"companyId" IS NULL`,
    check: null,
    alongsideCanonical: false,
    why: 'ق-١٦٣٤ — بنودُ القالب العامّ تُقرأ مع قالبها من كلِّ سياق؛ قراءةٌ فقط. الهجرة 20261004000000_form_templates.',
  },
];

const ROLLBACK = 'rls-policy-content: rollback';

/** معاملةٌ تُرجَع دائماً — القاعدةُ بعد التشغيل كما قبله. */
async function rolledBack<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  let ran = false;
  await prisma
    .$transaction(
      async (tx) => {
        out = await fn(tx);
        ran = true;
        throw new Error(ROLLBACK);
      },
      { timeout: 30_000, maxWait: 30_000 },
    )
    .catch((e: unknown) => {
      if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
    });
  if (!ran) throw new Error('المعاملةُ لم تكتمل');
  return out as T;
}

/** يقرأ سياساتِ مخطَّطٍ بعينه — من العميل أو من داخل معاملة (فيرى ما لم يُلتزم). */
const readPolicies = (db: Db, schema = 'public') => db.$queryRaw<PolicyRow[]>`
  SELECT p.schemaname AS schema, p.tablename AS "table", p.policyname AS name, p.permissive,
         p.roles::text[] AS roles, p.cmd, p.qual, p.with_check AS "check"
    FROM pg_policies p
   WHERE p.schemaname = ${schema}
   ORDER BY p.tablename, p.policyname`;

type Expected = { cmd: string; roles: string[]; qual: string | null; check: string | null };
type Derived = { canon: Expected; approved: (ApprovedSource & { expected: Expected })[] };

/**
 * يشتقّ النصَّ المتوقَّع من المُحلِّل: كلُّ عبارةٍ مصدرية تُنشأ سياسةً على جدولٍ مؤقّت ثم تُقرأ.
 * وحين تسمّي العبارةُ جدولَها (شكلُ `company_user_branches`) يُسمّى الجدولُ المؤقّت باسمه —
 * فالجداولُ المؤقّتة تسبق `public` في البحث، وتزول مع الإرجاع.
 */
async function derive(prisma: PrismaClient): Promise<Derived> {
  return rolledBack(prisma, async (tx) => {
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "__rls_shape" ("id" text, "companyId" text, "companyUserId" text)`);
    const createOn = async (table: string, name: string, cmd: string, using: string, check: string | null) => {
      await tx.$executeRawUnsafe(
        `CREATE POLICY "${name}" ON "${table}" FOR ${cmd} USING (${using})${check === null ? '' : ` WITH CHECK (${check})`}`,
      );
    };
    await createOn('__rls_shape', '__expect_canon', 'ALL', CANON_SRC, CANON_SRC);
    for (const [i, a] of APPROVED.entries()) {
      const namesItself = a.using.includes(`"${a.table}"`) || (a.check ?? '').includes(`"${a.table}"`);
      if (namesItself) {
        await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${a.table}" ("id" text, "companyId" text, "companyUserId" text)`);
      }
      await createOn(namesItself ? a.table : '__rls_shape', `__expect_${i}`, a.cmd, a.using, a.check);
    }
    const rows = await tx.$queryRaw<(PolicyRow & { name: string })[]>`
      SELECT p.schemaname AS schema, p.tablename AS "table", p.policyname AS name, p.permissive,
             p.roles::text[] AS roles, p.cmd, p.qual, p.with_check AS "check"
        FROM pg_policies p
       WHERE starts_with(p.policyname, '__expect_')`;
    const pick = (name: string): Expected => {
      const r = rows.find((x) => x.name === name);
      if (!r) throw new Error(`الاشتقاقُ لم يُنتج ${name}`);
      return { cmd: r.cmd, roles: r.roles, qual: r.qual, check: r.check };
    };
    return {
      canon: pick('__expect_canon'),
      approved: APPROVED.map((a, i) => ({ ...a, expected: pick(`__expect_${i}`) })),
    };
  });
}

const sameRoles = (a: string[], b: string[]) => [...a].sort().join(',') === [...b].sort().join(',');

type Verdict = 'canonical' | 'approved' | 'restrictive' | 'offender';

/**
 * المصنِّف — **مطابقةٌ تامّة** لا جزئية.
 *   · المقيِّدةُ (`RESTRICTIVE`) تُضيّق ولا توسّع (`AND`) — ليست تسريباً.
 *   · القانونيّةُ لكلّ الأوامر: `USING` قانونيّ و`WITH CHECK` قانونيّ **أو غائب** (Postgres يأخذ
 *     `USING` شرطاً للكتابة حين يغيب في سياسة `ALL`، فالغيابُ آمنٌ لا مخالفة).
 *   · المعتمدُ: جدولُه واسمُه وأمرُه وأدوارُه ونصّاه كلُّها كما اشتُقّت.
 */
function classify(p: PolicyRow, derived: Derived): Verdict {
  if (p.permissive !== 'PERMISSIVE') return 'restrictive';
  const c = derived.canon;
  if (p.cmd === 'ALL' && sameRoles(p.roles, c.roles) && p.qual === c.qual && (p.check === c.qual || p.check === null)) {
    return 'canonical';
  }
  const hit = derived.approved.some(
    (a) =>
      a.table === p.table &&
      a.name === p.name &&
      a.expected.cmd === p.cmd &&
      sameRoles(a.expected.roles, p.roles) &&
      a.expected.qual === p.qual &&
      a.expected.check === p.check,
  );
  return hit ? 'approved' : 'offender';
}

const offenders = (rows: PolicyRow[], derived: Derived) =>
  rows
    .filter((p) => classify(p, derived) === 'offender')
    .map((p) => `${p.table}.${p.name} [${p.permissive} ${p.cmd} TO ${p.roles.join(',')}] USING ${p.qual ?? '∅'} · CHECK ${p.check ?? '∅'}`);

/**
 * كلُّ جدولٍ عليه عزلٌ أو سياسة: له سياسةٌ متساهلة **تكفيه** — قانونيّةٌ أو معتمدٌ بديلٌ عنها؛
 * والمعتمدُ «بجوار القانونيّة» يشترط بقاءَها. وإلا فالجدولُ أعمى (سياساتُه كلُّها مقيِّدة) أو
 * واقفٌ على استثنائه وحدَه.
 */
function uncovered(tables: string[], rows: PolicyRow[], derived: Derived): string[] {
  const out: string[] = [];
  for (const t of tables) {
    const mine = rows.filter((p) => p.table === t);
    const canonical = mine.some((p) => classify(p, derived) === 'canonical');
    const approvedHere = derived.approved.filter((a) => mine.some((p) => p.name === a.name && classify(p, derived) === 'approved'));
    const standalone = approvedHere.some((a) => !a.alongsideCanonical);
    const needsCanonical = approvedHere.filter((a) => a.alongsideCanonical && !canonical).map((a) => a.name);
    // استثناءٌ «بجوار القانونيّة» بلا قانونيّةٍ يُسمّى بعينه أدناه — لا مرّتين (قِيس في أوّل تشغيلٍ في السير).
    if (!canonical && !standalone && approvedHere.length === 0) out.push(`${t}: لا سياسةَ قانونيّةً ولا استثناءً بديلاً`);
    for (const n of needsCanonical) out.push(`${t}: الاستثناءُ ${n} يشترط القانونيّةَ بجواره وقد غابت`);
  }
  return out.sort();
}

type TableFlags = { table: string; enabled: boolean; forced: boolean };

/** الجداولُ التي عليها عزلٌ أو سياسة في `public` — بعلَمَيها. */
const readTables = (db: Db) => db.$queryRaw<TableFlags[]>`
  SELECT c.relname AS "table", c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relkind = 'r'
     AND (c.relrowsecurity OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
   ORDER BY 1`;

/** اسمُ جدول المسبار — فريدٌ لكلّ اتصال، أرقامٌ وحدَها فلا حقنَ في النصّ الخامّ. */
async function probeName(tx: Tx): Promise<string> {
  const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  if (!Number.isInteger(pid)) throw new Error('pg_backend_pid لم يُقرأ');
  return `__rls_probe_${pid}`;
}

/** جدولُ مسبارٍ في `public` بعزلٍ قانونيٍّ كامل — يملكه دورُ الاتصال، ويزول مع الإرجاع. */
async function makeProbe(tx: Tx): Promise<string> {
  const t = await probeName(tx);
  await tx.$executeRawUnsafe(`CREATE TABLE "${t}" ("id" text PRIMARY KEY, "companyId" text NOT NULL)`);
  await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
  await tx.$executeRawUnsafe(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`);
  await tx.$executeRawUnsafe(`CREATE POLICY "tenant_isolation_${t}" ON "${t}" USING (${CANON_SRC}) WITH CHECK (${CANON_SRC})`);
  return t;
}

/** يضبط السياقَ ويقرؤه بعد ضبطه — الآليةُ لا الأثر (`ق-٤٤٩`). */
async function asCompany(tx: Tx, companyId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
  const [{ ctx }] = await tx.$queryRaw<{ ctx: string }[]>`SELECT current_setting('app.company_id', true) AS ctx`;
  if (ctx !== companyId) throw new Error(`السياقُ لم يُضبط: ${ctx}`);
}

const countRow = async (tx: Tx, table: string, id: string) =>
  Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}" WHERE "id" = $1`, id))[0].n);

d('محتوى سياسات العزل — كلُّ سياسةٍ متساهلة قانونيّةٌ أو استثناءٌ معتمدٌ بعينه', () => {
  const prisma = new PrismaClient();
  let derived: Derived;
  let live: PolicyRow[];

  beforeAll(async () => {
    derived = await derive(prisma);
    live = await readPolicies(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⓪ حارسٌ على المسبار: القراءةُ أعادت السياسات، والاشتقاقُ يطابق حالةً معلومة ويخالف أخرى', () => {
    // قراءةٌ فارغة تجعل كلَّ ما تحتها يمرّ وهو لم يفحص شيئاً.
    expect(live.length).toBeGreaterThan(90);
    const accounts = live.find((p) => p.name === 'tenant_isolation_accounts');
    expect(accounts).toBeDefined();
    expect(derived.canon.qual).toBeTruthy();
    // حالةٌ يجب أن تُطابَق: سياسةُ `accounts` قانونيّةٌ بنصّ الهجرة.
    expect(accounts?.qual).toBe(derived.canon.qual);
    // وحالةٌ يجب ألّا تُطابَق: مسنَدُ المفاتيح لا يقيّد بالمنشأة.
    const apiKeyAuth = live.find((p) => p.name === 'api_key_authentication');
    expect(apiKeyAuth).toBeDefined();
    expect(apiKeyAuth?.qual).not.toBe(derived.canon.qual);
  });

  it('[SPEC 1.2] ⭐ كلُّ سياسةٍ متساهلة قانونيّةٌ أو استثناءٌ معتمدٌ بعينه — مطابقةً تامّة', () => {
    expect(offenders(live, derived)).toEqual([]);
  });

  it('[SPEC 1.2] ⭐ وكلُّ جدولٍ عليه عزلٌ مكفيٌّ بسياسةٍ تقيّد بالمنشأة، وعزلُه قائم', async () => {
    const tables = await readTables(prisma);
    expect(tables.length).toBeGreaterThan(90);
    expect(uncovered(tables.map((t) => t.table), live, derived)).toEqual([]);

    // السياسةُ تبقى بعد تعطيل العزل — فمحتوىً بلا نفاذ ليس عزلاً.
    const disabled = tables.filter((t) => !t.enabled).map((t) => t.table);
    expect(disabled).toEqual([]);

    // و`FORCE` للجداول التي لا يشتقّها `rls-coverage.live` (بلا `companyId` — كـ`company_user_branches`):
    // ذاك يحرس ما يملكه المستأجر بالاشتقاق، وهذا ما عليه سياسةٌ خارجه.
    const derivedByOwner = new Set(
      Prisma.dmmf.datamodel.models.filter((m) => new Set(tenantOwnedModels()).has(m.name)).map((m) => m.dbName ?? m.name),
    );
    const unforcedOutside = tables.filter((t) => !derivedByOwner.has(t.table) && !t.forced).map((t) => t.table);
    expect(unforcedOutside).toEqual([]);
  });

  it('⭐ والاستثناءاتُ صادقةٌ في الاتجاهين: كلٌّ موجودٌ حيّاً ومطابق، ولكلٍّ حجّة', () => {
    for (const a of derived.approved) {
      const row = live.find((p) => p.table === a.table && p.name === a.name);
      expect({ name: a.name, present: Boolean(row) }).toEqual({ name: a.name, present: true });
      expect({ name: a.name, verdict: row && classify(row, derived) }).toEqual({ name: a.name, verdict: 'approved' });
      // استثناءٌ صار قانونيّاً سطرٌ ميت يُقرأ بعد سنةٍ قراراً.
      expect({ name: a.name, alsoCanonical: a.expected.qual === derived.canon.qual }).toEqual({ name: a.name, alsoCanonical: false });
      expect({ name: a.name, hasReason: a.why.trim().length > 40 }).toEqual({ name: a.name, hasReason: true });
    }
  });

  it('🔴 الإثباتُ بالعكس: `USING (true)` بجوار القانونيّة يُمسك — وهو تسريبٌ حقيقيّ لا شكلٌ فقط', async () => {
    const result = await rolledBack(prisma, async (tx) => {
      const t = await makeProbe(tx);
      await asCompany(tx, 'rls-probe-a');
      await tx.$executeRawUnsafe(`INSERT INTO "${t}" ("id", "companyId") VALUES ('row-a', 'rls-probe-a')`);
      await asCompany(tx, 'rls-probe-b');
      const beforeOpen = await countRow(tx, t, 'row-a');
      const cleanOffenders = offenders(await readPolicies(tx), derived);

      await tx.$executeRawUnsafe(`CREATE POLICY "__probe_open" ON "${t}" USING (true) WITH CHECK (true)`);
      // وقوعُ الكسر أوّلاً (`§8.8`): السياسةُ موجودةٌ داخل المعاملة.
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_policies WHERE policyname = '__probe_open'`;
      const caught = offenders(await readPolicies(tx), derived);
      const crossRead = await countRow(tx, t, 'row-a');

      await tx.$executeRawUnsafe(`DROP POLICY "__probe_open" ON "${t}"`);
      const afterDrop = await countRow(tx, t, 'row-a');
      return { t, placed: Number(n), beforeOpen, cleanOffenders, caught, crossRead, afterDrop };
    });

    expect(result.placed).toBe(1);
    // الضابط: قبل الكسر لا تسريبَ ولا مخالف — جدولُ المسبار نفسُه قانونيّ.
    expect(result.beforeOpen).toBe(0);
    expect(result.cleanOffenders).toEqual([]);
    // الكسر: الحارسُ يسمّيه، والسياقُ «ب» يقرأ صفَّ «أ».
    expect(result.caught.some((o) => o.startsWith(`${result.t}.__probe_open `))).toBe(true);
    expect(result.crossRead).toBe(1);
    // والتفاوتُ سببه السياسةُ المحقونة وحدها.
    expect(result.afterDrop).toBe(0);
  });

  /**
   * ⑤ **صياغاتٌ يكتبها مطوّرٌ فعلاً** (`§8.8` الوجه الثاني) — كلٌّ في معاملته، لأن خطأ Postgres
   * يُجهض المعاملة. والثانيةُ «إصلاحُ» دَين `KNOWN_WEAK` بعينه: `FORCE` ثم فتحُ قراءة المدير.
   */
  const LEAKY: [string, (t: string) => string][] = [
    ['القانونيّة `OR true`', (t) => `CREATE POLICY "__probe_v" ON "${t}" USING (${CANON_SRC} OR true) WITH CHECK (${CANON_SRC})`],
    ['قراءةُ المدير `FOR SELECT USING (true)`', (t) => `CREATE POLICY "__probe_v" ON "${t}" FOR SELECT USING (true)`],
    ['كتابةٌ مفتوحة `WITH CHECK (true)`', (t) => `CREATE POLICY "__probe_v" ON "${t}" USING (${CANON_SRC}) WITH CHECK (true)`],
    [
      'مسنَدُ الإدارة على جدولٍ عاديّ',
      (t) => `CREATE POLICY "__probe_v" ON "${t}" USING (${CANON_SRC} OR current_setting('app.platform_admin', true) <> 'false')`,
    ],
    ['`TO app_user USING (true)`', (t) => `CREATE POLICY "__probe_v" ON "${t}" TO app_user USING (true)`],
  ];

  it.each(LEAKY)('⑤ يُمسك: %s', async (_label, sql) => {
    const caught = await rolledBack(prisma, async (tx) => {
      const t = await makeProbe(tx);
      await tx.$executeRawUnsafe(sql(t));
      return { t, offenders: offenders(await readPolicies(tx), derived) };
    });
    expect(caught.offenders.some((o) => o.startsWith(`${caught.t}.__probe_v `))).toBe(true);
  });

  /**
   * ⑥ **الضوابطُ — يجب ألّا تُمسك** (`§8.15`: حارسٌ يُمسك كلَّ شيء يُمسك الكسرَ أيضاً فيبدو عاملاً).
   */
  const SAFE: [string, (t: string) => string][] = [
    ['مقيِّدةٌ `AS RESTRICTIVE USING (true)`', (t) => `CREATE POLICY "__probe_v" ON "${t}" AS RESTRICTIVE USING (true)`],
    ['قانونيّةٌ مكرَّرة باسمٍ آخر', (t) => `CREATE POLICY "__probe_v" ON "${t}" USING (${CANON_SRC}) WITH CHECK (${CANON_SRC})`],
    ['قانونيّةٌ بلا `WITH CHECK`', (t) => `CREATE POLICY "__probe_v" ON "${t}" USING (${CANON_SRC})`],
  ];

  it.each(SAFE)('⑥ لا يُمسك: %s', async (_label, sql) => {
    const out = await rolledBack(prisma, async (tx) => {
      const t = await makeProbe(tx);
      await tx.$executeRawUnsafe(sql(t));
      const rows = await readPolicies(tx);
      return { placed: rows.some((p) => p.table === t && p.name === '__probe_v'), offenders: offenders(rows, derived) };
    });
    expect(out.placed).toBe(true);
    expect(out.offenders).toEqual([]);
  });

  it('⑥ والتغطيةُ تُمسك: استثناءٌ «بجوار القانونيّة» زالت قانونيّتُه، وجدولٌ سياساتُه كلُّها مقيِّدة', async () => {
    // على البيانات الحيّة لا قائمةٍ مصطنعة — ودالّةٌ نقيّة فلا قفلَ على `api_keys` الحقيقيّ.
    const withoutCanon = live.filter((p) => p.name !== 'tenant_isolation_api_keys');
    expect(withoutCanon.length).toBe(live.length - 1);
    expect(uncovered(['api_keys'], withoutCanon, derived)).toEqual([
      'api_keys: الاستثناءُ api_key_authentication يشترط القانونيّةَ بجواره وقد غابت',
    ]);

    const blind = await rolledBack(prisma, async (tx) => {
      const t = await probeName(tx);
      await tx.$executeRawUnsafe(`CREATE TABLE "${t}" ("id" text, "companyId" text)`);
      await tx.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
      await tx.$executeRawUnsafe(`CREATE POLICY "__probe_v" ON "${t}" AS RESTRICTIVE USING (${CANON_SRC})`);
      return { t, uncovered: uncovered([t], await readPolicies(tx), derived) };
    });
    expect(blind.uncovered).toEqual([`${blind.t}: لا سياسةَ قانونيّةً ولا استثناءً بديلاً`]);
  });

  it('⑦ القاعدةُ بعد التشغيل كما قبله — من اتصالٍ خارج المعاملات', async () => {
    const [{ policies, tables }] = await prisma.$queryRaw<{ policies: bigint; tables: bigint }[]>`
      SELECT (SELECT count(*) FROM pg_policies WHERE starts_with(policyname, '__probe') OR starts_with(policyname, '__expect'))::bigint AS policies,
             (SELECT count(*) FROM pg_class WHERE starts_with(relname, '__rls_'))::bigint AS tables`;
    expect({ policies: Number(policies), tables: Number(tables) }).toEqual({ policies: 0, tables: 0 });
  });
});
