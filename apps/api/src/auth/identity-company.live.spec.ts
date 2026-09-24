import { Prisma, PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { regionForNewCompany } from '../common/region/regions';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * **حارسُ انحراف منشأة الهويّة** (`ق-٦٦٦` · `ق-٦٦٨`) — كحارس `Bank.balance`: عمودٌ
 * مكرَّرٌ يُقاس في كلّ تشغيلٍ ضدّ مصدره.
 *
 * ## ما يقيسه على القاعدة الحيّة
 *
 *   ① **لا انحراف**: كلُّ هويّةٍ لها ملفٌّ (`companies`/`company_users`) تحمل منشأةَ ملفّها.
 *   ② **لا ازدواج**: لا هويّةَ لها ملفٌّ في جدولَين — وهو الفراغُ الذي قيل إنه يُسقط (ب)
 *      وأُغلق بالمشغِّل.
 *   ③ **اليتيماتُ تُعدّ ولا تُدان** (`ق-٦٦٨`): هويّةٌ بلا ملفٍّ ليست مديراً — **رقمٌ معلَن
 *      في كلّ تشغيل**، لا حكم؛ فإن نما بعد إغلاق المصدر فذاك عطلٌ جديد يُرى.
 *
 * ## والمشغِّلاتُ تُثبَت بالعكس — في معاملاتٍ تُرجَع
 *
 *   ④ صفُّ حسابٍ فرعيّ لهويّةٍ منشأتُها غيرُ منشأته ⇒ **يُرفض** (`integrity_constraint_violation`).
 *   ⑤ تعديلُ `companyId` الهويّة بيدٍ إلى غير منشأة ملفّها ⇒ **يُرفض**.
 *   ⑥ إدراجُ حسابٍ فرعيّ لهويّةٍ جديدة ⇒ **تُملأ** منشأتُها من القاعدة لا من الشيفرة.
 *   ⑦ حذفُ صفِّ الحساب الفرعيّ ⇒ **تسقط هويّتُه** — لا يتيمةَ جديدة.
 *
 * ⚠️ كلُّ كتابةٍ هنا داخل معاملةٍ تُرجَع — القاعدةُ بعد التشغيل كما قبله.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  identity-company.live.spec: تُخطّى — لا DATABASE_URL');
}
const d = HAS_DB ? describe : describe.skip;

const ROLLBACK = 'identity-company: rollback';
type Tx = Prisma.TransactionClient;

/** معاملةٌ تُرجَع دائماً — تعيد ما أنتجته `fn`. */
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

/** يعيد رسالةَ خطأ الاستعلام أو `null` إن مرّ. */
const attempt = (p: Promise<unknown>) => p.then(() => null as string | null, (e: Error) => String(e.message));

const count = async (tx: Tx | PrismaClient, sql: string) => Number((await tx.$queryRawUnsafe<{ n: bigint }[]>(sql))[0].n);

/**
 * سياقُ المنشأة للمعاملة — **ويُقرأ بعد ضبطه** (`ق-٤٤٩`). لازمٌ منذ المرحلة ④ (`ق-٦٧٥`):
 * `company_users` تحت `FORCE`، فكتابةُ صفٍّ فيه تحتاج سياقَ منشأته **قبل** أن يصل
 * المشغِّلُ إليه — وإلا رُفض بالسياسة لا بالمشغِّل، فيُقاس غيرُ ما يُراد قياسُه.
 */
async function asCompany(tx: Tx, companyId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
  const [{ ctx }] = await tx.$queryRaw<{ ctx: string }[]>`SELECT current_setting('app.company_id', true) AS ctx`;
  if (ctx !== companyId) throw new Error(`السياقُ لم يُضبط: ${ctx}`);
}

