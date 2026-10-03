import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma, PrismaClient } from '@mad-app/db';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ وسندان وستُّ مستنداتٍ وقفلان مقصودان؛ لم تُقَس بعد، فالسقفُ مئةٌ وعشرون ثانية معلنةً هنا.
jest.setTimeout(120000);

/**
 * ⚖️ **إعادةُ توزيع السند تحت طلبين متزامنين** (توجيه ٢٧٦ · ٢و · `ق-١٦٠٩`/و، القاعدة الدائمة ٣٧: «قِس ثم أصلح»).
 *
 * مسحُ الدفعات (`docs/domain-scan/34`، م١) وجد أن إعادةَ التوزيع (`POST /payments/:id/allocate`) **لا تقفل صفَّ السند**: تقرأ تخصيصاتِه،
 * وتحذفها، وتكتب الجديدة. وطلبان معاً على السند نفسِه وإلى مستندين مختلفين: يحذف الأوّلُ ويكتب، ويحذف الثاني ما رآه وحدَه (لا ما كتبه
 * الأوّلُ بعد بدء حذفه) ويكتب فوقه — **فيبقى التوزيعان معاً ويزيد مجموعُ تخصيصات السند على مبلغه**. وسندُ الصرف للمورّد مرآتُه
 * (`supplier-payments.service.ts` `allocate`) بالنمط نفسِه، فيُقاس معه.
 *
 * **والتداخلُ مفروضٌ لا منتظَر** (`§8.8` الوجهُ الثالث): معاملةٌ جانبيّة تقفل صفَّ التخصيص القائم (`FOR UPDATE`) حتى يقف الطلبان كلاهما
 * على قفلٍ (يُقرأ من `pg_stat_activity` لا بزمنٍ يُخمَّن)، ثم تُفلته. والجوابُ محسوبٌ يداً: السندُ `1000`، وكلُّ طلبٍ يوزّعه كاملاً على
 * مستندٍ آخر بألف، **فمجموعُ تخصيصاته بعدهما `1000` لا `2000`، ومستندٌ واحدٌ من الاثنين**.
 */
