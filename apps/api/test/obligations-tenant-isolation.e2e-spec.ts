import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (15.5 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(50000);

describe('Government obligations checklist + VAT declaration (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('[SPEC 6.9] auto-seeds the standard 9-item checklist across 3 entities on first read, idempotently', async () => {
    const first = await request(app.getHttpServer()).get('/obligations').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(first.body).toHaveLength(9);
    const bodies = new Set(first.body.map((o: { body: string }) => o.body));
    expect(bodies.size).toBe(3);
    expect(first.body.every((o: { done: boolean }) => o.done === false)).toBe(true);

    const second = await request(app.getHttpServer()).get('/obligations').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(second.body.map((o: { id: string }) => o.id).sort()).toEqual(first.body.map((o: { id: string }) => o.id).sort());
  });

  it('[SPEC 6.9] toggles an obligation done/undone', async () => {
    const list = await request(app.getHttpServer()).get('/obligations').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const id = list.body[0].id;

    const toggled = await request(app.getHttpServer()).patch(`/obligations/${id}/toggle`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(toggled.body.done).toBe(true);

    const toggledBack = await request(app.getHttpServer()).patch(`/obligations/${id}/toggle`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(toggledBack.body.done).toBe(false);
  });

  it('[SPEC 6.1] computes a VAT declaration from real invoice/purchase data for the given quarter', async () => {
    const readDeclaration = () =>
      request(app.getHttpServer()).get('/obligations/vat-declaration').query({ year: 2026, quarter: 3 }).set('Authorization', `Bearer ${tokenA}`).expect(200);
    // الربعُ يحمل ما تركته حِزمٌ أخرى على منشأة العرض — ومنها إلغاءاتُ مشترياتٍ قديمة تُقرأ **في ربع الإلغاء بإشارةٍ
    // سالبة** (`ق-٩٩٧`/②)، فقد يهبط رقمُ الربع تحت ما يضيفه هذا الاختبار. فيُقاس **ما أضافه** هو لا رقمٌ مطلق.
    const before = await readDeclaration();
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ kind: 'NATURAL', name: `عميل إقرار ${Date.now()}` })
      .expect(201);
    await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId: customer.body.id,
        issueDate: '2026-08-15',
        dueDate: '2026-09-15',
        lines: [{ description: 'vat test', quantity: 1, unitPrice: 1000, taxRate: 15 }],
      })
      .expect(201);

    const supplier = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `مورد إقرار ${Date.now()}` })
      .expect(201);
    await request(app.getHttpServer())
      .post('/purchases')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ supplierId: supplier.body.id, date: '2026-08-20', subtotal: 400 })
      .expect(201);

    const declaration = await readDeclaration();

    expect(declaration.body.from).toBe('2026-07-01');
    expect(declaration.body.to).toBe('2026-09-30');
    // ② المالُ نصّاً بخانتين (`ق-١٢٣٥`): الشكلُ يُثبَت حرفاً، والفروقُ تُقرأ رقماً.
    expect(declaration.body.salesStandard).toMatch(/^-?\d+\.\d{2}$/);
    expect(Number(declaration.body.salesStandard) - Number(before.body.salesStandard)).toBeCloseTo(1000, 2);
    expect(Number(declaration.body.salesStandardVat) - Number(before.body.salesStandardVat)).toBeCloseTo(150, 2);
    expect(Number(declaration.body.purchasesStandard) - Number(before.body.purchasesStandard)).toBeCloseTo(400, 2);
    expect(Number(declaration.body.purchasesStandardVat) - Number(before.body.purchasesStandardVat)).toBeCloseTo(60, 2);
    /**
     * ⑥A1 (`ق-١٣٢٥`) — **الصافي يُطرح منه المخصومُ لا كلُّ ضريبة المشتريات** (م٥١).
     *
     * وكان هذا التوكيدُ يُثبّت الصيغةَ القديمة `salesStandardVat − purchasesStandardVat`
     * (`§8.14`/الوجه الثالث: توكيدٌ على ثابتٍ يصير حارسَ الحالة القائمة) — وسقط على
     * **الصواب** حين بُني الخصم. والمنشأةُ هنا مبذورةٌ قد يكون فيها معفى، فالمقارنةُ
     * **بالمخصوم الذي يُعلنه الردُّ نفسُه** لا بافتراضٍ عنه.
     */
    expect(Number(declaration.body.netVat)).toBeCloseTo(
      Number(declaration.body.salesStandardVat) - Number(declaration.body.proportional.deductibleInputVat) - (declaration.body.proportional.settlement?.difference ?? 0),
      2,
    );
    // وشقّا المدخلات يستويان بمجموعها — فلا هللةَ تضيع بين المخصوم وغيره.
    expect(Number(declaration.body.proportional.deductibleInputVat) + Number(declaration.body.proportional.nonDeductibleInputVat)).toBeCloseTo(Number(declaration.body.purchasesStandardVat), 2);
  });

  it("gives company B its own separate seeded checklist and blocks it from toggling company A's items", async () => {
    const listA = await request(app.getHttpServer()).get('/obligations').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const listB = await request(app.getHttpServer()).get('/obligations').set('Authorization', `Bearer ${tokenB}`).expect(200);

    expect(listB.body).toHaveLength(9);
    const idsA = new Set(listA.body.map((o: { id: string }) => o.id));
    expect(listB.body.some((o: { id: string }) => idsA.has(o.id))).toBe(false);

    await request(app.getHttpServer()).patch(`/obligations/${listA.body[0].id}/toggle`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });
});
