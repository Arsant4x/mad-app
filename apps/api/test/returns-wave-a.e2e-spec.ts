import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { KSA_UTC_OFFSET_MIN, localDateOf } from '../src/common/wall-clock.util';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (38.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(120000);

/**
 * §30 المرتجعات — **موجة أ (الخلفية)**، قرار المالك 2026-09-03:
 *
 *   30.4 السليمة تعود إلى المخزون **إلى طبقتها الأصلية** وتُعكس تكلفتها بقيدٍ مستقل
 *   30.3 الإرجاع الجزئي، ولا إرجاعٌ يتجاوز المبيع عبر إشعاراتٍ متتابعة
 *   30.2 سطرُ المرتجع يشير إلى سطرٍ من الفاتورة الأصلية نفسها
 *   30.8 سندُ ردٍّ مستقل — **والخصم من الفاتورة غير المسدَّدة إلزاميّ** قبل أي ردٍّ نقدي
 *   30.9 التقرير: كم أُرجع · كم عاد إلى الرفّ وبأي تكلفة · كم رُدّ · ومن سجّله
 *
 * التالف (30.5) **خارج هذه الموجة** بأمر المالك حتى يعود بحث ضريبة القيمة المضافة — هنا يُثبَت
 * فقط أن سطراً بحالة `DAMAGED` **لا يمسّ المخزون** ويبقى مسجَّلاً بحالته.
 */
describe('§30 المرتجعات — موجة أ (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  let branchId: string;
  let warehouseId: string;
  let productId: string;
  const UNIT_COST = 40;
  const created: string[] = [];
  const today = () => new Date().toISOString().slice(0, 10);
  // Credit notes sent without a date are issued on the company's day (UTC+3), ahead of the UTC day late in the evening.
  const companyDay = () => localDateOf(new Date(), KSA_UTC_OFFSET_MIN);

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function stockOf(): Promise<number> {
    const res = await auth(request(app.getHttpServer()).get('/inventory/stock-levels')).expect(200);
    const row = (res.body as { productId: string; warehouseId: string; qty: number }[]).find((r) => r.productId === productId && r.warehouseId === warehouseId);
    return row ? Number(row.qty) : 0;
  }

  async function makeInvoice(quantity: number) {
    const res = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'صنفٌ مخزني', productId, quantity, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    created.push(res.body.id);
    return res.body as { id: string; no: string; total: string; lines: { id: string; productId: string; quantity: string }[] };
  }

  function creditNote(invoiceId: string, body: Record<string, unknown> = { reason: 'إرجاع بضاعة' }) {
    return auth(request(app.getHttpServer()).post(`/invoices/${invoiceId}/credit-note`)).send(body);
  }

  async function entryDebit(memo: string): Promise<number | null> {
    const entry = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.journalEntry.findFirst({ where: { memo }, include: { lines: true } }));
    return entry ? entry.lines.reduce((s, l) => s + Number(l.debit), 0) : null;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;

    const suffix = Date.now();
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل مرتجعات ${suffix}` }).expect(201)).body.id;
    warehouseId = (await auth(request(app.getHttpServer()).post('/warehouses')).send({ name: `مستودع مرتجعات ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع مرتجعات ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف مرتجعات ${suffix}`, price: 100, cost: UNIT_COST }).expect(201)).body.id;
    // طبقةٌ حقيقية واحدة بعشر وحدات عبر إيصال شراء (حركة IN اليدوية لا تصنع طبقة) —
    // فتكلفة كل وحدةٍ تخرج وتعود معلومة، و«العودة إلى الطبقة الأصلية» قابلةٌ للإثبات.
    const supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورّد مرتجعات ${suffix}` }).expect(201)).body.id;
    await auth(request(app.getHttpServer()).post('/purchases'))
      .send({ supplierId, date: today(), subtotal: 10 * UNIT_COST, warehouseId, branchId, lines: [{ description: 'صنفٌ مخزني', productId, quantity: 10, unitPrice: UNIT_COST, taxRate: 15 }] })
      .expect(201);
    expect(await stockOf()).toBe(10);
  }, 30000);

  afterAll(async () => {
    // الإشعارات قبل فواتيرها (Restrict)، والأحدث أولاً.
    for (const id of [...created].reverse()) await auth(request(app.getHttpServer()).delete(`/invoices/${id}`));
    await app.close();
  });

  it('[SPEC 30.4] إشعارٌ دائن كامل يعيد البضاعة السليمة إلى الرفّ ويعكس تكلفتها بقيدٍ مستقل', async () => {
    const before = await stockOf();
    const invoice = await makeInvoice(3);
    expect(await stockOf()).toBe(before - 3);
    const cogs = await entryDebit(`تكلفة مبيعات ${invoice.no}`);
    expect(cogs).toBe(3 * UNIT_COST);

    const note = await creditNote(invoice.id).expect(201);
    created.push(note.body.id);

    // عاد إلى الرفّ — بحركة IN بمصدر SALE تحمل سطر الإشعار (المُشغِّل يرفض غيرها)
    expect(await stockOf()).toBe(before);
    const movement = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.stockMovement.findFirst({ where: { type: 'IN', origin: 'SALE', invoiceLine: { invoiceId: note.body.id } } }),
    );
    expect(movement).not.toBeNull();
    expect(Number(movement!.qty)).toBe(3);
    expect(movement!.reason).toBe(`مرتجع ${note.body.no}`);

    // إلى طبقتها الأصلية: الطبقة الوحيدة تعود إلى ١٠ بلا طبقةٍ جديدة
    const layers = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryLayer.findMany({ where: { productId, warehouseId } }));
    expect(layers).toHaveLength(1);
    expect(Number(layers[0].qtyRemaining)).toBe(before);

    // وقيدُ عكس التكلفة بمقدار ما عاد — مستقلٌّ عن قيد الإشعار
    expect(await entryDebit(`عكس تكلفة مبيعات — مرتجع ${note.body.no}`)).toBe(3 * UNIT_COST);
    // وسطر الإشعار يحمل رابط أصله وحالته
    const noteLines = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoiceLine.findMany({ where: { invoiceId: note.body.id } }));
    expect(noteLines[0].returnsLineId).toBe(invoice.lines[0].id);
    expect(noteLines[0].returnCondition).toBe('GOOD');
  });

  it('[SPEC 30.3] إرجاعٌ جزئي يعيد جزءه — ولا يُرجَع عبر إشعاراتٍ متتابعة أكثر ممّا بِيع', async () => {
    const before = await stockOf();
    const invoice = await makeInvoice(3);
    const line = invoice.lines[0];
    const partial = { description: 'صنفٌ مخزني', productId, quantity: 1, unitPrice: 100, taxRate: 15, returnsLineId: line.id, returnCondition: 'GOOD' };

    const first = await creditNote(invoice.id, { reason: 'إرجاع وحدة', lines: [partial] }).expect(201);
    created.push(first.body.id);
    expect(await stockOf()).toBe(before - 3 + 1);
    expect(await entryDebit(`عكس تكلفة مبيعات — مرتجع ${first.body.no}`)).toBe(UNIT_COST);

    // بقي اثنان مبيعان — إرجاعُ ثلاثة يُرفض مسمّىً
    const over = await creditNote(invoice.id, { reason: 'إرجاع زائد', lines: [{ ...partial, quantity: 3 }] });
    expect(over.status).toBe(400);
    expect(await stockOf()).toBe(before - 2);

    // واثنان يمرّان — فيعود الرفّ كما كان
    const rest = await creditNote(invoice.id, { reason: 'إرجاع الباقي', lines: [{ ...partial, quantity: 2 }] }).expect(201);
    created.push(rest.body.id);
    expect(await stockOf()).toBe(before);
  });

  it('[SPEC 30.2] سطرُ المرتجع يشير إلى سطرٍ من الفاتورة الأصلية نفسها — لا من فاتورةٍ أخرى', async () => {
    const a = await makeInvoice(1);
    const b = await makeInvoice(1);
    const foreign = await creditNote(a.id, {
      reason: 'سطرٌ من فاتورةٍ أخرى',
      lines: [{ description: 'صنفٌ مخزني', productId, quantity: 1, unitPrice: 100, taxRate: 15, returnsLineId: b.lines[0].id, returnCondition: 'GOOD' }],
    });
    expect(foreign.status).toBe(400);
  });

  it('سطرٌ بحالة DAMAGED يُسجَّل بحالته ولا يمسّ المخزون — معالجته معلَّقةٌ على بحث الضريبة', async () => {
    const before = await stockOf();
    const invoice = await makeInvoice(1);
    const note = await creditNote(invoice.id, {
      reason: 'تالف',
      lines: [{ description: 'صنفٌ مخزني', productId, quantity: 1, unitPrice: 100, taxRate: 15, returnsLineId: invoice.lines[0].id, returnCondition: 'DAMAGED' }],
    }).expect(201);
    created.push(note.body.id);
    expect(await stockOf()).toBe(before - 1); // لم يعد إلى الرفّ
    expect(await entryDebit(`عكس تكلفة مبيعات — مرتجع ${note.body.no}`)).toBeNull();
    const lines = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoiceLine.findMany({ where: { invoiceId: note.body.id } }));
    expect(lines[0].returnCondition).toBe('DAMAGED');
  });

  it('[SPEC 30.8] لا ردٌّ نقدي على إشعارٍ لفاتورةٍ غير مسدَّدة — الخصم منها إلزاميّ', async () => {
    const invoice = await makeInvoice(1);
    const note = await creditNote(invoice.id).expect(201);
    created.push(note.body.id);
    const refund = await auth(request(app.getHttpServer()).post('/payments/refund')).send({ creditNoteId: note.body.id, date: today(), method: 'CASH' });
    expect(refund.status).toBe(400);
  });

  it('[SPEC 30.8] الفاتورة المسدَّدة: سندُ ردٍّ مستقل مربوطٌ بالإشعار، بمبلغٍ سالب ورقمٍ RFD — ومرةً واحدة', async () => {
    const invoice = await makeInvoice(1);
    const total = Number(invoice.total);
    // تسديدٌ كامل بسند قبض
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, date: today(), amount: total, method: 'CASH', allocations: [{ invoiceId: invoice.id, amount: total }] })
      .expect(201);
    const note = await creditNote(invoice.id).expect(201);
    created.push(note.body.id);

    const refund = await auth(request(app.getHttpServer()).post('/payments/refund')).send({ creditNoteId: note.body.id, date: today(), method: 'CASH', notes: 'ردّ نقدي للعميل' }).expect(201);
    expect(refund.body.kind).toBe('REFUND');
    expect(refund.body.refundsInvoiceId).toBe(note.body.id);
    expect(refund.body.no).toMatch(/^RFD-\d{4}-\d{4}$/);
    expect(Number(refund.body.amount)).toBe(-total);
    // القيد: ردٌّ مسمّى، نقدٌ خارج (دائن 1000) وذمّةٌ تعود (مدين 1200)
    const entry = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findFirst({ where: { memo: { startsWith: `ردّ مرتجع — سند ${refund.body.no}` } }, include: { lines: { include: { account: true } } } }),
    );
    expect(entry).not.toBeNull();
    const cash = entry!.lines.find((l) => l.account.code === '1000');
    const ar = entry!.lines.find((l) => l.account.code === '1200');
    expect(Number(cash!.credit)).toBe(total);
    expect(Number(ar!.debit)).toBe(total);

    // ولا يُردّ مرتين
    const again = await auth(request(app.getHttpServer()).post('/payments/refund')).send({ creditNoteId: note.body.id, date: today(), method: 'CASH' });
    expect(again.status).toBe(400);
  });

  it('[SPEC 30.9] تقرير المرتجعات: كم أُرجع · كم عاد إلى الرفّ وبأي تكلفة · كم رُدّ · ومن سجّله', async () => {
    const res = await auth(request(app.getHttpServer()).get('/reports/returns')).query({ from: companyDay(), to: companyDay(), branchId }).expect(200);
    // ② الكمّياتُ نصٌّ بثلاث خانات والمبالغُ بخانتين (`ق-١٢٣٥`) — تُقارَن حرفاً، والمجموعُ يُقرأ رقماً.
    const rows = res.body.rows as { no: string; restockedQty: string; restockedCost: string; refunded: string; recordedBy: string | null; damagedLines: number }[];
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const full = rows.find((r) => r.restockedQty === '3.000');
    expect(full).toBeDefined();
    expect(full!.restockedCost).toBe((3 * UNIT_COST).toFixed(2));
    expect(full!.recordedBy).toBe('demo-company-a');
    expect(rows.some((r) => Number(r.refunded) > 0)).toBe(true);
    expect(rows.some((r) => r.damagedLines === 1 && r.restockedQty === '0.000')).toBe(true);
    expect(res.body.totals.restockedQty).toBe(rows.reduce((s, r) => s + Number(r.restockedQty), 0).toFixed(3));
  });
});