describe('إعادةُ توزيع السند تحت طلبين متزامنين لا تزيد تخصيصاتِه على مبلغه (ق-١٦٠٩/و)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  let customerId: string;
  let supplierId: string;
  let branchId: string;
  let cashBoxId: string;

  const makeInvoice = async (total: number): Promise<string> =>
    (
      await auth(http().post('/invoices'))
        .send({
          customerId,
          branchId,
          issueDate: today(),
          dueDate: today(),
          lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
        })
        .expect(201)
    ).body.id as string;

  const makePurchase = async (total: number): Promise<string> =>
    (await auth(http().post('/purchases')).send({ supplierId, branchId, date: today(), category: `بند ${suffix}`, subtotal: total, exempt: true }).expect(201)).body.id as string;

  /** عددُ الجلسات المنتظرة على قفل صفٍّ في هذه القاعدة الآن. */
  const waitingOnLocks = async (): Promise<number> => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    return Number(rows[0].n);
  };

  /**
   * يفرض التداخل: يقفل صفَّ التخصيص القائم للسند في معاملةٍ جانبيّة، ويطلق الطلبين، وينتظر حتى يقفا على قفل، ثم يُفلت.
   * والإفلاتُ في `finally` فلا يعلق شيءٌ إن سقط التوكيد. ويعيد ما رآه المسبارُ وردَّي الطلبين.
   */
  const race = async (table: 'payment_allocations' | 'supplier_payment_allocations', paymentId: string, sendBoth: () => Promise<request.Response[]>) => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    let heldRows = 0;
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
        heldRows = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE "paymentId" = ${paymentId} FOR UPDATE`).length;
        locked();
        await released;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await lockTaken;
    const baseline = await waitingOnLocks();
    const both = sendBoth();
    let waiting = 0;
    try {
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 2; i++) await new Promise((r) => setTimeout(r, 100));
    } finally {
      release();
    }
    await holder;
    return { heldRows, baseline, waiting, replies: await both };
  };

  /**
   * التداخلُ نفسُه **بترتيبٍ مفروض** (توجيه ٢٧٧ · ٢د): يُطلق الأوّلُ وينتظر حتى يقف على قفل، ثم يُطلق الثاني وينتظر حتى يقف، ثم يُفلت.
   * فالأوّلُ يمسك صفَّ السند (إعادةُ التوزيع تقفله قبل قراءة تخصيصاته) ويقف عند حذف التخصيص المقفول جانبياً، والثاني يصل وهو ممسوك.
   */
  const raceInOrder = async (
    table: 'payment_allocations' | 'supplier_payment_allocations',
    paymentId: string,
    first: () => request.Test,
    second: () => request.Test,
  ) => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    let heldRows = 0;
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
        heldRows = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE "paymentId" = ${paymentId} FOR UPDATE`).length;
        locked();
        await released;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await lockTaken;
    const baseline = await waitingOnLocks();
    let waiting = 0;
    let replies: request.Response[] = [];
    try {
      const a = first().then((r) => r);
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 1; i++) await new Promise((r) => setTimeout(r, 100));
      const b = second().then((r) => r);
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 2; i++) await new Promise((r) => setTimeout(r, 100));
      release();
      await holder;
      replies = await Promise.all([a, b]);
    } finally {
      release();
    }
    return { heldRows, baseline, waiting, replies };
  };

  /** صافي ما على كلِّ مستندٍ من السند وعكسِه معاً — والعكسُ الصحيح يُرجع ما على السند الآن، فالصافي صفرٌ على كلِّ مستند. */
  const netOn = (rows: { doc: string; amount: string }[], doc: string) => rows.filter((r) => r.doc === doc).reduce((s, r) => s + Number(r.amount), 0);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'realloc-race');
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل التوزيع ${suffix}` }).expect(201)).body.id;
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد التوزيع ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع التوزيع ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(http().post('/banks')).send({ name: `صندوق ${suffix}`, kind: 'CASH_BOX', openingBalance: 5000, openingDate: today(), branchId }).expect(201)).body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('🔴 سندُ القبض: طلبان معاً إلى فاتورتين مختلفتين، فيبقى توزيعٌ واحد ومجموعُ التخصيصات مبلغُ السند', async () => {
    const first = await makeInvoice(1000);
    const left = await makeInvoice(1000);
    const right = await makeInvoice(1000);
    const payment = (
      await auth(http().post('/payments'))
        .send({ customerId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: first, amount: 1000 }] })
        .expect(201)
    ).body as { id: string };

    const send = (invoiceId: string) => auth(http().post(`/payments/${payment.id}/allocate`)).send({ allocations: [{ invoiceId, amount: 1000 }] });
    const { heldRows, baseline, waiting, replies } = await race('payment_allocations', payment.id, () => Promise.all([send(left), send(right)]));
    // المسبارُ يرى (القاعدة ٢٩): القفلُ الجانبيّ أمسك صفَّ التخصيص القائم، والطلبان كلاهما وقفا على قفلٍ قبل الإفلات.
    expect({ heldRows, stoodOnLocks: waiting >= baseline + 2 }).toEqual({ heldRows: 1, stoodOnLocks: true });

    const after = (await auth(http().get(`/payments/${payment.id}`)).expect(200)).body as { allocations: { invoiceId: string; amount: string }[] };
    expect({
      codes: replies.map((r) => r.status).sort(),
      total: after.allocations.reduce((s, a) => s + Number(a.amount), 0),
      documents: after.allocations.filter((a) => a.invoiceId === left || a.invoiceId === right).length,
    }).toEqual({ codes: [201, 201], total: 1000, documents: 1 });
  });

  it('🔴 سندُ الصرف للمورّد (مرآتُه): طلبان معاً إلى فاتورتَي شراء مختلفتين، فيبقى توزيعٌ واحد', async () => {
    const first = await makePurchase(1000);
    const left = await makePurchase(1000);
    const right = await makePurchase(1000);
    const payment = (
      await auth(http().post('/supplier-payments'))
        .send({ supplierId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: first, amount: 1000 }] })
        .expect(201)
    ).body as { id: string };

    const send = (purchaseId: string) => auth(http().post(`/supplier-payments/${payment.id}/allocate`)).send({ allocations: [{ purchaseId, amount: 1000 }] });
    const { heldRows, baseline, waiting, replies } = await race('supplier_payment_allocations', payment.id, () => Promise.all([send(left), send(right)]));
    expect({ heldRows, stoodOnLocks: waiting >= baseline + 2 }).toEqual({ heldRows: 1, stoodOnLocks: true });

    const after = (await auth(http().get(`/supplier-payments/${payment.id}`)).expect(200)).body as { allocations: { purchaseId: string; amount: string }[] };
    expect({
      codes: replies.map((r) => r.status).sort(),
      total: after.allocations.reduce((s, a) => s + Number(a.amount), 0),
      documents: after.allocations.filter((a) => a.purchaseId === left || a.purchaseId === right).length,
    }).toEqual({ codes: [201, 201], total: 1000, documents: 1 });
  });

  /**
   * 🔴 **العكسُ وإعادةُ التوزيع في اللحظة نفسِها** (توجيه ٢٧٧ · ٢د · `ق-١٦١٩`/د: «قِسه، ثم أصلحه بالقاعدة ٣٧ إن ثبت»). القفلُ في `#722` على
   * إعادة التوزيع وحدَها؛ والعكسُ يقرأ تخصيصاتِ السند بلا قفلٍ ويكتب مرآتَها. فإعادةُ توزيعٍ ممسكةٌ بالسند تنقله من فاتورةٍ إلى أخرى، والعكسُ
   * قرأ التوزيعَ القديم قبل أن تُكتب، فيعكس فاتورةً لم يعد السندُ عليها. **والجوابُ محسوبٌ يداً**: السندُ ألفٌ على الأولى، ينتقل إلى الثانية ثم
   * يُعكس، فصافي السند وعكسِه **صفرٌ على كلتيهما** (لا `-1000` على الأولى و`+1000` على الثانية من سندٍ معكوس).
   */
  it('🔴 سندُ القبض: العكسُ في لحظة إعادة التوزيع يعكس ما على السند الآن، فلا يبقى على فاتورةٍ مالٌ من سندٍ معكوس', async () => {
    const first = await makeInvoice(1000);
    const moved = await makeInvoice(1000);
    const payment = (
      await auth(http().post('/payments'))
        .send({ customerId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: first, amount: 1000 }] })
        .expect(201)
    ).body as { id: string };

    const { heldRows, baseline, waiting, replies } = await raceInOrder(
      'payment_allocations',
      payment.id,
      () => auth(http().post(`/payments/${payment.id}/allocate`)).send({ allocations: [{ invoiceId: moved, amount: 1000 }] }),
      () => auth(http().post(`/payments/${payment.id}/reverse`)).send({}),
    );
    expect({ heldRows, stoodOnLocks: waiting >= baseline + 2 }).toEqual({ heldRows: 1, stoodOnLocks: true });

    const [allocated, reversed] = replies;
    const rowsOf = async (id: string) =>
      ((await auth(http().get(`/payments/${id}`)).expect(200)).body as { allocations: { invoiceId: string; amount: string }[] }).allocations.map((a) => ({ doc: a.invoiceId, amount: a.amount }));
    const rows = [...(await rowsOf(payment.id)), ...(reversed.status === 201 ? await rowsOf(reversed.body.id as string) : [])];
    expect({ codes: [allocated.status, reversed.status], first: netOn(rows, first), moved: netOn(rows, moved) }).toEqual({ codes: [201, 201], first: 0, moved: 0 });
  });

  it('🔴 سندُ الصرف للمورّد (مرآتُه): العكسُ في لحظة إعادة التوزيع يعكس ما على السند الآن', async () => {
    const first = await makePurchase(1000);
    const moved = await makePurchase(1000);
    const payment = (
      await auth(http().post('/supplier-payments'))
        .send({ supplierId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: first, amount: 1000 }] })
        .expect(201)
    ).body as { id: string };

    const { heldRows, baseline, waiting, replies } = await raceInOrder(
      'supplier_payment_allocations',
      payment.id,
      () => auth(http().post(`/supplier-payments/${payment.id}/allocate`)).send({ allocations: [{ purchaseId: moved, amount: 1000 }] }),
      () => auth(http().post(`/supplier-payments/${payment.id}/reverse`)).send({}),
    );
    expect({ heldRows, stoodOnLocks: waiting >= baseline + 2 }).toEqual({ heldRows: 1, stoodOnLocks: true });

    const [allocated, reversed] = replies;
    const rowsOf = async (id: string) =>
      ((await auth(http().get(`/supplier-payments/${id}`)).expect(200)).body as { allocations: { purchaseId: string; amount: string }[] }).allocations.map((a) => ({ doc: a.purchaseId, amount: a.amount }));
    const rows = [...(await rowsOf(payment.id)), ...(reversed.status === 201 ? await rowsOf(reversed.body.id as string) : [])];
    expect({ codes: [allocated.status, reversed.status], first: netOn(rows, first), moved: netOn(rows, moved) }).toEqual({ codes: [201, 201], first: 0, moved: 0 });
  });
});
