import { Prisma, PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * **سياسةُ `permission_templates` الفريدة — تُثبَت بالعكس على القاعدة الحيّة** (`ق-٦٧٥` · المرحلة ③).
 *
 * الجدولُ ثنائيُّ النطاق: عامٌّ بلا منشأة يراه الجميع (والتسجيلُ قبل أيّ سياق)، وخاصٌّ
 * لصاحبه. **والكتابةُ على العامّ لمسنَد الإدارة وحدَه.** كلُّ حالةٍ هنا في معاملةٍ تُرجَع —
 * القاعدةُ بعد التشغيل كما قبله — **والآليةُ تُثبَت** (`current_setting` يُقرأ بعد ضبطه).
 *
 *   ① قالبُ «أ» الخاصّ **لا يُرى** من سياق «ب» ولا بلا سياق — **ويُرى** من سياق «أ».
 *   ② القالبُ العامُّ **يُرى** بلا سياق ومن كلّ سياق.
 *   ③ منشأةٌ تكتب قالباً **لغيرها** ⇒ تُرفض · وتكتب قالباً **عامّاً** ⇒ تُرفض.
 *   ④ مسنَدُ الإدارة يكتب العامَّ ⇒ يُقبل · ويرى الخاصَّ (إشرافاً).
 *   ⑤ وبلا سياقٍ وبلا مسنَد: لا كتابةَ أصلاً.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  permission-templates-rls.live.spec: تُخطّى — لا DATABASE_URL');
}
const d = HAS_DB ? describe : describe.skip;

const ROLLBACK = 'permission-templates-rls: rollback';
type Tx = Prisma.TransactionClient;

async function rolledBack<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  let ran = false;
  await prisma
    .$transaction(async (tx) => {
      out = await fn(tx);
      ran = true;
      throw new Error(ROLLBACK);
    })
    .catch((e: unknown) => {
      if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
    });
  if (!ran) throw new Error('المعاملةُ لم تكتمل');
  return out as T;
}

const attempt = (p: Promise<unknown>) => p.then(() => null as string | null, (e: Error) => String(e.message));

/** يضبط السياقَ ويقرؤه بعد ضبطه — الآليةُ لا الأثر (`ق-٤٤٩`). */
async function asCompany(tx: Tx, companyId: string | null): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId ?? ''}, true)`;
  const [{ ctx }] = await tx.$queryRaw<{ ctx: string }[]>`SELECT current_setting('app.company_id', true) AS ctx`;
  if (ctx !== (companyId ?? '')) throw new Error(`السياقُ لم يُضبط: ${ctx}`);
}
async function asPlatformAdmin(tx: Tx, on: boolean): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.platform_admin', ${on ? 'true' : ''}, true)`;
  const [{ flag }] = await tx.$queryRaw<{ flag: string }[]>`SELECT current_setting('app.platform_admin', true) AS flag`;
  if (flag !== (on ? 'true' : '')) throw new Error(`المسنَدُ لم يُضبط: ${flag}`);
}

