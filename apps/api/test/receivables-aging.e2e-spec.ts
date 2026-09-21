import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * أعمار الذمم (4.6).
 *
 * المطابقة مع رصيد 1200 هي الفحص الذي يثبت أن التقرير يقرأ من الحقيقة لا من
 * حالة موازية (قاعدة 11) — ولذلك تجري على **منشأة اختبار مُنشأة لهذا الغرض**:
 * على قاعدة التطوير المتضخّمة تصير المطابقة اختبارَ بيانات لا اختبارَ منطق.
 */
describe('Receivables aging (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): الصندوقُ (بنكٌ) وعملاءُ الأعمار في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let customerId: string;
  let cashBoxId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const dayStr = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

  /** فاتورة بإجمالي صريح (بند واحد بلا ضريبة) وتاريخ استحقاق محدَّد. */
  const makeInvoice = async (total: number, dueOffset: number, over: Record<string, unknown> = {}) => {
    const res = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({
        customerId,
        issueDate: dayStr(dueOffset),
        dueDate: dayStr(dueOffset),
        lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
        ...over,
      })
      .expect(201);
    return { id: res.body.id, no: res.body.no };
  };

  /** ② كلُّ مبلغٍ في التقرير نصٌّ بخانتين (`ق-١٢٣٥`): يُثبَت شكلُه ثم يُقرأ رقماً — فالتوكيداتُ أدناه على الأرقام كما كانت. */
  const MONEY_TEXT = /^-?\d+\.\d{2}$/;
  const n = (text: string): number => {
    expect(text).toMatch(MONEY_TEXT);
    return Number(text);
  };
  type Buckets = { current: number; d1: number; d31: number; d61: number; d90: number; unapplied: number; total: number };
  const bucketsOf = (r: Record<keyof Buckets, string>): Buckets => ({
    current: n(r.current),
    d1: n(r.d1),
    d31: n(r.d31),
    d61: n(r.d61),
    d90: n(r.d90),
    unapplied: n(r.unapplied),
    total: n(r.total),
  });
  const aging = async (params = '') => {
    const body = (await auth(request(app.getHttpServer()).get(`/reports/receivables-aging${params}`)).expect(200)).body as {
      asOf: string;
      rows: ({ customerId: string; customerName: string } & Record<keyof Buckets, string>)[];
      totals: Record<keyof Buckets, string>;
      reconciliation: { ledgerBalance: string; reportTotal: string; difference: string } | null;
    };
    return {
      asOf: body.asOf,
      rows: body.rows.map((r) => ({ customerId: r.customerId, customerName: r.customerName, ...bucketsOf(r) })),
      totals: bucketsOf(body.totals),
      reconciliation: body.reconciliation
        ? { ledgerBalance: n(body.reconciliation.ledgerBalance), reportTotal: n(body.reconciliation.reportTotal), difference: n(body.reconciliation.difference) }
        : null,
    };
  };

  /** صفّ عميلنا وحده — القاعدة تحمل عملاء آخرين من مجموعات أخرى. */
  const myRow = async (params = '') => (await aging(params)).rows.find((r) => r.customerId === customerId);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'aging');
    token = company.token;
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل الأعمار ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(request(app.getHttpServer()).post('/banks'))
      .send({ name: `صندوق الأعمار ${suffix}`, openingBalance: 0, openingDate: dayStr(0) })
      .expect(201)).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  // ── 1: مستحقة قبل 45 يوماً بمتبقٍّ 600 ⇒ شريحة 31-60 بـ600 ──
  it('a 45-day-overdue invoice with 600 remaining lands in the 31-60 bucket', async () => {
    const inv = await makeInvoice(1000, -45);
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, date: dayStr(-1), amount: 400, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 400 }] })
      .expect(201);

    const row = await myRow();
    expect(row).toBeTruthy();
    expect(row!.d31).toBeCloseTo(600, 2);
    expect(row!.d1).toBe(0);
    expect(row!.d61).toBe(0);
    expect(row!.total).toBeCloseTo(600, 2);
  }, 90000);

  // ── 2: المسدَّدة كاملاً لا تظهر ──
  it('a fully paid invoice disappears from the report', async () => {
    const before = (await myRow())!.total;
    const inv = await makeInvoice(250, -10);
    expect((await myRow())!.total).toBeCloseTo(before + 250, 2);

    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, date: dayStr(0), amount: 250, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 250 }] })
      .expect(201);

    expect((await myRow())!.total).toBeCloseTo(before, 2);
  }, 90000);

  // ── 3: تقرير بتاريخ سابق يعطي شرائح مختلفة للفاتورة نفسها ──
  it('the same invoice falls in a different bucket when the report date moves back', async () => {
    // بتاريخ اليوم عمرها 45 يوماً (31-60)؛ وقبل 30 يوماً كان عمرها 15 (1-30).
    const past = await myRow(`?asOf=${dayStr(-30)}`);
    expect(past!.d1).toBeGreaterThan(0);
    expect(past!.d31).toBe(0);

    // ويوم استحقاقها نفسه: جارية لا متأخرة (بتاريخ أسبق منه لا تكون قد صدرت
    // بعدُ، فلا صفَّ لها إطلاقاً — وذلك سلوك صحيح لا حالة تُختبر هنا).
    const onDueDay = await myRow(`?asOf=${dayStr(-45)}`);
    expect(onDueDay!.current).toBeGreaterThan(0);
    expect(onDueDay!.d1).toBe(0);
  }, 90000);

  // ── 4 (بند إضافي): فاتورة عليها إشعار دائن تظهر بمتبقيها بعد الإشعار ──
  it('an invoice with a credit note shows its post-note remaining, not the original', async () => {
    const before = (await myRow())!.total;
    const inv = await makeInvoice(900, -5);
    expect((await myRow())!.total).toBeCloseTo(before + 900, 2);

    await auth(request(app.getHttpServer()).post(`/invoices/${inv.id}/credit-note`))
      .send({ issueDate: dayStr(0), reason: `خصم تسوية ${suffix}`, lines: [{ description: `إشعار ${suffix}`, quantity: 1, unitPrice: 300, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
      .expect(201);

    // 900 − 300 = 600 تُضاف لا 900.
    expect((await myRow())!.total).toBeCloseTo(before + 600, 2);
  }, 90000);

  // ── 5: المطابقة مع رصيد 1200 — على منشأة اختبار خاصة ──
  it('on a dedicated company the report total equals the 1200 ledger balance', async () => {
    const adminToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
    ).body.accessToken;
    const templates = (await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${adminToken}`).expect(200)).body as {
      id: string;
      isSystem: boolean;
      companyId: string | null;
    }[];
    const preset = templates.find((t) => !t.isSystem && t.companyId === null)!;

    const username = `aging-co-${suffix}`;
    await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orgName: `منشأة الأعمار ${suffix}`, username, password: 'AgingPass123!', permissionTemplateId: preset.id })
      .expect(201);
    const coToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'AgingPass123!' })).body.accessToken;
    const co = (r: request.Test) => r.set('Authorization', `Bearer ${coToken}`);

    // لا تهيئة يدوية للدليل بعد اليوم: المنشأة تُولد به كاملاً (4.7). كان هذا
    // الاختبار ينشئ 1000/1200/4100 بنفسه لأن المنشأة كانت تُولد فارغةً فلا
    // يُرحَّل لها قيد — وحذف تلك الحلقة هنا هو نفسه دليلٌ على أن الميلاد تغيّر.
    const bornWith = ((await co(request(app.getHttpServer()).get('/accounts')).expect(200)).body as { code: string }[]).map((a) => a.code);
    expect(bornWith).toEqual(expect.arrayContaining(['1000', '1200', '4100']));

    const buyer = (await co(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `مشترٍ ${suffix}` }).expect(201)).body.id;
    const box = (await co(request(app.getHttpServer()).post('/banks')).send({ name: `صندوق ${suffix}`, openingBalance: 0, openingDate: dayStr(0) }).expect(201)).body.id;

    const mk = async (total: number, issueOffset: number, dueOffset: number) =>
      (
        await co(request(app.getHttpServer()).post('/invoices'))
          .send({ customerId: buyer, issueDate: dayStr(issueOffset), dueDate: dayStr(dueOffset), lines: [{ description: 'بند', quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
          .expect(201)
      ).body;

    const i1 = await mk(1000, -100, -100); // 90+
    const i2 = await mk(500, -20, -20); // 1-30
    // صادرة اليوم ومستحقة بعد عشرة أيام: جارية لا متأخرة (فاتورةٌ مستقبلية
    // الإصدار تُستبعد بحق — لم تصر ذمّةً بعد، ولا قيدها رُحِّل).
    await mk(300, 0, 10);
    // سداد جزئي + دفعة على الحساب (تخفّض 1200 بلا فاتورة).
    await co(request(app.getHttpServer()).post('/payments'))
      .send({ customerId: buyer, date: dayStr(0), amount: 400, method: 'CASH', bankId: box, allocations: [{ invoiceId: i1.id, amount: 400 }] })
      .expect(201);
    await co(request(app.getHttpServer()).post('/payments')).send({ customerId: buyer, date: dayStr(0), amount: 150, method: 'CASH', bankId: box }).expect(201);
    // وإشعار دائن على فاتورة.
    await co(request(app.getHttpServer()).post(`/invoices/${i2.id}/credit-note`))
      .send({ issueDate: dayStr(0), reason: 'مرتجع', lines: [{ description: 'مرتجع', quantity: 1, unitPrice: 100, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
      .expect(201);

    const raw = (await co(request(app.getHttpServer()).get('/reports/receivables-aging?reconcile=true')).expect(200)).body as {
      totals: Record<keyof Buckets, string>;
      reconciliation: { ledgerBalance: string; reportTotal: string; difference: string };
    };
    const report = {
      totals: bucketsOf(raw.totals),
      reconciliation: { ledgerBalance: n(raw.reconciliation.ledgerBalance), reportTotal: n(raw.reconciliation.reportTotal), difference: n(raw.reconciliation.difference) },
    };

    // (1000−400) + (500−100) + 300 − 150 = 1150
    expect(report.totals.total).toBeCloseTo(1150, 2);
    expect(report.totals.unapplied).toBeCloseTo(-150, 2);
    // وهو نفسه رصيد 1200 في الدفتر — لا فرق غير منسوب على منشأة نظيفة.
    expect(report.reconciliation.ledgerBalance).toBeCloseTo(report.reconciliation.reportTotal, 2);
    expect(report.reconciliation.difference).toBeCloseTo(0, 2);

    // والمنشأةُ المخصوصة تُزال بعد أن أدّت — لا تبقى بصندوقها في القاعدة (ق-٧٢٢).
    const meRes = await co(request(app.getHttpServer()).get('/auth/me')).expect(200);
    await hardDeleteCompanyForTest(app.get(PrismaService), meRes.body.companyId);
    expect(await app.get(PrismaService).company.count({ where: { id: meRes.body.companyId } })).toBe(0);
  }, 180000);

  // ── 6: سطر التسوية يكشف القيد اليدوي بدل أن يخفيه ──
  it('a manual entry on 1200 surfaces as an unattributed difference — never hidden or forced', async () => {
    const accounts = (await auth(request(app.getHttpServer()).get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const ar = accounts.find((a) => a.code === '1200')!;
    const other = accounts.find((a) => a.code === '4100')!;

    const before = (await aging('?reconcile=true')).reconciliation!;
    const entry = await auth(request(app.getHttpServer()).post('/journal'))
      .send({
        date: dayStr(0),
        memo: `قيد يدوي على الذمم ${suffix}`,
        lines: [
          { accountId: ar.id, debit: 777, credit: 0 },
          { accountId: other.id, debit: 0, credit: 777 },
        ],
      })
      .expect(201);

    const after = (await aging('?reconcile=true')).reconciliation!;
    // التقرير لم يتغير (لا مستند خلف القيد)، والدفتر ارتفع 777 — فالفرق ظاهر.
    expect(after.reportTotal).toBeCloseTo(before.reportTotal, 2);
    expect(after.difference - before.difference).toBeCloseTo(777, 2);

    // التنظيفُ بالعكس لا بالحذف (ق-١٢٥٣/①) — بتاريخ الأصل.
    await auth(request(app.getHttpServer()).post(`/journal/${entry.body.id}/reverse`)).send({ date: dayStr(0) }).expect(201);
  }, 120000);

  // ── 7: التصدير CSV بعربية سليمة ──
  it('exports CSV with a BOM and named Arabic columns', async () => {
    const res = await auth(request(app.getHttpServer()).get('/reports/receivables-aging/export')).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain('العميل');
    expect(res.text).toContain('أكثر من 90');
  }, 90000);
});
