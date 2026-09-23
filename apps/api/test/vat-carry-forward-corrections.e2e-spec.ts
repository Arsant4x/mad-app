import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥).
jest.setTimeout(120000);

/**
 * ⑥A3 (`ق-١٣٢٥`) — **الرصيدُ المرحَّل وتصحيحُ الإقرارات** (م٦٢/٢/ي · م٦٣، و«otherwise
 * excess Tax will be carried forward»).
 *
 * **الأرقامُ محسوبةٌ يداً** (`ق-٧١٥`): الربعُ الأول شراءٌ بلا بيع ⟵ صافٍ `−150` (فائض)؛
 * والربعُ الثاني بيعٌ بـ`1,000` ⟵ صافٍ `+150`، فالمرحَّلُ يجعل المستحقَّ **صفراً**.
 */
describe('[SPEC 6.2] ⑥A3 — المرحَّلُ والتصحيحات (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const read = async (q: Record<string, number>) => (await auth(http().get('/obligations/vat-declaration')).query(q).expect(200)).body;

  const Q1 = { year: 2026, quarter: 1 };
  const Q2 = { year: 2026, quarter: 2 };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'vat-carry');

    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل' }).expect(201)).body.id;
    const supplierId = (await auth(http().post('/suppliers')).send({ name: 'مورّد' }).expect(201)).body.id;
    // الربعُ الأول: شراءٌ بـ1,000 (ضريبتُه 150) بلا بيع ⟵ فائضٌ 150.
    await auth(http().post('/purchases')).send({ supplierId, date: '2026-02-10', subtotal: 1000, inputVatUse: 'TAXABLE_ONLY' }).expect(201);
    // الربعُ الثاني: بيعٌ بـ1,000 (ضريبتُه 150) ⟵ مستحقٌّ 150.
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-05-10', dueDate: '2026-06-10', lines: [{ description: 'خدمة', quantity: 1, unitPrice: 1000, taxRate: 15 }] })
      .expect(201);
  }, 180000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('① لا يُرحَّل شيءٌ من فترةٍ لم تُقدَّم — فالرصيدُ واقعةُ تقديمٍ لا قراءةُ عمل', async () => {
    expect((await read(Q1)).netVat).toBe('-150.00');
    const q2 = await read(Q2);
    expect(q2.netVat).toBe('150.00');
    expect(q2.carriedForward).toBe('0.00');
    expect(q2.carriedForwardFrom).toBeNull();
    expect(q2.netVatAfterCarryForward).toBe('150.00');
  });

  it('② وبعد تقديم الربع الأول يُرحَّل فائضُه — والمستحقُّ يصير صفراً', async () => {
    await auth(http().post('/obligations/vat-declaration/filed')).send(Q1).expect(201);
    const q2 = await read(Q2);
    expect(q2.carriedForward).toBe('150.00');
    expect(q2.carriedForwardFrom).toMatchObject({ year: 2026, periodType: 'QUARTERLY', periodNo: 1 });
    // **و`netVat` يبقى صافيَ الفترة نفسِها** — فلا يتغيّر ما يُقاس عليه «تغيّر بعد التقديم».
    expect(q2.netVat).toBe('150.00');
    expect(q2.netVatAfterCarryForward).toBe('0.00');
  });

  it('③ ⚠️ وطلبُ الردّ يُخرج الفائضَ فلا يُرحَّل — ولو خُمِّن لحُسب مرّتين', async () => {
    await auth(http().post('/obligations/vat-declaration/filed')).send({ ...Q1, refundRequested: true }).expect(201);
    const q2 = await read(Q2);
    expect(q2.carriedForward).toBe('0.00');
    expect(q2.netVatAfterCarryForward).toBe('150.00');
    // ثم يُعاد الوسمُ بلا طلبِ ردّ — فيعود الترحيل (وهو الأصل).
    await auth(http().post('/obligations/vat-declaration/filed')).send(Q1).expect(201);
    expect((await read(Q2)).carriedForward).toBe('150.00');
  });

  it('④ التصحيحُ يدخل الصافي بإشارته (م٦٣/٢ · خانةُ م٦٢/٢/ي)', async () => {
    const body = { ...Q2, correctedYear: 2026, correctedPeriodType: 'QUARTERLY', correctedPeriodNo: 1, amount: 40, reason: 'سطرٌ فات الربعَ الأول' };
    const created = await auth(http().post('/obligations/vat-declaration/corrections')).send(body).expect(201);
    const q2 = await read(Q2);
    expect(q2.corrections.total).toBe('40.00');
    expect(q2.corrections.rows).toHaveLength(1);
    expect(q2.netVat).toBe('190.00'); // 150 + 40
    expect(q2.netVatAfterCarryForward).toBe('40.00'); // − المرحَّل 150

    // وسالبٌ يُنقص — والمجموعُ يجمع الإشارتين.
    await auth(http().post('/obligations/vat-declaration/corrections'))
      .send({ ...body, amount: -15, reason: 'زيادةٌ سابقة تُردّ' })
      .expect(201);
    const after = await read(Q2);
    expect(after.corrections.total).toBe('25.00');
    expect(after.netVat).toBe('175.00');

    // والسحبُ يعيده — ما دام إقرارُه لم يُقدَّم.
    await auth(http().delete(`/obligations/vat-declaration/corrections/${created.body.id}`)).expect(200);
    expect((await read(Q2)).corrections.total).toBe('-15.00');
  });

  it('⑤ 🔴 نقصٌ يبلغ خمسةَ آلافٍ يُرفض برسالةٍ تقول ما يُفعَل — ولا يُبتلع في الإقرار', async () => {
    const body = { ...Q2, correctedYear: 2026, correctedPeriodType: 'QUARTERLY', correctedPeriodNo: 1, reason: 'فرقٌ كبير' };
    const res = await auth(http().post('/obligations/vat-declaration/corrections')).send({ ...body, amount: 5000 }).expect(400);
    expect(JSON.stringify(res.body)).toContain('عشرين يوماً');
    // ودون الحدّ يُقبل — فالحدُّ هو الفاصل لا الرفضُ المطلق.
    await auth(http().post('/obligations/vat-declaration/corrections')).send({ ...body, amount: 4999.99 }).expect(201);
  });

  it('⑥ ولا يُصحَّح إقرارٌ بنفسه ولا بما بعده، ولا يُسحب تصحيحٌ من إقرارٍ قُدِّم', async () => {
    const base = { ...Q2, correctedYear: 2026, correctedPeriodType: 'QUARTERLY', reason: 'خطأ' };
    await auth(http().post('/obligations/vat-declaration/corrections')).send({ ...base, correctedPeriodNo: 2, amount: 10 }).expect(400);
    await auth(http().post('/obligations/vat-declaration/corrections')).send({ ...base, correctedPeriodNo: 3, amount: 10 }).expect(400);

    const keep = await auth(http().post('/obligations/vat-declaration/corrections')).send({ ...base, correctedPeriodNo: 1, amount: 5 }).expect(201);
    await auth(http().post('/obligations/vat-declaration/filed')).send(Q2).expect(201);
    const refused = await auth(http().delete(`/obligations/vat-declaration/corrections/${keep.body.id}`)).expect(409);
    expect(JSON.stringify(refused.body)).toContain('قُدِّم');
    await auth(http().delete('/obligations/vat-declaration/filed')).query(Q2).expect(200);
  });

  it('⑦ وما لم يُبنَ معلَنٌ في وجه الإقرار لا في وثيقةٍ بعيدة', async () => {
    const q2 = await read(Q2);
    const imports = q2.notBuilt.find((n: { code: string }) => n.code === 'IMPORT_BOXES');
    expect(imports?.note).toContain('الاستيراد');
    expect(imports?.note).toContain('يدوياً');
  });
});
