import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';

/**
 * `SPEC 30.5` — **التالف: واقعةٌ تُعتمد، وقيدٌ بلا سطر ضريبة.**
 *
 * وما يُثبَت هنا أربعة، وكلٌّ منها كان يمكن أن يقع عكسه بصمت:
 *
 *   ① **السبب إلزاميّ ويُقرأ من مصدره** — والمجهول يُرَدّ باسمه لا يُصنَّف بالصمت.
 *   ② **التوريد الاعتباري يُرَدّ عند الباب** — لا عند الاعتماد بعد يومين.
 *   ③ **التسجيل لا يمسّ المخزون ولا الدفتر** — والاعتماد هو الحدث المحاسبي.
 *   ④ **القيد سطران بلا ضريبة** — وهو عكس ما تفعله أنظمة ERP الشائعة (`ق-٩٥`).
 *
 * ومعها فصلُ المهام خادمياً (`SPEC 30.7`): **من يسجّل لا يعتمد** ما لم يملك
 * `review`. (الشاشة موجة ب، فالبند يبقى ⬜ ولا يُوسَم هنا.)
 */
describe('§30.5 شطب التلف — واقعةٌ تُعتمد وقيدٌ بلا ضريبة (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let cashierToken: string;
  let companyId: string;
  let branchId: string;
  let warehouseId: string;
  let productId: string;
  let cashierId: string | undefined;
  let templateId: string | undefined;
  const UNIT_COST = 40;
  const today = () => new Date().toISOString().slice(0, 10);

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const asCashier = (r: request.Test) => r.set('Authorization', `Bearer ${cashierToken}`);

  /** الرموز **تُقرأ من مصدرها** — قائمةٌ منسوخة هنا تختبر نسختها لا النظام. */
  const NO_ADJUSTMENT = WRITEOFF_REASONS.find((r) => r.taxPath === 'NO_ADJUSTMENT')!;
  const DEEMED_SUPPLY = WRITEOFF_REASONS.find((r) => r.taxPath === 'DEEMED_SUPPLY')!;

  async function stockOf(): Promise<number> {
    const res = await auth(request(app.getHttpServer()).get('/inventory/stock-levels')).expect(200);
    const row = (res.body as { productId: string; warehouseId: string; qty: number }[]).find(
      (r) => r.productId === productId && r.warehouseId === warehouseId,
    );
    return row ? Number(row.qty) : 0;
  }

  function record(body: Record<string, unknown>) {
    return auth(request(app.getHttpServer()).post('/inventory/write-offs')).send({
      productId,
      warehouseId,
      branchId,
      qty: 2,
      reasonCode: NO_ADJUSTMENT.code,
      occurredAt: today(),
      ...body,
    });
  }

  /** أسطر القيد برموز حساباتها — **الرموز هي ما يُقاس، لا المعرّفات**. */
  async function entryLines(memo: string) {
    const entry = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findFirst({ where: { memo }, include: { lines: { include: { account: { select: { code: true } } } } } }),
    );
    return entry?.lines.map((l) => ({ code: l.account.code, debit: Number(l.debit), credit: Number(l.credit) })) ?? null;
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
    warehouseId = (await auth(request(app.getHttpServer()).post('/warehouses')).send({ name: `مستودع تلف ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع تلف ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ name: `صنف تلف ${suffix}`, price: 100, cost: UNIT_COST }).expect(201)).body.id;

    // طبقةٌ حقيقية بعشر وحدات عبر إيصال شراء — فتكلفة ما يُشطب معلومةٌ سلفاً.
    const supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورّد تلف ${suffix}` }).expect(201)).body.id;
    await auth(request(app.getHttpServer()).post('/purchases'))
      .send({ supplierId, date: today(), subtotal: 10 * UNIT_COST, warehouseId, branchId, lines: [{ description: 'صنفٌ مخزني', productId, quantity: 10, unitPrice: UNIT_COST, taxRate: 15 }] })
      .expect(201);
    expect(await stockOf()).toBe(10);

    // كاشيرٌ يسجّل ولا يعتمد: `inventory` بـ`view`+`record` وحدهما.
    const template = await auth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `كاشير تلف ${suffix}`, allowedScreens: ['inventory', 'products'], screenActions: { inventory: ['view', 'record'], products: ['view'] } })
      .expect(201);
    templateId = template.body.id;
    const cashier = await auth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'كاشير التلف', username: `wo-cashier-${suffix}`, password: 'CashierPass123!', permissionTemplateId: templateId })
      .expect(201);
    cashierId = cashier.body.id;
    const cashierLogin = await request(app.getHttpServer()).post('/auth/login').send({ username: `wo-cashier-${suffix}`, password: 'CashierPass123!' });
    cashierToken = cashierLogin.body.accessToken;
  }, 60000);

  afterAll(async () => {
    if (cashierId) await auth(request(app.getHttpServer()).delete(`/company-users/${cashierId}`));
    if (templateId) await auth(request(app.getHttpServer()).delete(`/templates/${templateId}`));
    await app.close();
  });

  it('[SPEC 30.5] السبب إلزاميّ ويُقرأ من مصدره — والرمز المجهول يُرَدّ باسمه', async () => {
    const res = await record({ reasonCode: 'NOT_A_REASON' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('NOT_A_REASON');
  });

  it('🔴 والتوريد الاعتباري يُرَدّ عند الباب — لا بعد يومين عند الاعتماد', async () => {
    const before = await stockOf();
    const res = await record({ reasonCode: DEEMED_SUPPLY.code });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(DEEMED_SUPPLY.label);
    expect(await stockOf()).toBe(before);
  });

  it('[SPEC 30.5] التسجيل لا يمسّ المخزون ولا الدفتر — والاعتماد هو الحدث، بقيدٍ بلا ضريبة', async () => {
    const before = await stockOf();
    const created = await record({ qty: 2, note: 'كسرٌ في المستودع' }).expect(201);
    const { id, no } = created.body as { id: string; no: string };
    expect(created.body.status).toBe('PENDING_REVIEW');
    expect(no).toMatch(/^WO-\d{4}-\d{4}$/);

    // ① التسجيل وحده: لا رفٌّ نقص ولا قيدٌ كُتب.
    expect(await stockOf()).toBe(before);
    expect(await entryLines(`شطب مخزون ${no}`)).toBeNull();

    // ② والاعتماد يفعل الثلاثة معاً.
    const approved = await auth(request(app.getHttpServer()).post(`/inventory/write-offs/${id}/approve`)).expect(201);
    expect(approved.body.status).toBe('APPROVED');
    expect(Number(approved.body.baseCost)).toBe(2 * UNIT_COST);
    expect(await stockOf()).toBe(before - 2);

    // حركةٌ بمصدرٍ يقول ما جرى — لا `MANUAL` تُقرأ «عدّل أحدهم رصيداً».
    const movement = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.stockMovement.findFirst({ where: { type: 'OUT', origin: 'WRITEOFF', productId, warehouseId } }),
    );
    expect(movement).not.toBeNull();
    expect(Number(movement!.qty)).toBe(2);
    expect(movement!.reason).toContain(no);

    // 🔴 ③ القيد: سطران، مدين 5800 ودائن 1300 — **ولا حساب ضريبةٍ بينهما**.
    const lines = await entryLines(`شطب مخزون ${no}`);
    expect(lines).not.toBeNull();
    expect(lines!.map((l) => l.code).sort()).toEqual(['1300', '5800']);
    expect(lines!.find((l) => l.code === '5800')).toEqual({ code: '5800', debit: 2 * UNIT_COST, credit: 0 });
    expect(lines!.find((l) => l.code === '1300')).toEqual({ code: '1300', debit: 0, credit: 2 * UNIT_COST });

    // ④ وواقعةٌ حُسمت لا تُحسم مرّتين — وإلا خرجت البضاعة مرّتين.
    const again = await auth(request(app.getHttpServer()).post(`/inventory/write-offs/${id}/approve`));
    expect(again.status).toBe(409);
    expect(await stockOf()).toBe(before - 2);
  });

  it('🔴 الكاشير يسجّل ولا يقرّر — والرفض يحمل سببه (SPEC 30.7 خادمياً)', async () => {
    const before = await stockOf();
    const created = await asCashier(request(app.getHttpServer()).post('/inventory/write-offs'))
      .send({ productId, warehouseId, branchId, qty: 1, reasonCode: NO_ADJUSTMENT.code, occurredAt: today() })
      .expect(201);
    const { id } = created.body as { id: string };

    // يملك `record` فسجّل — ولا يملك `review` فلا يعتمد.
    const forbidden = await asCashier(request(app.getHttpServer()).post(`/inventory/write-offs/${id}/approve`));
    expect(forbidden.status).toBe(403);
    expect(await stockOf()).toBe(before);

    // ورفضٌ بلا سبب لا يُقبل — فتقريرٌ يقول «رُفضت» بلا لماذا يعيد السؤال لذاكرةِ شخص.
    const noReason = await auth(request(app.getHttpServer()).post(`/inventory/write-offs/${id}/reject`)).send({});
    expect(noReason.status).toBe(400);

    const rejected = await auth(request(app.getHttpServer()).post(`/inventory/write-offs/${id}/reject`)).send({ reason: 'البضاعة سليمة بعد الفحص' }).expect(201);
    expect(rejected.body.status).toBe('REJECTED');
    expect(rejected.body.rejectionReason).toBe('البضاعة سليمة بعد الفحص');
    // والرفض لا يمسّ رفّاً ولا دفتراً.
    expect(await stockOf()).toBe(before);
    expect(rejected.body.movementId).toBeNull();
    expect(rejected.body.journalEntryId).toBeNull();
  });
});
