import { Prisma, PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * **عزلُ `company_users` و`company_user_branches` معاً — يُثبَت بالعكس على القاعدة الحيّة**
 * (`ق-٦٥٣` · `ق-٦٧٥` · المرحلة ④).
 *
 * كان هذا الجدولُ عائقَ الإطلاق المؤكَّدَ ثلاثاً (`ق-٦٤٠`): بلا قائمةٍ ولا سياسة، **وأُثبت
 * العبورُ فعلياً** (سياقُ «أ» قرأ صفَّ «ب»، 2026-08-15). وأسوأُ كسورِ إغلاقه المقيسة
 * (`ق-٦٥٣`): `FORCE` على الفروع بلا سياقٍ في قراءة الحارس ⇒ فروعٌ فارغة بنجاح ⇒ **كلُّ
 * موظّفٍ «بلا تضييق»**. فنُقلت القراءاتُ (①) وحُسم الدخول (②) ثم أُغلق الجدولان معاً.
 *
 * كلُّ حالةٍ في معاملةٍ تُرجَع، **والآليةُ تُقرأ بعد ضبطها**:
 *
 *   ① حسابُ «أ» **لا يُرى** من سياق «ب» ولا بلا سياق — **ويُرى** من «أ» (العبورُ القديم مستحيل).
 *   ② فروعُ حساب «أ» **لا تُرى** من «ب» ولا بلا سياق — وتُرى من «أ» (كسرُ `ق-٦٥٣` مستحيل:
 *      قارئٌ بلا سياق لا يرى «فارغاً بنجاح» يُقرأ تضييقاً — بل يرى الجدولَ كلَّه مغلقاً).
 *   ③ «ب» لا تكتب حساباً في «أ» ولا فرعاً لحساب «أ» ⇒ تُرفض في القاعدة.
 *   ④ مسنَدُ الإدارة يرى حسابات كلّ المنشآت (عدُّ الراكبين على قالبٍ عامّ — `ق-٦٦٢`) **ولا يكتب**.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  company-users-rls.live.spec: تُخطّى — لا DATABASE_URL');
}
const d = HAS_DB ? describe : describe.skip;

const ROLLBACK = 'company-users-rls: rollback';
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

const countWhere = async (tx: Tx, sql: string) => Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(sql))[0].n);

