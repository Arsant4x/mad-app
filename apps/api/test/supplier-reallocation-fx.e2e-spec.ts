import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ معزولة وأربعُ سندات؛ لم تُقَس بعد، فالسقفُ معلنٌ هنا.
jest.setTimeout(120000);

/**
 * ⚖️ **فرقُ السعر في إعادة توزيع سند صرف المورّد** (توجيه ٢٨٦، حكمُ صاحب المشروع المؤقّت حتى يجيب المحاسب): «**إلى تكلفة
 * المشتريات بسعر يوم الدفعة المقدّمة، فلا فرق صرفٍ لما دُفع مقدّماً**».
 *
 * كانت إعادةُ التوزيع لا تكتب قيداً: دفعةٌ مقدّمة ١٠٠ دولار بـ3.80 (٣٨٠) على شراءٍ لاحقٍ بـ3.70 (٣٧٠) تُبقي ١٠ في `2100`
 * والشراءُ «مسدَّد»، ثم عكسُ السند يُظهر ربحاً وهميّاً ١٠ في `5600`. والجوابُ محسوبٌ يداً في كلِّ مرحلة.
 * والأرصدةُ كما يعرضها الدليل: `2100` موجبٌ دائن، و`5300` (حسابُ الفئة الحرّة) و`5600` موجبان مدينان.
 */
describe('إعادةُ توزيع سند صرف المورّد تكتب قيدها، والعكسُ لا يترك رصيداً ولا ربحاً وهميّاً (توجيه ٢٨٦)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let supplierId: string;
  let branchId: string;
  let cashBoxId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const balances = async (): Promise<{ payables: number; cost: number; fx: number }> => {
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[];
    const of = (code: string) => Number(accounts.find((a) => a.code === code)?.balance ?? 0);
    return { payables: of('2100'), cost: of('5300'), fx: of('5600') };
  };
  const delta = (a: { payables: number; cost: number; fx: number }, b: { payables: number; cost: number; fx: number }) => ({
    payables: Math.round((b.payables - a.payables) * 100) / 100,
    cost: Math.round((b.cost - a.cost) * 100) / 100,
    fx: Math.round((b.fx - a.fx) * 100) / 100,
  });

  const purchaseUsd = async (date: string, rate: number): Promise<string> =>
    ((await auth(http().post('/purchases'))
      .send({ supplierId, branchId, date, category: `بند ${suffix}`, subtotal: 100, exempt: true, currency: 'USD', exchangeRate: rate })
      .expect(201)).body as { id: string }).id;
  const paymentUsd = async (date: string, rate: number): Promise<string> =>
    ((await auth(http().post('/supplier-payments'))
      .send({ supplierId, branchId, date, amount: 100, method: 'CASH', bankId: cashBoxId, currency: 'USD', exchangeRate: rate })
      .expect(201)).body as { id: string }).id;
  const allocate = (paymentId: string, purchaseId: string) =>
    auth(http().post(`/supplier-payments/${paymentId}/allocate`)).send({ allocations: [{ purchaseId, amount: 100 }] }).expect(201);
  const reverse = (paymentId: string) => auth(http().post(`/supplier-payments/${paymentId}/reverse`)).send({}).expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'supplier-realloc-fx');
    supplierId = ((await auth(http().post('/suppliers')).send({ name: `مورّد التوزيع ${suffix}` }).expect(201)).body as { id: string }).id;
    branchId = ((await auth(http().post('/branches')).send({ name: `فرع التوزيع ${suffix}` }).expect(201)).body as { id: string }).id;
    cashBoxId = ((await auth(http().post('/banks'))
      .send({ name: `صندوق ${suffix}`, kind: 'CASH_BOX', openingBalance: 5000, openingDate: dayOffset(-60), branchId })
      .expect(201)).body as { id: string }).id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('🔴 ① دفعةٌ مقدّمة على شراءٍ لاحق: الفرقُ إلى تكلفة الشراء لا إلى فرق الصرف، والعكسُ يردّه فلا يبقى في المورّدين ولا في 5600 شيء', async () => {
    const start = await balances();
    const payment = await paymentUsd(dayOffset(-30), 3.8);
    const purchase = await purchaseUsd(dayOffset(0), 3.7);
    // قبل التوزيع: الدفعةُ مدينٌ ٣٨٠ والشراءُ دائنٌ ٣٧٠ وتكلفتُه ٣٧٠.
    expect(delta(start, await balances())).toEqual({ payables: -10, cost: 370, fx: 0 });

    await allocate(payment, purchase);
    // بعده: الشراءُ مقيسٌ بسعر الدفعة (٣٨٠)، فلا يبقى في المورّدين شيءٌ ولا فرقُ صرف.
    expect(delta(start, await balances())).toEqual({ payables: 0, cost: 380, fx: 0 });

    await reverse(payment);
    // وبعد العكس: الشراءُ مستحقٌّ ٣٧٠ بسعره وتكلفتُه ٣٧٠، ولا ربحَ وهميّاً في 5600.
    expect(delta(start, await balances())).toEqual({ payables: 370, cost: 370, fx: 0 });
  });

  it('② ودفعةٌ لاحقةٌ للشراء ثم تُخصَّص عليه تسويةٌ عادية: الفرقُ في 5600 كسند القبض، والعكسُ يردّه منه', async () => {
    const start = await balances();
    const purchase = await purchaseUsd(dayOffset(-20), 3.7);
    const payment = await paymentUsd(dayOffset(-10), 3.8);

    await allocate(payment, purchase);
    expect(delta(start, await balances())).toEqual({ payables: 0, cost: 370, fx: 10 });

    await reverse(payment);
    expect(delta(start, await balances())).toEqual({ payables: 370, cost: 370, fx: 0 });
  });
});
