import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { inventoryLedgerReconciliation } from '../src/inventory/inventory-ledger-reconciliation.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة: منشأةٌ معزولة ومستودعٌ وفرعٌ ومناوبة وستّ عمليات بيع — ثلاثةُ أضعاف ما يلزم عادةً.
jest.setTimeout(300000);

/**
 * `ق-١٤٦٩` — **الدعوى «هـ»: استهلاكٌ مؤقّتٌ بتكلفة صفر** (التوجيه ٢٦٦ §٤هـ — «يُعلَن ولا يمرّ صامتاً»).
 *
 * صنفٌ بلا تكلفة (البطاقةُ صفر) يخرج بلا طبقة ⟸ مؤقّتٌ بتكلفة صفر ⟸ **لا قيدَ تكلفة** (الترحيلُ يتخطّى الصفر). وكان
 * الإعلانُ الوحيد صفّاً بـ`unitCost: 0` في تقريرٍ لا تقرؤه شاشة: الكاشيرُ يُسقط المؤقّتَ كلَّه، والفاتورةُ تُعلن كمّيتَه
 * لا صفريّتَه، والمطابقةُ ترى القيمةَ لا العدد. **والآن يُعلَن في كلّ ردٍّ لكلّ صنفٍ بمصدر تكلفته، ويُعدّ في المطابقة.**
 */
describe('المؤقّتُ بتكلفة صفر يُعلَن ولا يمرّ صامتاً (ق-١٤٦٩)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let co: IsolatedCompany;
  let whA: string;
  let branchId: string;
  let customerId: string;
  const suffix = `${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const product = async (name: string, cost?: number) =>
    (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `${name} ${suffix}`, price: 100, ...(cost !== undefined ? { cost } : {}) }).expect(201)).body.id as string;
  const move = (body: Record<string, unknown>) => auth(http().post('/inventory/movements')).send({ date: today, reason: 'اختبار — المؤقّتُ الصفريّ', ...body });
  const sell = (lines: { productId: string; quantity: number }[]) =>
    auth(http().post('/invoices')).send({
      customerId,
      branchId,
      issueDate: today,
      dueDate: today,
      lines: lines.map((l) => ({ description: `بيع ${suffix}`, productId: l.productId, quantity: l.quantity, unitPrice: 150, taxRate: 15 })),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    co = await registerIsolatedCompany(app, 'zero-cost');
    whA = (await auth(http().post('/warehouses')).send({ name: `مستودع ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع ${suffix}`, warehouseId: whA }).expect(201)).body.id;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('① إخراجٌ يدويّ ثم بيعٌ لصنفٍ بلا تكلفة — الردّان يعلنان الصفرَ بمصدره «NONE»، والتقريرُ يعلّمه، والمطابقةُ تعدّه', async () => {
    const p = await product('صنفٌ بلا تكلفة');
    const out = await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 2 }).expect(201);
    expect(out.body.provisional).toEqual({ provisionalQty: 2, zeroCostQty: 2, costSource: 'NONE' });

    const sale = await sell([{ productId: p, quantity: 3 }]).expect(201);
    expect(sale.body.stockFulfilment.totalCost).toBe('0.00');
    expect(sale.body.stockFulfilment.provisionalQty).toBe('3.000');
    expect(sale.body.stockFulfilment.zeroCostProvisional).toEqual([{ productId: p, qty: '3.000', costSource: 'NONE' }]);

    const rows = (await auth(http().get('/inventory/provisional')).expect(200)).body as { productId: string; zeroCost: boolean; unitCost: number }[];
    const mine = rows.filter((r) => r.productId === p);
    expect(mine.length).toBe(2);
    expect(mine.every((r) => r.zeroCost === true && r.unitCost === 0)).toBe(true);

    const rec = await tenantPrisma.runInTenantContext(co.companyId, (tx) => inventoryLedgerReconciliation(tx));
    expect(rec.openProvisionalZeroCost.count).toBeGreaterThanOrEqual(2);
    expect(rec.openProvisionalZeroCost.qty).toBeGreaterThanOrEqual(5);
  });

  it('② فاتورةٌ مختلطة — مجموعُها غيرُ صفر، والصفريُّ يُعلَن لصنفه وحدَه', async () => {
    const costed = await product('صنفٌ بطبقة');
    await move({ productId: costed, warehouseId: whA, type: 'IN', qty: 5, unitCost: 50 }).expect(201);
    const bare = await product('صنفٌ عارٍ');
    await move({ productId: bare, warehouseId: whA, type: 'OUT', qty: 1 }).expect(201); // يصير متعقَّباً
    const sale = await sell([{ productId: costed, quantity: 2 }, { productId: bare, quantity: 1 }]).expect(201);
    expect(sale.body.stockFulfilment.totalCost).toBe('100.00');
    expect(sale.body.stockFulfilment.zeroCostProvisional).toEqual([{ productId: bare, qty: '1.000', costSource: 'NONE' }]);
  });

  it('③ الضابط: مؤقّتٌ بتكلفةٍ معروفة لا يُعلَن صفرياً — وبيعٌ مغطّى كلُّه لا مؤقّتَ فيه', async () => {
    const p = await product('صنفٌ بتكلفة');
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 1, unitCost: 30 }).expect(201);
    const over = await sell([{ productId: p, quantity: 3 }]).expect(201);
    expect(over.body.stockFulfilment.provisionalQty).toBe('2.000');
    expect(over.body.stockFulfilment.zeroCostProvisional).toEqual([]);

    const q = await product('صنفٌ مغطّى');
    await move({ productId: q, warehouseId: whA, type: 'IN', qty: 5, unitCost: 10 }).expect(201);
    const covered = await sell([{ productId: q, quantity: 2 }]).expect(201);
    expect(covered.body.stockFulfilment.provisionalQty).toBe('0.000');
    expect(covered.body.stockFulfilment.zeroCostProvisional).toEqual([]);
  });

  it('④ البطاقةُ بقيمةٍ بلا طبقة — مؤقّتٌ بمصدر «PRODUCT_CARD» لا صفريّ', async () => {
    const p = await product('صنفٌ ببطاقة', 7);
    const out = await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 1 }).expect(201);
    expect(out.body.provisional).toEqual({ provisionalQty: 1, zeroCostQty: 0, costSource: 'PRODUCT_CARD' });
  });

  it('⑤ الكاشير: كان يُسقط المؤقّتَ كلَّه — والآن يعلن الكمّيةَ والصفريَّ بمصدره', async () => {
    const p = await product('صنفُ الكاشير');
    await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 1 }).expect(201); // متعقَّبٌ بلا طبقة
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201);
    const res = await auth(http().post('/pos/sales')).send({ lines: [{ productId: p, quantity: 1 }], paymentMethod: 'CASH' }).expect(201);
    expect(res.body.stockDeduction).toMatchObject({ deducted: true, warehouseId: whA, provisionalQty: '1.000' });
    expect(res.body.stockDeduction.zeroCostProvisional).toEqual([{ productId: p, qty: '1.000', costSource: 'NONE' }]);
  });
});
