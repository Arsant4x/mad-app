import { Prisma, PrismaClient } from '@mad-app/db';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { CONSENT_SOURCES, MARKETING_CHANNELS } from './marketing-consent.util';

jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * **سجلُّ الموافقة التسويقية: ملحقٌ فقط، ومقروءٌ من الكتالوج** (`ق-١٣٠٣` · ك/⑰A1).
 *
 * **اللائحةُ م٢٨/٣ توجب الاحتفاظ بإثبات الموافقة** — وصفٌّ يُدهَس أو يُحذف يمحو الإثباتَ
 * الذي توجبه المادةُ نفسُها. فالمنعُ في القاعدة لا في الخدمة: `deleteMany` والـ`DELETE`
 * الخام لا يمرّان بأيّ دالّة (مسارُ `task_logs` المُثبَت نفسُه).
 *
 * ويقرأ هذا الحارسُ **الكتالوجَ من `pg_constraint`** لا من نصّ الهجرة (`§8.21`): قناةٌ
 * تُضاف في الشيفرة ولا تُضاف في القاعدة تُردّ عند أوّل تاجرٍ يستعملها، لا هنا.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const ROLLBACK = 'ROLLBACK_PROBE';
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

/** سياقُ المنشأة — **ويُقرأ بعد ضبطه** (`ق-٤٤٩`): الجدولُ تحت `FORCE`، فكتابةٌ بلا سياقٍ تُردّ بالسياسة. */
async function asCompany(tx: Tx, companyId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
  const [{ ctx }] = await tx.$queryRaw<{ ctx: string }[]>`SELECT current_setting('app.company_id', true) AS ctx`;
  if (ctx !== companyId) throw new Error(`السياقُ لم يُضبط: ${ctx}`);
}

/** يعيد رسالةَ الخطأ أو `null` إن مرّ — فالرفضُ يُطابَق بنصّه لا بوقوعه (`§8.14`). */
const attempt = (p: Promise<unknown>) => p.then(() => null as string | null, (e: Error) => String(e.message));

