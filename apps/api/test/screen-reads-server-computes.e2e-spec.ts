import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (27.2 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(85000);

/**
 * **الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣` — الحزمةُ الثانية من المراجعة الخارجية): كلُّ رقمٍ كانت الشاشةُ
 * تجمعه من قوائم الخادم صار يُحسب في الخادم ويُرسَل جاهزاً — نصّاً بخانتين (`ق-١٢٣٥`).
 *
 * الحارسُ يقرأ كلَّ رقمٍ **بجوابٍ معلومٍ يداً** على منشأةٍ معزولة تصنع صفوفَها وتُزال:
 *   ① لوحةُ التحكّم: الإيرادُ **صافياً من الضريبة** (`1000` لا `1150`) والذممُ **بمتبقّي** المسدَّد جزئياً (`750` لا `1150`)
 *      والمصروفُ من الدفتر والصافي — والسلسلةُ الشهرية تحمل الشهر.
 *   ② ملخّصُ العميل: المفوتَرُ والمقبوضُ من التخصيصات (`400` — لا فاتورةً ختمُها `PAID`) والرصيدُ — ورصيدُه في القائمة.
 *   ③ ملخّصُ المورّد بالفترة: المفوتَرُ والمسدَّدُ والمستحقّ — وخارجَ الفترة أصفار.
 *   ④ سندُ القبض: `allocatedTotal`/`unallocated` — سندٌ موزَّع وسندٌ على الحساب.
 *   ⑤ مجموعُ الدليل لكل نوع = مجموعُ أرصدة القائمة رقماً رقماً.
 *   ⑥ العقد: إجماليُّ القسط بالضريبة ومسدَّدُه ومتبقّيه، ومجموعُ المطالبات المفتوحة، والمحجوزُ لدى المنشأة.
 */
const MONEY_TEXT = /^-?\d+\.\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const monthStart = (offset = 0) => addMonths(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)), offset);