const seesTemplate = async (tx: Tx, id: string) => (await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM permission_templates WHERE id = ${id}`)[0].n === 1n;

d('سياسةُ permission_templates — العامُّ للجميع، والخاصُّ لصاحبه، والكتابةُ على العامّ لمسنَد الإدارة', () => {
  const prisma = new PrismaClient();
  let companyA: string;
  let companyB: string;
  let globalTemplateId: string;

  beforeAll(async () => {
    const two = await prisma.company.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 2 });
    if (two.length < 2) throw new Error('الحارسُ يحتاج منشأتين على الأقل — تحقّق من البذرة');
    [companyA, companyB] = [two[0].id, two[1].id];
    // بلا سياق: القالبُ العامُّ يجب أن يُرى — وإلا فالتسجيلُ نفسُه معطَّل.
    const global = await prisma.permissionTemplate.findFirst({ where: { companyId: null, isSystem: false }, select: { id: true } });
    if (!global) throw new Error('لا قالبَ عامّاً يُرى بلا سياق — التسجيلُ الذاتيُّ معطَّل');
    globalTemplateId = global.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('🔴 ① قالبُ «أ» الخاصّ لا يُرى من «ب» ولا بلا سياق — ويُرى من «أ»', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      await asCompany(tx, companyA);
      const created = await tx.permissionTemplate.create({ data: { name: `rls-probe-${Date.now()}`, companyId: companyA, isAllScreens: false, allowedScreens: ['customers'] }, select: { id: true } });
      const fromA = await seesTemplate(tx, created.id);
      await asCompany(tx, companyB);
      const fromB = await seesTemplate(tx, created.id);
      await asCompany(tx, null);
      const fromNone = await seesTemplate(tx, created.id);
      return { fromA, fromB, fromNone };
    });
    expect(out).toEqual({ fromA: true, fromB: false, fromNone: false });
  });

  it('② القالبُ العامُّ يُرى بلا سياق ومن كلّ سياق', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      await asCompany(tx, null);
      const none = await seesTemplate(tx, globalTemplateId);
      await asCompany(tx, companyA);
      const a = await seesTemplate(tx, globalTemplateId);
      await asCompany(tx, companyB);
      const b = await seesTemplate(tx, globalTemplateId);
      return { none, a, b };
    });
    expect(out).toEqual({ none: true, a: true, b: true });
  });

  it('🔴 ③ منشأةٌ لا تكتب قالباً لغيرها ولا قالباً عامّاً — تُرفض في القاعدة', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      await asCompany(tx, companyA);
      const forOther = await attempt(tx.$executeRaw`INSERT INTO permission_templates (id, name, "companyId", "isAllScreens", "allowedScreens", "isSystem", "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, 'probe-other', ${companyB}, false, ARRAY['customers'], false, now(), now())`);
      return { forOther };
    });
    expect(out.forOther).toContain('row-level security policy');

    const global = await rolledBack(prisma, async (tx) => {
      await asCompany(tx, companyA);
      return attempt(tx.$executeRaw`INSERT INTO permission_templates (id, name, "companyId", "isAllScreens", "allowedScreens", "isSystem", "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, 'probe-global', NULL, false, ARRAY['customers'], false, now(), now())`);
    });
    expect(global).toContain('row-level security policy');
  });

  it('⭐ ④ مسنَدُ الإدارة يكتب العامَّ ويرى الخاصَّ — و⑤ بلا سياقٍ وبلا مسنَد لا كتابةَ أصلاً', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      // ⑤ أولاً — قبل أيّ مسنَد.
      await asCompany(tx, null);
      await asPlatformAdmin(tx, false);
      const bare = await attempt(tx.$executeRaw`INSERT INTO permission_templates (id, name, "companyId", "isAllScreens", "allowedScreens", "isSystem", "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, 'probe-bare', NULL, false, ARRAY['customers'], false, now(), now())`);
      return { bare };
    });
    expect(out.bare).toContain('row-level security policy');

    const admin = await rolledBack(prisma, async (tx) => {
      await asCompany(tx, companyA);
      const privateTpl = await tx.permissionTemplate.create({ data: { name: `rls-private-${Date.now()}`, companyId: companyA, isAllScreens: false, allowedScreens: ['customers'] }, select: { id: true } });
      await asCompany(tx, null);
      await asPlatformAdmin(tx, true);
      const wroteGlobal = await attempt(tx.$executeRaw`INSERT INTO permission_templates (id, name, "companyId", "isAllScreens", "allowedScreens", "isSystem", "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, 'probe-admin-global', NULL, false, ARRAY['customers'], false, now(), now())`);
      const seesPrivate = await seesTemplate(tx, privateTpl.id);
      return { wroteGlobal, seesPrivate };
    });
    expect(admin).toEqual({ wroteGlobal: null, seesPrivate: true });
  });
});