const constraintValues = (def: string): string[] => [...def.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

d('سجلُّ الموافقة التسويقية — ملحقٌ فقط ومقروءٌ من الكتالوج (ق-١٣٠٣ · ك/⑰A1)', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    // ⚠️ **ولا يُقرأ عميلٌ هنا**: `customers` تحت `FORCE`، **فقراءةٌ بلا سياقٍ تعود فارغةً بنجاح**
    //    (`§8.5`) — وقعت فعلاً في أوّل صياغة، فقرأها الحارسُ «لا عميلَ في القاعدة». **والمنشأةُ
    //    وحدَها تُقرأ بلا سياق** (مقيس: `companies` بلا عزل صفوف)، **والعميلُ يُصنع في كلِّ مرحلةٍ
    //    داخل سياقه** — «المسابيرُ الحيّة تصنع صفوفَها» (`ق-٦٥٩`).
    const one = await prisma.company.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (!one) throw new Error('الحارسُ يحتاج منشأةً واحدةً على الأقل — تحقّق من البذرة');
    companyId = one.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** عميلٌ من صنع المسبار داخل سياقه — يعيش في المعاملة المُرجَعة وحدَها. */
  async function probeCustomer(tx: Tx): Promise<string> {
    await asCompany(tx, companyId);
    const row = await tx.customer.create({
      data: { companyId, name: `مسبارُ الموافقة ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'NATURAL' } as unknown as Prisma.CustomerUncheckedCreateInput,
    });
    return row.id;
  }

  it('⭐ ① الكتالوجان في الشيفرة والقاعدة سواء — مقروءَين من pg_constraint', async () => {
    const rows = await prisma.$queryRaw<{ conname: string; def: string }[]>`
      SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'marketing_consents' AND c.contype = 'c'`;
    const byName = new Map(rows.map((r) => [r.conname, r.def]));

    expect(constraintValues(byName.get('marketing_consents_channel_check') ?? '')).toEqual([...MARKETING_CHANNELS].sort());
    expect(constraintValues(byName.get('marketing_consents_source_check') ?? '')).toEqual([...CONSENT_SOURCES].sort());
  });

  it('② والجدولُ تحت ENABLE وFORCE بسياسته — لا طبقةً واحدة', async () => {
    const [flags] = await prisma.$queryRaw<{ enabled: boolean; forced: boolean }[]>`
      SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE relname = 'marketing_consents'`;
    expect(flags).toEqual({ enabled: true, forced: true });
    const pol = await prisma.$queryRaw<{ polname: string }[]>`SELECT polname FROM pg_policy WHERE polrelid = 'marketing_consents'::regclass`;
    expect(pol.map((p) => p.polname)).toContain('tenant_isolation_marketing_consents');
  });

  it('🔴 ③ ملحقٌ فقط: الحذفُ والتعديلُ يُرفضان من القاعدة — ولو بمسارٍ لا يمرّ بدالّة', async () => {
    // ⚠️ **كلُّ محاولةٍ في معاملتها**: خطأٌ في Postgres **يُجهض المعاملة** (`25P02`) فتُرفض بعده
    //    كلُّ عبارة — فثلاثُ محاولاتٍ في معاملةٍ واحدة تشهد للأولى وحدَها وتكذب في الباقي.
    const onSelf = async (fn: (tx: Tx, id: string) => Promise<string | null>) =>
      rolledBack(prisma, async (tx) => {
        const customerId = await probeCustomer(tx);
        const row = await tx.marketingConsent.create({
          data: { companyId, customerId, channel: 'SMS', granted: true, source: 'IN_PERSON', at: new Date(), actorType: 'COMPANY' } as unknown as Prisma.MarketingConsentUncheckedCreateInput,
        });
        return fn(tx, row.id);
      });

    // ⓪ مصادقةُ المسبار أوّلاً: الصفُّ يُكتب ويُقرأ فعلاً — فرفضٌ على صفٍّ لا وجودَ له لا يشهد بشيء.
    const readBack = await onSelf(async (tx, id) => String(await tx.marketingConsent.count({ where: { id } })));
    expect(readBack).toBe('1');

    expect(await onSelf((tx, id) => attempt(tx.$executeRawUnsafe(`DELETE FROM marketing_consents WHERE id = '${id}'`)))).toContain('لا يُحذف منه صفّ');
    expect(await onSelf((tx, id) => attempt(tx.marketingConsent.deleteMany({ where: { id } })))).toContain('لا يُحذف منه صفّ');
    expect(await onSelf((tx, id) => attempt(tx.$executeRawUnsafe(`UPDATE marketing_consents SET granted = false WHERE id = '${id}'`)))).toContain('لا يُعدَّل');
  });

  /**
   * 🔴 **والمنعُ على إعادة كتابة التاريخ لا على زوال صاحبه** (الهجرة `…_marketing_consent_erasure`).
   *
   * أوّلُ صياغةٍ رفضت **كلَّ** حذفٍ — **والتسلسلُ يمرّ بالمشغِّل**، فصار عميلٌ وافق مرّةً **لا
   * يُمحى أبداً ومنشأتُه معه**: نقضٌ لحقّ المحو (النظام م٤) ولمسار حذف الحساب. أمسكته حزمةُ
   * الـ`e2e` عند تنظيفها («منشأةُ الاختبار لم تُزَل»)، **لا مراجعةٌ ولا قراءة**.
   */
  it('🔴 ⑥ ومحوُ العميل يجرّ إثباتَه معه — فالإثباتُ يُحفظ ما دام صاحبُه قائماً', async () => {
    const left = await rolledBack(prisma, async (tx) => {
      const customerId = await probeCustomer(tx);
      await tx.marketingConsent.create({
        data: { companyId, customerId, channel: 'SMS', granted: true, source: 'IN_PERSON', at: new Date(), actorType: 'COMPANY' } as unknown as Prisma.MarketingConsentUncheckedCreateInput,
      });
      // حذفٌ خامّ للعميل — التسلسلُ الذي لا يمرّ بأيّ دالّة، وهو مسارُ المحو الحقيقيّ.
      await tx.$executeRawUnsafe(`DELETE FROM customers WHERE id = '${customerId}'`);
      return tx.marketingConsent.count({ where: { customerId } });
    });
    expect(left).toBe(0);
  });

  it('④ وزمنُ التسجيل من الخادم — يُدهَس ما يرسله العميل', async () => {
    const stamped = await rolledBack(prisma, async (tx) => {
      const customerId = await probeCustomer(tx);
      const row = await tx.marketingConsent.create({
        data: { companyId, customerId, channel: 'EMAIL', granted: true, source: 'PHONE', at: new Date(), actorType: 'COMPANY', createdAt: new Date('2001-01-01T00:00:00.000Z') } as unknown as Prisma.MarketingConsentUncheckedCreateInput,
      });
      return row.createdAt;
    });
    expect(stamped.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('🔴 ⑤ وقناةٌ خارج الكتالوج تُردّ من القاعدة — فالشيفرةُ ليست الحدَّ الأخير', async () => {
    const verdict = await rolledBack(prisma, async (tx) => {
      const customerId = await probeCustomer(tx);
      return attempt(
        tx.marketingConsent.create({
          data: { companyId, customerId, channel: 'PIGEON', granted: true, source: 'IN_PERSON', at: new Date(), actorType: 'COMPANY' } as unknown as Prisma.MarketingConsentUncheckedCreateInput,
        }),
      );
    });
    expect(verdict).toContain('marketing_consents_channel_check');
  });

  it('🔴 والمجسُّ مُثبَتٌ بحالتَين: قناةٌ من الكتالوج تمرّ في المسار نفسِه', async () => {
    const created = await rolledBack(prisma, async (tx) => {
      const customerId = await probeCustomer(tx);
      const row = await tx.marketingConsent.create({
        data: { companyId, customerId, channel: 'WHATSAPP', granted: true, source: 'WRITTEN', at: new Date(), actorType: 'COMPANY' } as unknown as Prisma.MarketingConsentUncheckedCreateInput,
      });
      return row.channel;
    });
    expect(created).toBe('WHATSAPP');
  });
});