d('عزلُ company_users وcompany_user_branches — الحسابُ لمنشأته، وفروعُه معه، والمسنَدُ يقرأ ولا يكتب', () => {
  const prisma = new PrismaClient();
  let companyA: string;
  let companyB: string;
  let templateId: string;

  beforeAll(async () => {
    const two = await prisma.company.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 2 });
    if (two.length < 2) throw new Error('الحارسُ يحتاج منشأتين على الأقل — تحقّق من البذرة');
    [companyA, companyB] = [two[0].id, two[1].id];
    const tpl = await prisma.permissionTemplate.findFirst({ where: { companyId: null, isSystem: false }, select: { id: true } });
    if (!tpl) throw new Error('لا قالبَ عامّاً — تحقّق من البذرة');
    templateId = tpl.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** حسابٌ فرعيّ في «أ» بفرعٍ من فروعها — يُبنى داخل المعاملة المُرجَعة. */
  async function memberOfAWithBranch(tx: Tx): Promise<{ memberId: string; branchId: string }> {
    await asCompany(tx, companyA);
    // فرعٌ يُنشأ داخل المعاملة المُرجَعة — لا اعتمادَ على فروعٍ قائمة في البذرة.
    const branch = await tx.branch.create({ data: { companyId: companyA, name: `فرعُ المسبار ${Date.now()}` }, select: { id: true } });
    const identity = await tx.loginIdentity.create({
      data: { username: `cu-rls-probe-${Date.now()}`, passwordHash: 'x', actorType: 'COMPANY_USER', companyId: companyA, companyUser: { create: { companyId: companyA, name: 'probe', permissionTemplateId: templateId } } },
      include: { companyUser: { select: { id: true } } },
    });
    const memberId = identity.companyUser!.id;
    await tx.companyUserBranch.create({ data: { companyUserId: memberId, branchId: branch.id } });
    return { memberId, branchId: branch.id };
  }

  it('🔴 ① حسابُ «أ» لا يُرى من «ب» ولا بلا سياق — ويُرى من «أ» (العبورُ القديم مستحيل)', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      const { memberId } = await memberOfAWithBranch(tx);
      const fromA = await countWhere(tx, `SELECT count(*)::bigint AS n FROM company_users WHERE id = '${memberId}'`);
      await asCompany(tx, companyB);
      const fromB = await countWhere(tx, `SELECT count(*)::bigint AS n FROM company_users WHERE id = '${memberId}'`);
      await asCompany(tx, null);
      const fromNone = await countWhere(tx, `SELECT count(*)::bigint AS n FROM company_users WHERE id = '${memberId}'`);
      return { fromA, fromB, fromNone };
    });
    expect(out).toEqual({ fromA: 1, fromB: 0, fromNone: 0 });
  });

  it('🔴 ② فروعُ حساب «أ» لا تُرى من «ب» ولا بلا سياق — وتُرى من «أ» (كسرُ ق-٦٥٣ مستحيل)', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      const { memberId } = await memberOfAWithBranch(tx);
      const fromA = await countWhere(tx, `SELECT count(*)::bigint AS n FROM company_user_branches WHERE "companyUserId" = '${memberId}'`);
      await asCompany(tx, companyB);
      const fromB = await countWhere(tx, `SELECT count(*)::bigint AS n FROM company_user_branches WHERE "companyUserId" = '${memberId}'`);
      await asCompany(tx, null);
      const fromNone = await countWhere(tx, `SELECT count(*)::bigint AS n FROM company_user_branches WHERE "companyUserId" = '${memberId}'`);
      return { fromA, fromB, fromNone };
    });
    expect(out).toEqual({ fromA: 1, fromB: 0, fromNone: 0 });
  });

  it('🔴 ③ «ب» لا تكتب حساباً في «أ» ولا فرعاً لحساب «أ» — تُرفض في القاعدة', async () => {
    // كلُّ رفضٍ في معاملته — فالرفضُ الأوّل يُجهض المعاملةَ ولا يُقرأ بعده شيء.
    const userForA = await rolledBack(prisma, async (tx) => {
      await asCompany(tx, companyB);
      const identity = await tx.loginIdentity.create({ data: { username: `cu-rls-b-${Date.now()}`, passwordHash: 'x', actorType: 'COMPANY_USER' } });
      return attempt(tx.$executeRaw`INSERT INTO company_users (id, "loginIdentityId", "companyId", name, "permissionTemplateId", "updatedAt") VALUES (gen_random_uuid()::text, ${identity.id}, ${companyA}, 'probe-b', ${templateId}, now())`);
    });
    expect(userForA).toContain('row-level security policy');

    const branchForA = await rolledBack(prisma, async (tx) => {
      const { memberId, branchId } = await memberOfAWithBranch(tx);
      await asCompany(tx, companyB);
      return attempt(tx.$executeRaw`INSERT INTO company_user_branches (id, "companyUserId", "branchId") VALUES (gen_random_uuid()::text, ${memberId}, ${branchId})`);
    });
    expect(branchForA).toContain('row-level security policy');
  });

  it('⭐ ④ مسنَدُ الإدارة يرى حسابات كلّ المنشآت (عدُّ الراكبين على قالبٍ عامّ) — ولا يكتب', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      const { memberId } = await memberOfAWithBranch(tx);
      await asCompany(tx, null);
      await asPlatformAdmin(tx, true);
      const seesA = await countWhere(tx, `SELECT count(*)::bigint AS n FROM company_users WHERE id = '${memberId}'`);
      const companiesSeen = await countWhere(tx, 'SELECT count(DISTINCT "companyId")::bigint AS n FROM company_users');
      const identity = await tx.loginIdentity.create({ data: { username: `cu-rls-admin-${Date.now()}`, passwordHash: 'x', actorType: 'COMPANY_USER' } });
      const writes = await attempt(tx.$executeRaw`INSERT INTO company_users (id, "loginIdentityId", "companyId", name, "permissionTemplateId", "updatedAt") VALUES (gen_random_uuid()::text, ${identity.id}, ${companyB}, 'probe-admin', ${templateId}, now())`);
      return { seesA, companiesSeen, writes };
    });
    expect(out.seesA).toBe(1);
    expect(out.companiesSeen).toBeGreaterThan(1);
    expect(out.writes).toContain('row-level security policy');
  });
});