describe('الشاشةُ تقرأ ولا تحسب — الأرقامُ من الخادم (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let customerId: string;
  let supplierId: string;
  let bankId: string;
  let invoiceId: string;
  let purchaseId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = iso(new Date());
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'screen-reads');
    token = company.token;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل اللوحة ${suffix}` }).expect(201)).body.id;
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد اللوحة ${suffix}` }).expect(201)).body.id;
    bankId = (await auth(http().post('/banks')).send({ name: `صندوق اللوحة ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body.id;

    // فاتورةٌ خاضعة: 1000 + 15% = 1150، تُسدَّد 400 — فالإيرادُ 1000 والذمّةُ 750.
    invoiceId = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: 1000, taxCategory: 'S' }] })
        .expect(201)
    ).body.id;
    await auth(http().post('/payments'))
      .send({ customerId, date: today, amount: 400, method: 'CASH', bankId, allocations: [{ invoiceId, amount: 400 }] })
      .expect(201);
    // شراءٌ معفى بـ200 يُسدَّد منه 100 — مصروفٌ 200 في الدفتر، ومستحقٌّ للمورّد 100.
    purchaseId = (await auth(http().post('/purchases')).send({ supplierId, date: today, category: `مصروف ${suffix}`, subtotal: 200, exempt: true }).expect(201)).body.id;
    await auth(http().post('/supplier-payments'))
      .send({ supplierId, date: today, amount: 100, method: 'CASH', bankId, allocations: [{ purchaseId, amount: 100 }] })
      .expect(201);
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('① لوحةُ التحكّم: الإيرادُ صافياً من الضريبة، والذممُ بمتبقّي المسدَّد جزئياً، والمصروفُ من الدفتر', async () => {
    const res = await auth(http().get('/reports/dashboard')).query({ from: today, to: today }).expect(200);
    const d = res.body as { revenue: string; expenses: string; netProfit: string; receivables: string; monthly: { month: string; revenue: string }[] };
    for (const v of [d.revenue, d.expenses, d.netProfit, d.receivables]) expect(v).toMatch(MONEY_TEXT);
    // كانت الشاشةُ تعرض 1150 (إجماليَّ الفاتورة بضريبتها) — والإيرادُ في الدفتر 1000.
    expect(d.revenue).toBe('1000.00');
    // وكانت تعرض 1150 ذمّةً (فاتورةٌ غيرُ PAID بكاملها) — والمتبقّي بعد 400 هو 750.
    expect(d.receivables).toBe('750.00');
    expect(d.expenses).toBe('200.00');
    expect(d.netProfit).toBe('800.00');
    // السلسلةُ تحمل شهرَ اليوم بإيراده — والشهرُ مفتاحُه `YYYY-MM`.
    const thisMonth = d.monthly.find((m) => m.month === today.slice(0, 7));
    expect(thisMonth).toBeDefined();
    expect(thisMonth!.revenue).toBe('1000.00');
    expect(d.monthly).toHaveLength(1);
  }, 30000);

  it('① لوحةُ التحكّم بلا بداية: ستّةُ أشهرٍ تنتهي بشهر النهاية', async () => {
    const d = (await auth(http().get('/reports/dashboard')).query({ to: today }).expect(200)).body as { monthly: { month: string }[] };
    expect(d.monthly).toHaveLength(6);
    expect(d.monthly[5].month).toBe(today.slice(0, 7));
  }, 30000);

  it('② ملخّصُ العميل: المفوتَرُ 1150 والمقبوضُ 400 من التخصيصات والرصيدُ 750 — وفي القائمة رصيدُه', async () => {
    const s = (await auth(http().get(`/customers/${customerId}/summary`)).expect(200)).body as { billed: string; collected: string; outstanding: string };
    expect(s).toMatchObject({ billed: '1150.00', collected: '400.00', outstanding: '750.00' });
    const rows = (await auth(http().get('/customers')).expect(200)).body as { id: string; outstanding: string }[];
    expect(rows.find((c) => c.id === customerId)!.outstanding).toBe('750.00');
    await auth(http().get(`/customers/00000000-0000-0000-0000-000000000000/summary`)).expect(404);
  }, 30000);

  it('③ ملخّصُ المورّد بالفترة: 200 فُوتر · 100 سُدِّد · 100 مستحقّ — وخارجَ الفترة أصفار', async () => {
    const s = (await auth(http().get(`/suppliers/${supplierId}/summary`)).query({ from: today, to: today }).expect(200)).body as { billed: string; paid: string; due: string };
    // الشراءُ معفى: الإجماليُّ 200 لا 230 — فالمعفى بلا ضريبة.
    expect(s).toMatchObject({ billed: '200.00', paid: '100.00', due: '100.00' });
    const none = (await auth(http().get(`/suppliers/${supplierId}/summary`)).query({ from: '2020-01-01', to: '2020-01-31' }).expect(200)).body as { billed: string; paid: string; due: string };
    expect(none).toMatchObject({ billed: '0.00', paid: '0.00', due: '0.00' });
  }, 30000);

  it('④ سندُ القبض يحمل مخصَّصَه وغيرَ مخصَّصه — الموزَّعُ كلُّه، وعلى الحساب كلُّه', async () => {
    // ④A1: على الحساب مغطّىً بالمفتوح (`750`) — يُعلَن.
    const onAccount = (await auth(http().post('/payments')).send({ customerId, date: today, amount: 50, method: 'CASH', bankId, unallocated: 'ON_ACCOUNT' }).expect(201)).body as { id: string; allocatedTotal: string; unallocated: string };
    expect(onAccount).toMatchObject({ allocatedTotal: '0.00', unallocated: '50.00' });
    const rows = (await auth(http().get('/payments')).expect(200)).body as { id: string; amount: string; allocatedTotal: string; unallocated: string }[];
    const allocated = rows.find((p) => Number(p.amount) === 400)!;
    expect(allocated).toMatchObject({ allocatedTotal: '400.00', unallocated: '0.00' });
    expect(rows.find((p) => p.id === onAccount.id)).toMatchObject({ allocatedTotal: '0.00', unallocated: '50.00' });
    // وسندُ الصرف كذلك.
    const paid = (await auth(http().get('/supplier-payments')).expect(200)).body as { allocatedTotal: string; unallocated: string }[];
    expect(paid[0]).toMatchObject({ allocatedTotal: '100.00', unallocated: '0.00' });
  }, 30000);

  it('⑤ مجموعُ الدليل لكل نوعٍ يساوي مجموعَ أرصدة القائمة رقماً رقماً', async () => {
    const summary = (await auth(http().get('/accounts/summary')).expect(200)).body as Record<string, { total: string; count: number }>;
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { type: string; balance: string }[];
    for (const type of ['asset', 'liability', 'equity', 'revenue', 'expense']) {
      expect(summary[type].total).toMatch(MONEY_TEXT);
      const mine = accounts.filter((a) => a.type === type);
      expect(summary[type].count).toBe(mine.length);
      expect(Number(summary[type].total)).toBeCloseTo(mine.reduce((s, a) => s + Number(a.balance), 0), 2);
    }
    // السطحُ غيرُ فارغ: الدليلُ الافتراضي فيه أصولٌ وإيراد.
    expect(summary.asset.count).toBeGreaterThan(0);
    expect(Number(summary.revenue.total)).toBeGreaterThan(0);
  }, 30000);

  it('⑥ العقد: إجماليُّ القسط بالضريبة ومسدَّدُه ومتبقّيه، ومجموعُ المطالبات المفتوحة، والمحجوزُ لدى المنشأة', async () => {
    const property = (await auth(http().post('/properties')).send({ name: `عقار اللوحة ${suffix}`, ownership: 'owned' }).expect(201)).body as { id: string };
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `SR-${suffix}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body as { id: string };
    const tenantId = await createTenantCustomer(app, token, `مستأجر اللوحة ${suffix}`, '0500000401');
    const start = monthStart(0);
    const contract = (
      await auth(http().post('/contracts'))
        .send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: tenantId, value: 12000, cycle: 'monthly', start: iso(start), end: iso(new Date(addMonths(start, 12).getTime() - 86400000)) })
        .expect(201)
    ).body as { id: string; installments: { id: string; dueDate: string; gross: string; settled: string; remaining: string }[] };
    // غيرُ الشامل الخاضع: القسطُ 1000 وإجماليُّه 1150 — منذ الإنشاء، قبل أيّ دفعة.
    const first = [...contract.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    expect(first).toMatchObject({ gross: '1150.00', settled: '0.00', remaining: '1150.00' });

    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ installmentId: first.id, date: today, amount: 300, method: 'CASH' }).expect(201);
    await auth(http().post(`/contracts/${contract.id}/claims`)).send({ kind: 'DAMAGE', amount: 500, description: `كسر ${suffix}`, issuedAt: today }).expect(201);
    await auth(http().post(`/contracts/${contract.id}/deposits`)).send({ type: 'RENT', amount: 3000, receivedAt: today }).expect(201);
    await auth(http().post(`/contracts/${contract.id}/deposits`)).send({ type: 'FACILITY', amount: 700, receivedAt: today, holder: 'EJAR' }).expect(201);

    const detail = (await auth(http().get(`/contracts/${contract.id}`)).expect(200)).body as {
      installments: { id: string; gross: string; settled: string; remaining: string }[];
      claimsOutstanding: string;
      depositsHeld: string;
    };
    expect(detail.installments.find((i) => i.id === first.id)).toMatchObject({ gross: '1150.00', settled: '300.00', remaining: '850.00' });
    expect(detail.claimsOutstanding).toBe('500.00');
    // المحجوزُ لدى المنشأة وحدَه — ما لدى إيجار لا يُعدّ.
    expect(detail.depositsHeld).toBe('3000.00');
  }, 60000);
});
