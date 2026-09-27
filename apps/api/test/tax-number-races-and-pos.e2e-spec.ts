import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PosService } from '../src/pos/pos.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة: ثلاثُ منشآتٍ معزولة، وسباقان يُفرض تداخلُهما خلف قفل، ونحوُ عشرين طلباً — ثلاثةُ أضعاف ما يلزم عادةً.
jest.setTimeout(300000);

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
/** مهلةُ معاملة القافل — أطولُ من كلّ انتظارٍ بعدها، فلا تنقضي وهو يمسك القفل. */
const HOLD_TX_MS = 60_000;
/** أقصى انتظارٍ لأن يقف المتسابقان خلف القفل — ثم يُطلق على أيّ حال، ويحكم التوكيدُ على ما رُئي فعلاً. */
const BLOCK_DEADLINE_MS = 20_000;
const POLL_MS = 25;

/**
 * `ق-١٤٩٠` — **المساراتُ الضريبية التي كانت تحرق رقمَ فاتورتها بعد الترقيم** (القياس `measure-burnt-numbers.md` §٣-أ).
 *
 * رقمُ الفاتورة يُحجز على منفذ العدّاد المستقلّ ويلتزم فوراً (`sequence-allocator.ts`: «الرقمُ لا يرتدّ»)، فكلُّ رفضٍ يقع
 * بعد سطر الترقيم يترك فجوةً في سلسلةٍ تُبلَّغ للهيئة. وهذه الحزمةُ تحرس ثلاثةً منها:
 *   ① **INV-⑤** سباقُ تحويل العرض — الخاسرُ كان يُرقَّم ثم يسقط على الختم المشروط.
 *   ② **INV-⑥** بيعُ الكاشير النقديّ على مناوبةٍ بلا درج و`1000` غائب — كان يُرفض عند ترحيل سند التحصيل بعد الترقيم.
 *   ③ **INV-⑦** إتمامان متزامنان لمحاولة دفعٍ مقبولة — الخاسرُ كان يُرقّم ثم يسقط على تفرّد معرّف البيع.
 *
 * ⚠️ **والتوكيدُ على الرقم التالي لا على رمز الرفض وحدَه**: الفحصُ المتأخّر باقٍ طبقةً ثانية، فالكسرُ لا يُسقط الرفضَ ولا
 * يغيّر عددَ الفواتير — **يُظهر الفجوة وحدَها**. وكلُّ منشأةٍ هنا وليدة، فأوّلُ فاتورةٍ فيها `0001` والتي بعدها `0002`.
 *
 * ⚠️ **والتداخلُ في السباقين مفروضٌ لا مرجوّ** (`§8.8` الوجه الثالث): قافلٌ يمسك الصفَّ `FOR UPDATE`، ولا يُطلقه حتى يقف
 * المتسابقان خلفه — مقيساً من `pg_stat_activity` لا مقدَّراً بنوم. **وأين يقفان هو الفارق**: بعد الإصلاح يقفان على قفل
 * الخدمة **قبل** الترقيم؛ وعلى الكسر يمرّان من القراءة غير المقفلة ويُرقّمان ثم يقفان على الختم (أو على مفتاح المحاولة
 * الأجنبيّ) **بعد** الترقيم.
 */
