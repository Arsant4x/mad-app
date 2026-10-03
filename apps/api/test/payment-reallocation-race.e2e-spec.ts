import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@mad-app/db';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ وسندٌ وثلاثُ فواتير وقفلٌ مقصود؛ لم تُقَس بعد، فالسقفُ مئةٌ وعشرون ثانية معلنةً هنا.
jest.setTimeout(120000);

/**
 * ⚖️ **إعادةُ توزيع السند تحت طلبين متزامنين** (توجيه ٢٧٦ · ٢و · `ق-١٦٠٩`/و، القاعدة الدائمة ٣٧: «قِس ثم أصلح»).
 *
 * مسحُ الدفعات (`docs/domain-scan/34`، م١) وجد أن إعادةَ التوزيع (`POST /payments/:id/allocate`) **لا تقفل صفَّ السند**: تقرأ تخصيصاتِه،
 * وتحذفها، وتكتب الجديدة. وطلبان معاً على السند نفسِه وإلى فاتورتين مختلفتين: يحذف الأوّلُ ويكتب، ويحذف الثاني ما رآه وحدَه (لا ما كتبه
 * الأوّلُ بعد بدء حذفه) ويكتب فوقه — **فيبقى التوزيعان معاً ويزيد مجموعُ تخصيصات السند على مبلغه**.
 *
 * **والتداخلُ مفروضٌ لا منتظَر** (`§8.8` الوجهُ الثالث): معاملةٌ جانبيّة تقفل صفوفَ تخصيص السند (`FOR UPDATE`) حتى يصل الطلبان كلاهما إلى
 * الانتظار (يُقرأ من `pg_stat_activity` لا بزمنٍ يُخمَّن)، ثم تُفلت. والجوابُ محسوبٌ يداً: السندُ `1000`، وكلُّ طلبٍ يوزّعه كاملاً على فاتورةٍ
 * بألف، **فمجموعُ تخصيصاته بعدهما `1000` لا `2000`**، وفاتورتان مسدَّدتان لا تكون.
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

  /** عددُ الجلسات المنتظرة على قفل صفٍّ في هذه القاعدة الآن — بلا الجلسة الجانبيّة نفسِها. */
  const waitingOnLocks = async (): Promise<number> => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    return Number(rows[0].n);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'realloc-race');
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل التوزيع ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع التوزيع ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(http().post('/banks')).send({ name: `صندوق ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: today(), branchId }).expect(201)).body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('🔴 طلبان معاً إلى فاتورتين مختلفتين: يبقى توزيعٌ واحد، ومجموعُ التخصيصات مبلغُ السند', async () => {
    const first = await makeInvoice(1000);
    const left = await makeInvoice(1000);
    const right = await makeInvoice(1000);
    const payment = (
      await auth(http().post('/payments'))
        .send({ customerId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: first, amount: 1000 }] })
        .expect(201)
    ).body as { id: string };

    // المعاملةُ الجانبيّة: تقفل صفَّ التخصيص القائم حتى يصل الطلبان كلاهما إلى الانتظار، ثم تُفلته.
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    let heldRows = 0;
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
        heldRows = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM payment_allocations WHERE "paymentId" = ${payment.id} FOR UPDATE`).length;
        locked();
        await released;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await lockTaken;
    // المسبارُ يرى (القاعدة ٢٩): القفلُ الجانبيّ أمسك صفَّ التخصيص القائم فعلاً، وإلا فلا تداخلَ يُفرض.
    expect(heldRows).toBe(1);
    const baseline = await waitingOnLocks();

    const send = (invoiceId: string) => auth(http().post(`/payments/${payment.id}/allocate`)).send({ allocations: [{ invoiceId, amount: 1000 }] });
    const both = Promise.all([send(left), send(right)]);
    // يُنتظر حتى يقف الطلبان كلاهما على القفل (أو مهلةٌ معلنة) — لا زمنٌ يُخمَّن. والإفلاتُ في `finally` فلا يعلق شيءٌ إن سقط التوكيد.
    let waiting = 0;
    try {
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 2; i++) await new Promise((r) => setTimeout(r, 100));
    } finally {
      release();
    }
    await holder;
    // التداخلُ وقع: الطلبان كلاهما كانا واقفَين على قفلٍ قبل الإفلات (وإلا فما يلي لا يقيس السباق).
    expect(waiting).toBeGreaterThanOrEqual(baseline + 2);
    const replies = await both;

    const after = (await auth(http().get(`/payments/${payment.id}`)).expect(200)).body as { allocations: { invoiceId: string; amount: string }[] };
    const total = after.allocations.reduce((s, a) => s + Number(a.amount), 0);
    expect({
      codes: replies.map((r) => r.status).sort(),
      total,
      invoices: after.allocations.map((a) => a.invoiceId).filter((id) => id === left || id === right).length,
    }).toEqual({ codes: [201, 201], total: 1000, invoices: 1 });
  });
});