d('منشأةُ هويّة الدخول — الانحرافُ صفر، واليتيماتُ تُعدّ، والمشغِّلاتُ تُثبَت بالعكس', () => {
  const prisma = new PrismaClient();
  let companyA: string;
  let companyB: string;

  beforeAll(async () => {
    const two = await prisma.company.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 2 });
    if (two.length < 2) throw new Error('الحارسُ يحتاج منشأتين على الأقل — تحقّق من البذرة');
    [companyA, companyB] = [two[0].id, two[1].id];
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * ⚠️ **الفحوصُ المنصّيّة تقرأ عبر المستأجرين — بمسنَد الإدارة** (المرحلة ④ · `ق-٦٧٥`).
   *
   * `company_users` تحت `FORCE`: قراءةٌ بلا سياق **تعود فارغةً بنجاح** — فكان الكاشفُ
   * سيرى كلَّ موظّفٍ يتيماً (**مقيس: `57` «يتيمةً بمنشأة» وهي ليست كذلك**) أو يرى
   * صفرَ انحرافٍ عمىً. فالفحصُ يضبط المسنَد **ويقرؤه بعد ضبطه** (`ق-٤٤٩`)، ويُثبت
   * الآليةَ: عدُّ `company_users` بالمسنَد موجبٌ وبلا مسنَدٍ صفر.
   */
  async function asPlatformAdmin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return rolledBack(prisma, async (tx) => {
      // ⚠️ الآليةُ تُثبَت على صفٍّ يُصنع هنا — لا على صفوفٍ قائمة (قاعدةُ السير قد تكون بلا حساباتٍ فرعية).
      const template = await tx.permissionTemplate.findFirstOrThrow({ where: { companyId: null, isSystem: false }, select: { id: true } });
      await asCompany(tx, companyA);
      const probe = await tx.loginIdentity.create({
        data: { username: `identity-company-admin-probe-${Date.now()}`, passwordHash: 'x', actorType: 'COMPANY_USER', companyId: companyA, companyUser: { create: { companyId: companyA, name: 'probe', permissionTemplateId: template.id } } },
        include: { companyUser: { select: { id: true } } },
      });
      await tx.$executeRaw`SELECT set_config('app.company_id', '', true)`;
      const blind = await count(tx, `SELECT count(*)::bigint AS n FROM company_users WHERE id = '${probe.companyUser!.id}'`);
      await tx.$executeRaw`SELECT set_config('app.platform_admin', 'true', true)`;
      const [{ flag }] = await tx.$queryRaw<{ flag: string }[]>`SELECT current_setting('app.platform_admin', true) AS flag`;
      if (flag !== 'true') throw new Error(`المسنَدُ لم يُضبط: ${flag}`);
      const seen = await count(tx, `SELECT count(*)::bigint AS n FROM company_users WHERE id = '${probe.companyUser!.id}'`);
      if (blind !== 0 || seen !== 1) throw new Error(`آليةُ المسنَد لم تُثبَت — بلا مسنَد ${blind} · به ${seen}`);
      // ويُزال المسبارُ قبل الفحص كي لا يُحسب فيه — والمعاملةُ تُرجَع كلُّها على أيّ حال.
      await tx.$executeRaw`DELETE FROM login_identities WHERE id = ${probe.id}`;
      return fn(tx);
    });
  }

  it('🔴 ① لا انحراف: كلُّ هويّةٍ لها ملفٌّ تحمل منشأةَ ملفّها', async () => {
    const drift = await asPlatformAdmin((tx) => tx.$queryRaw<{ id: string; actorType: string; identityCompany: string | null; profileCompany: string }[]>`
      SELECT li.id, li."actorType", li."companyId" AS "identityCompany", p.company AS "profileCompany"
        FROM login_identities li
        JOIN (
          SELECT "loginIdentityId", id AS company FROM companies
          UNION ALL
          SELECT "loginIdentityId", "companyId" FROM company_users
        ) p ON p."loginIdentityId" = li.id
       WHERE li."companyId" IS DISTINCT FROM p.company`);
    expect(drift).toEqual([]);
  });

  it('🔴 ② لا ازدواج: لا هويّةَ لها ملفٌّ في جدولَين', async () => {
    const dual = await asPlatformAdmin((tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT li.id FROM login_identities li
       WHERE (EXISTS (SELECT 1 FROM companies c WHERE c."loginIdentityId" = li.id))::int
           + (EXISTS (SELECT 1 FROM company_users cu WHERE cu."loginIdentityId" = li.id))::int
           + (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa."loginIdentityId" = li.id))::int > 1`);
    expect(dual).toEqual([]);
  });

  it('⚠️ ③ اليتيماتُ تُعدّ ولا تُدان — رقمٌ معلَن في كلّ تشغيل (ق-٦٦٨)', async () => {
    const { orphans, orphanWithCompany } = await asPlatformAdmin(async (tx) => ({
      orphans: await tx.$queryRaw<{ actorType: string; n: bigint }[]>`
        SELECT li."actorType", count(*)::bigint AS n FROM login_identities li
         WHERE li."actorType" <> 'PLATFORM_ADMIN'
           AND NOT EXISTS (SELECT 1 FROM companies c WHERE c."loginIdentityId" = li.id)
           AND NOT EXISTS (SELECT 1 FROM company_users cu WHERE cu."loginIdentityId" = li.id)
         GROUP BY li."actorType" ORDER BY 1`,
      // ⚠️ لا حكمَ على العدد — الحكمُ الوحيد أن اليتيمةَ لا تحمل منشأةً (فلا سياقَ يُبنى عليها).
      orphanWithCompany: await count(
        tx,
        `SELECT count(*)::bigint AS n FROM login_identities li WHERE li."companyId" IS NOT NULL AND li."actorType" <> 'PLATFORM_ADMIN' AND NOT EXISTS (SELECT 1 FROM companies c WHERE c."loginIdentityId" = li.id) AND NOT EXISTS (SELECT 1 FROM company_users cu WHERE cu."loginIdentityId" = li.id)`,
      ),
    }));
    const total = orphans.reduce((a, r) => a + Number(r.n), 0);
    // eslint-disable-next-line no-console
    console.log(`\n  ▶ هويّاتٌ يتيمة (بلا ملفّ): ${total} — ${orphans.map((r) => `${r.actorType}: ${Number(r.n)}`).join(' · ') || 'لا شيء'}\n    (تُعدّ ولا تُحذف — ق-٦٦٨: إن نما العددُ بعد إغلاق المصدر فذاك عطلٌ جديد)`);
    expect(orphanWithCompany).toBe(0);
  });

  it('🔴 ④ حسابٌ فرعيّ لهويّةٍ منشأتُها أخرى ⇒ تُرفض في القاعدة (المشغِّلُ شرطُ القبول)', async () => {
    const error = await rolledBack(prisma, async (tx) => {
      const template = await tx.permissionTemplate.findFirstOrThrow({ where: { companyId: null, isSystem: false }, select: { id: true } });
      const identity = await tx.loginIdentity.create({ data: { username: `identity-company-probe-${Date.now()}`, passwordHash: 'x', actorType: 'COMPANY_USER', companyId: companyA } });
      // الصفُّ في منشأة ب وهويّتُه في أ — والمشغِّلُ يرفض. (السياقُ «ب» كي تمرّ سياسةُ الجدول
      // ويصل الرفضُ من المشغِّل نفسِه — لا من السياسة.)
      await asCompany(tx, companyB);
      return attempt(tx.$executeRaw`INSERT INTO company_users (id, "loginIdentityId", "companyId", name, "permissionTemplateId", "updatedAt") VALUES (gen_random_uuid()::text, ${identity.id}, ${companyB}, 'probe', ${template.id}, now())`);
    });
    expect(error).not.toBeNull();
    expect(error).toContain('ق-٦٦٦');
    expect(error).toContain('منشأةٍ أخرى');
  });

  it('🔴 ⑤ تعديلُ منشأة الهويّة بيدٍ إلى غير منشأة ملفّها ⇒ يُرفض', async () => {
    const error = await rolledBack(prisma, async (tx) => {
      const owner = await tx.company.findUniqueOrThrow({ where: { id: companyA }, select: { loginIdentityId: true } });
      return attempt(tx.$executeRaw`UPDATE login_identities SET "companyId" = ${companyB} WHERE id = ${owner.loginIdentityId}`);
    });
    expect(error).not.toBeNull();
    expect(error).toContain('ق-٦٦٦');
    expect(error).toContain('تخالف ملفَّها');
  });

  it('⭐ ⑥ إدراجُ حسابٍ فرعيّ لهويّةٍ فارغة ⇒ تُملأ منشأتُها من القاعدة، ثم ⑦ حذفُ صفّه ⇒ تسقط الهويّة', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      const template = await tx.permissionTemplate.findFirstOrThrow({ where: { companyId: null, isSystem: false }, select: { id: true } });
      const identity = await tx.loginIdentity.create({ data: { username: `identity-company-fill-${Date.now()}`, passwordHash: 'x', actorType: 'COMPANY_USER' } });
      const beforeFill = (await tx.loginIdentity.findUniqueOrThrow({ where: { id: identity.id } })).companyId;
      await asCompany(tx, companyB);
      const member = await tx.companyUser.create({ data: { loginIdentityId: identity.id, companyId: companyB, name: 'probe', permissionTemplateId: template.id }, select: { id: true } });
      const afterFill = (await tx.loginIdentity.findUniqueOrThrow({ where: { id: identity.id } })).companyId;
      // ⑦ حذفُ صفّ الحساب الفرعيّ مباشرةً (لا عبر الهويّة) — كما تفعل تنظيفاتُ الاختبارات ومسارُ الحذف النهائيّ.
      await tx.companyUser.delete({ where: { id: member.id } });
      const identityAfterDelete = await tx.loginIdentity.findUnique({ where: { id: identity.id } });
      return { beforeFill, afterFill, identityAfterDelete };
    });
    expect(out.beforeFill).toBeNull();
    expect(out.afterFill).toBe(companyB);
    expect(out.identityAfterDelete).toBeNull();
  });

  it('⚠️ وكاشفا ① و② يريان ما يبحثان عنه — انحرافٌ مصنوعٌ بتعطيل المشغِّل، وازدواجٌ مصنوعٌ في منشأةٍ واحدة (يُرجَعان)', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      const owner = await tx.company.findUniqueOrThrow({ where: { id: companyA }, select: { loginIdentityId: true } });
      // ① انحرافٌ لا يقع إلا بتعطيل المشغِّل — وهو ما يثبت أن الكاشفَ يرى ما يمنعه المشغِّل.
      await tx.$executeRawUnsafe('ALTER TABLE login_identities DISABLE TRIGGER login_identities_company_matches_profile');
      await tx.$executeRaw`UPDATE login_identities SET "companyId" = ${companyB} WHERE id = ${owner.loginIdentityId}`;
      const drift = await count(tx, `SELECT count(*)::bigint AS n FROM login_identities li JOIN companies c ON c."loginIdentityId" = li.id WHERE li.id = '${owner.loginIdentityId}' AND li."companyId" IS DISTINCT FROM c.id`);
      await tx.$executeRaw`UPDATE login_identities SET "companyId" = ${companyA} WHERE id = ${owner.loginIdentityId}`;
      await tx.$executeRawUnsafe('ALTER TABLE login_identities ENABLE TRIGGER login_identities_company_matches_profile');
      // ② ازدواجٌ في المنشأة نفسِها يمرّ من المشغِّل (لا منشأةَ ثانية) — والكاشفُ يراه.
      const template = await tx.permissionTemplate.findFirstOrThrow({ where: { companyId: null, isSystem: false }, select: { id: true } });
      await asCompany(tx, companyA);
      await tx.companyUser.create({ data: { loginIdentityId: owner.loginIdentityId, companyId: companyA, name: 'dual-probe', permissionTemplateId: template.id } });
      const dual = await count(
        tx,
        `SELECT count(*)::bigint AS n FROM login_identities li WHERE li.id = '${owner.loginIdentityId}' AND (EXISTS (SELECT 1 FROM companies c WHERE c."loginIdentityId" = li.id))::int + (EXISTS (SELECT 1 FROM company_users cu WHERE cu."loginIdentityId" = li.id))::int > 1`,
      );
      return { drift, dual };
    });
    expect(out.drift).toBe(1);
    expect(out.dual).toBe(1);
  });

  it('⭐ وحذفُ المنشأة يُسقط هويّاتِها كلَّها — لا يتيمةَ من الحذف النهائيّ (ق-٦٦٨)', async () => {
    const out = await rolledBack(prisma, async (tx) => {
      const template = await tx.permissionTemplate.findFirstOrThrow({ where: { companyId: null, isSystem: false }, select: { id: true } });
      const stamp = Date.now();
      const owner = await tx.loginIdentity.create({
        data: { username: `identity-company-owner-${stamp}`, passwordHash: 'x', actorType: 'COMPANY', company: { create: { orgName: `probe-${stamp}`, permissionTemplateId: template.id, subStart: new Date(), subEnd: new Date(), ...regionForNewCompany(undefined) } } },
        include: { company: { select: { id: true } } },
      });
      const companyId = owner.company!.id;
      await asCompany(tx, companyId);
      const member = await tx.loginIdentity.create({
        data: { username: `identity-company-member-${stamp}`, passwordHash: 'x', actorType: 'COMPANY_USER', companyId, companyUser: { create: { companyId, name: 'probe', permissionTemplateId: template.id } } },
      });
      const ownerFilled = (await tx.loginIdentity.findUniqueOrThrow({ where: { id: owner.id } })).companyId;
      await tx.$executeRaw`DELETE FROM companies WHERE id = ${companyId}`;
      const left = await count(tx, `SELECT count(*)::bigint AS n FROM login_identities WHERE id IN ('${owner.id}', '${member.id}')`);
      return { ownerFilled, companyId, left };
    });
    expect(out.ownerFilled).toBe(out.companyId);
    expect(out.left).toBe(0);
  });
});