describe('المساراتُ الضريبية لا تحرق رقمَ فاتورتها — سباقُ العرض ونقدُ الكاشير وسباقُ إتمام المحاولة (ق-١٤٩٠)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let prisma: PrismaService;
  /** عميلُ العدّ خلف القفل — مجمّعُه غيرُ مجمّع التطبيق الذي يمسكه القافلُ والواقفون (`waitersBehind`). */
  let probe: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const plusDays = (d: number) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const bearer = (co: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const accountId = async (co: IsolatedCompany, code: string) =>
    (await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.account.findFirst({ where: { code }, select: { id: true } })))?.id ?? null;

  /**
   * قافلٌ في سياق المنشأة: يقفل الصفَّ ويمسكه حتى يُطلق، ويُعيد معرّفَ عمليته ليُعدّ مَن يقف خلفه، وعددَ ما قفل —
   * **فصفرٌ يعني أن العزل أعماه** (قراءةٌ بلا سياق تعود فارغةً بنجاح) لا أن القفل وقع.
   */
  function holdRowLock(companyId: string, lock: (tx: Prisma.TransactionClient) => Promise<{ id: string }[]>) {
    let release: () => void = () => undefined;
    const released = new Promise<void>((done) => {
      release = () => done();
    });
    let taken: (v: { pid: number; locked: number }) => void = () => undefined;
    let failed: (e: unknown) => void = () => undefined;
    const ready = new Promise<{ pid: number; locked: number }>((ok, ko) => {
      taken = ok;
      failed = ko;
    });
    const finished = tenantPrisma.runInTenantContext(
      companyId,
      async (tx) => {
        const rows = await lock(tx);
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        taken({ pid, locked: rows.length });
        await released;
      },
      { timeout: HOLD_TX_MS, maxWait: HOLD_TX_MS },
    );
    void finished.catch(failed);
    return { ready, release: () => release(), finished };
  }

  /**
   * كم عمليةً تقف خلف القافل — مباشرةً أو خلف واقفٍ خلفه (الثاني في الطابور يقف خلف الأوّل).
   *
   * ⚠️ **بعميلٍ مستقلٍّ لا بمجمّع التطبيق** (`probe`): القافلُ يمسك اتصالاً والطلبان الواقفان خلفه اثنين — ومجمّعُ التطبيق في
   * السير ثلاثةٌ («`connection limit: 3`») — فكان العدُّ ينتظر اتصالاً لا يتحرّر حتى يُطلق القفل، فيسقط بمهلة المجمّع على
   * الشيفرة السليمة نفسِها (قِيس في السير على الرأس النظيف) **فلا يُثبت شيئاً عن القفل**.
   */
  async function waitersBehind(holderPid: number): Promise<number> {
    const [{ n }] = await probe.$queryRaw<{ n: number }[]>`
      WITH RECURSIVE waiting(pid) AS (
        SELECT a.pid FROM pg_stat_activity a WHERE ${holderPid}::int = ANY(pg_blocking_pids(a.pid))
        UNION
        SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid))
      )
      SELECT count(*)::int AS n FROM waiting`;
    return n;
  }

  /**
   * يُطلق طلبين متزامنين والصفُّ مقفول، وينتظر أن يقف الاثنان خلف القفل، ثم يُطلقه — ويُعيد ما رُئي.
   * (`.then` يرسل الطلبَ فوراً: `supertest` لا يرسل حتى يُنتظَر.)
   */
  async function raceBehindLock(companyId: string, lock: (tx: Prisma.TransactionClient) => Promise<{ id: string }[]>, fire: () => request.Test) {
    const holder = holdRowLock(companyId, lock);
    const { pid, locked } = await holder.ready;
    const inflight = [fire().then((r) => r), fire().then((r) => r)];
    let blocked = 0;
    try {
      const deadline = Date.now() + BLOCK_DEADLINE_MS;
      blocked = await waitersBehind(pid);
      while (blocked < 2 && Date.now() < deadline) {
        await sleep(POLL_MS);
        blocked = await waitersBehind(pid);
      }
    } finally {
      // يُطلق القفلُ في كلّ حال — فعطلٌ في العدّ لا يحبس القافلَ حتى مهلته.
      holder.release();
    }
    const responses = await Promise.all(inflight);
    await holder.finished;
    return { locked, blocked, responses };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    prisma = app.get(PrismaService);
    probe = new PrismaClient();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await probe?.$disconnect();
    await app.close();
  });

  it('① INV-⑤ تحويلان متزامنان لعرضٍ واحد ⟸ فاتورةٌ واحدة، والخاسرُ يُردّ قبل الترقيم — فالفاتورةُ التالية بلا فجوة', async () => {
    const co = await registerIsolatedCompany(app, 'quote-race');
    const as = bearer(co);
    try {
      const customerId = (await as(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل السباق ${suffix}` }).expect(201)).body.id as string;
      const quoteId = (
        await as(http().post('/quotes'))
          .send({ customerId, issueDate: today(), validUntil: plusDays(14), lines: [{ description: `بند العرض ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
          .expect(201)
      ).body.id as string;

      const race = await raceBehindLock(
        co.companyId,
        (tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "quotes" WHERE "id" = ${quoteId} FOR UPDATE`,
        () => as(http().post(`/quotes/${quoteId}/convert`)).send({}),
      );
      // المسبارُ رأى: القافلُ أمسك صفَّ العرض في سياقه (لا صفرَ صامتاً تحت العزل)، ووقف المتسابقان كلاهما خلفه.
      expect(race.locked).toBe(1);
      expect(race.blocked).toBe(2);

      const [won, lost] = [...race.responses].sort((x, y) => x.status - y.status);
      expect([won.status, lost.status]).toEqual([201, 409]);
      const winnerNo = String(won.body.invoice.no);
      // نصُّ `quote_already_converted` بمعاملِه — فاتورةُ الفائز باسمها.
      expect(lost.body.message).toBe(`حُوِّل سابقاً إلى الفاتورة ${winnerNo}`);
      // بندٌ واحد: 1 × 100 = 100 صافياً، وضريبتُه 15% = 15 ⟸ الإجماليّ 115 — فاتورةُ العرض لا غيرُها.
      expect(Number(won.body.invoice.total)).toBe(115);
      expect(await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.invoice.count())).toBe(1);

      // ⭐ الحكم: منشأةٌ وليدة ⟸ فاتورةُ الفائز الأولى (`0001`)، والتي بعدها الثانيةُ (`0002`) في السلسلة نفسِها.
      //    وعلى الكسر رُقّم الخاسرُ أيضاً: إمّا أخذ `0001` فصار الفائزُ `0002`، أو العكسُ فصارت التاليةُ `0003`.
      expect(winnerNo).toMatch(/-0001$/);
      const issueDate = String(won.body.invoice.issueDate).slice(0, 10);
      const next = await as(http().post('/invoices'))
        .send({ customerId, issueDate, dueDate: issueDate, lines: [{ description: `بعد السباق ${suffix}`, quantity: 1, unitPrice: 50, taxRate: 15 }] })
        .expect(201);
      expect(String(next.body.no)).toBe(`${winnerNo.slice(0, -4)}0002`);
    } finally {
      await removeIsolatedCompany(app, co);
    }
  });

  it('② INV-⑥ بيعٌ نقديٌّ على مناوبةٍ بلا درج و`1000` غائب ⟸ `409` قبل الترقيم ولا فاتورة — والرقمُ التالي متّصل', async () => {
    const co = await registerIsolatedCompany(app, 'pos-cash-1000');
    const as = bearer(co);
    const receiptsOf = (invoiceId: string) =>
      tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.payment.findMany({ where: { allocations: { some: { invoiceId } } }, select: { no: true } }));
    try {
      const productId = (
        await as(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف النقد ${suffix}`, price: 50 }).expect(201)
      ).body.id as string;
      const line = [{ productId, quantity: 1 }];
      const shift = (await as(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body as { drawerId: string | null };
      // شرطُ الحالة يُقاس لا يُفترض: منشأةٌ وليدةٌ بلا أدراج ⟸ مناوبةٌ بلا درج، فنقدُها يُرحَّل إلى `1000`.
      expect(shift.drawerId).toBeNull();
      const cash = await accountId(co, '1000');
      expect(cash).not.toBeNull();
      await as(http().delete(`/accounts/${cash}`)).expect(204);
      expect(await accountId(co, '1000')).toBeNull();

      const refused = await as(http().post('/pos/sales')).send({ lines: line, paymentMethod: 'CASH' }).expect(409);
      // `posting_accounts_missing` بالرمز واسمِه من الدليل الافتراضيّ (`MissingPostingAccountsError`: «1000 النقدية»).
      expect(String(refused.body.message)).toContain('1000 النقدية');
      expect(String(refused.body.message)).toContain('شاشة الحسابات');
      expect(await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.invoice.count())).toBe(0);
      expect(await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.payment.count())).toBe(0);

      // الضابط: بيعُ البطاقة على المناوبة نفسِها لا يطلب `1000` (تحصيلُه إلى `1251`) — فيمرّ، فالرفضُ لغياب حساب النقد
      // وحدَه؛ ويأخذ الرقمَ الأوّل، فالرفضُ قبله لم يحرق شيئاً. (وعلى الكسر أُحرق `0001` فيأخذ `0002`.)
      const card = await as(http().post('/pos/sales')).send({ lines: line, paymentMethod: 'CARD', cardDeviceReference: `RRN-${suffix}` }).expect(201);
      const cardNo = String(card.body.no);
      expect(cardNo).toMatch(/-0001$/);
      const cardReceipts = await receiptsOf(card.body.id as string);
      expect(cardReceipts).toHaveLength(1);
      const cardReceiptNo = cardReceipts[0].no;
      expect(cardReceiptNo).toMatch(/-0001$/);

      // ومحاولةُ الدفع المقسّمة بجزءٍ نقديّ تُرفض عند إنشائها — قبل أن يُشحن مالُ بطاقتها.
      // 50 صافياً + 15% = 7.50 ضريبة ⟸ 57.50 = نقدٌ 7.50 + بطاقةٌ 50.
      await as(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: `cash-1000-${suffix}` } }).expect(201);
      const attempt = await as(http().post('/pos/payment-attempts'))
        .send({ clientSaleId: randomUUID(), lines: line, paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: 7.5 }, { method: 'CARD', amount: 50 }] })
        .expect(409);
      expect(String(attempt.body.message)).toContain('1000 النقدية');
      expect(await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.posPaymentAttempt.count())).toBe(0);

      // يُعاد الحسابُ من شاشته ⟸ البيعُ النقديّ التالي بالرقم الثاني، وسندُه كذلك.
      await as(http().post('/accounts')).send({ code: '1000', name: 'النقدية', type: 'asset' }).expect(201);
      const ok = await as(http().post('/pos/sales')).send({ lines: line, paymentMethod: 'CASH' }).expect(201);
      expect(String(ok.body.no)).toBe(`${cardNo.slice(0, -4)}0002`);
      const cashReceipts = await receiptsOf(ok.body.id as string);
      expect(cashReceipts).toHaveLength(1);
      expect(cashReceipts[0].no).toBe(`${cardReceiptNo.slice(0, -4)}0002`);
    } finally {
      await removeIsolatedCompany(app, co);
    }
  });

  it('③ INV-⑦ إتمامان متزامنان لمحاولةٍ مقبولة ⟸ فاتورةٌ واحدة، والخاسرُ يعود قبل الترقيم — فالبيعُ التالي بلا فجوة', async () => {
    const co = await registerIsolatedCompany(app, 'attempt-settle-race');
    const as = bearer(co);
    try {
      const productId = (
        await as(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف المحاولة ${suffix}`, price: 100 }).expect(201)
      ).body.id as string;
      const ringAt = new Date().toISOString();
      const sale = { lines: [{ productId, quantity: 1 }], ringAt, ringOffsetMin: 180 };
      await as(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
      await as(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: `settle-race-${suffix}` } }).expect(201);
      // حسابُ الشبكة قائمٌ قبل السباق — فالمتسابقان لا يتنازعان إنشاءه (`getOrCreateAccountByCode`)، ويبقى الفرقُ بين الإصلاح
      // والكسر في الترقيم وحدَه.
      await as(http().post('/accounts')).send({ code: '1251', name: 'مدينو شبكة المدفوعات', type: 'asset' }).expect(201);

      const attempt = (await as(http().post('/pos/payment-attempts')).send({ ...sale, paymentMethod: 'CARD', clientSaleId: randomUUID() }).expect(201)).body as {
        id: string;
        clientSaleId: string;
      };

      // المحاولةُ تُقبل ويتعثّر إتمامُها مرّةً — فتبقى «مقبولةً لم تكتمل» كما يتركها عطلٌ عابر (وهي ما يكنسه الكانس).
      // والعطلُ قبل الإتمام الحقيقيّ: لا فاتورةَ ولا رقم.
      const pos = app.get(PosService);
      const fault = jest.spyOn(pos, 'completeSaleWithinTx').mockRejectedValueOnce(new ConflictException('عطلٌ عابرٌ مصنوعٌ في الاختبار'));
      await as(http().post(`/pos/payment-attempts/${attempt.id}/charge`)).expect(409);
      expect(fault).toHaveBeenCalledTimes(1);
      fault.mockRestore();
      expect((await as(http().get(`/pos/payment-attempts/${attempt.id}`)).expect(200)).body.status).toBe('APPROVED');
      expect(await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.invoice.count())).toBe(0);

      const race = await raceBehindLock(
        co.companyId,
        (tx) => tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "pos_payment_attempts" WHERE "id" = ${attempt.id} FOR UPDATE`,
        () => as(http().post(`/pos/payment-attempts/${attempt.id}/resolve`)),
      );
      expect(race.locked).toBe(1);
      expect(race.blocked).toBe(2);
      // كلاهما يقرأ المحاولةَ مكتملةً في النهاية — والفرقُ بين الإصلاح والكسر لا يظهر هنا بل في الرقم.
      expect(race.responses.map((r) => r.status)).toEqual([201, 201]);
      expect(race.responses.map((r) => r.body.status)).toEqual(['COMPLETED', 'COMPLETED']);

      const invoices = await tenantPrisma.runInTenantContext(co.companyId, (tx) =>
        tx.invoice.findMany({ where: { clientSaleId: attempt.clientSaleId }, select: { no: true, total: true } }),
      );
      expect(invoices).toHaveLength(1);
      // 1 × 100 = 100 صافياً + 15% = 15 ⟸ 115 — ما شُحن.
      expect(Number(invoices[0].total)).toBe(115);
      expect(await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.invoice.count())).toBe(1);

      // ⭐ الحكم: الفاتورةُ الأولى في المنشأة (`0001`)، والبيعُ التالي — بيومِ الجهاز نفسِه — الثانيةُ (`0002`).
      expect(invoices[0].no).toMatch(/-0001$/);
      const next = await as(http().post('/pos/sales')).send({ ...sale, paymentMethod: 'CASH' }).expect(201);
      expect(String(next.body.no)).toBe(`${invoices[0].no.slice(0, -4)}0002`);
    } finally {
      jest.restoreAllMocks();
      await removeIsolatedCompany(app, co);
    }
  });
});
