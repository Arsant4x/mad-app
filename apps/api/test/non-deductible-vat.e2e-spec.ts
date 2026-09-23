import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { round2 } from '../src/common/money/rounding';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { inventoryLedgerReconciliation } from '../src/inventory/inventory-ledger-reconciliation.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (150.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(453000);

/**
 * ⚖️ `ق-١٣٣٠` · `ق-١٣٤٢` — **غيرُ القابل للخصم من ضريبة المدخلات يدخل تكلفةَ ما اشتُري.**
 *
 * بنصّ المالك: «وهو حكمُ المعايير نصّاً: الضرائبُ غيرُ المستردّة جزءٌ من تكلفة الشراء» — و«يرث قاعدةَ الانتشار
 * القائمة بعينها، ولا منطقَ جديد. ما على الرفّ يرفع تكلفةَ الطبقة، وما استُهلك إلى تكلفة المبيعات في فترة الحدث».
 *
 * **منشأةٌ معزولة، ولكلِّ مسارٍ صنفُه** — والحسابُ يُقرأ فرقاً قبل الخطوة وبعدها، **وحارسا المطابقة بعد كلِّ خطوة**:
 * `1300` ⇄ الطبقات (`ق-١٣٤٣`) · والوسيطُ ⇄ المستندات (`٢٥`). الشاهدُ الموجب أوّلاً: شراءٌ خاضعٌ وحدَه تبقى ضريبتُه في `1250`.
 * ⛔ **والمشتركُ (`MIXED`) لا يُرحَّل** — محبوسٌ على قرارٍ لم يُحسم، ويُثبَت ذلك هنا لا يُفترض.
 */
describe('⚖️ غيرُ القابل للخصم يدخل تكلفةَ ما اشتُري (e2e · ق-١٣٤٢)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  const today = () => new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const get = (path: string) => auth(http().get(path));
  const post = (path: string) => auth(http().post(path));
  const patch = (path: string) => auth(http().patch(path));
  const del = (path: string) => auth(http().delete(path));

  let supplierId = '';
  let customerId = '';
  let warehouseId = '';
  let branchId = '';
  const suffix = `${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'non-deductible');
    supplierId = (await post('/suppliers').send({ name: `مورّد غير القابل ${suffix}` }).expect(201)).body.id;
    customerId = (await post('/customers').send({ kind: 'NATURAL', name: `عميل غير القابل ${suffix}` }).expect(201)).body.id;
    warehouseId = (await post('/warehouses').send({ name: `مستودع غير القابل ${suffix}` }).expect(201)).body.id;
    branchId = (await post('/branches').send({ name: `فرع غير القابل ${suffix}`, warehouseId }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  const product = async (name: string) =>
    (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `${name} ${suffix}`, price: 150, cost: 40 }).expect(201)).body.id as string;

  const ledger = async (): Promise<Record<string, number>> => {
    const res = await get('/accounts').expect(200);
    return Object.fromEntries((res.body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
  };
  /** يقرأ الدفترَ قبل الخطوة وبعدها ويعيد فرقَ كلِّ حساب. */
  const deltaOf = async (fn: () => Promise<unknown>) => {
    const before = await ledger();
    await fn();
    const after = await ledger();
    return (code: string) => round2((after[code] ?? 0) - (before[code] ?? 0));
  };
  const clearing = async () => (await get('/purchases/receipts/reconciliation').expect(200)).body;
  const balanced = async (step: string) => {
    const r = await tenantPrisma.runInTenantContext(company.companyId, (tx) => inventoryLedgerReconciliation(tx));
    const c = await clearing();
    expect({ step, shelf: r.difference, clearing: c.difference }).toEqual({ step, shelf: 0, clearing: 0 });
    return c;
  };
  const layerOf = (pid: string) =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx) =>
      (await tx.inventoryLayer.findMany({ where: { productId: pid }, orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }] })).map((l) => ({
        remaining: Number(l.qtyRemaining),
        unitCost: Number(l.unitCost),
      })),
    );
  const eventsOf = (purchaseId: string) =>
    tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.nonDeductibleVatEvent.findMany({ where: { purchaseId }, include: { lines: true }, orderBy: { createdAt: 'asc' } }),
    );

  const stocked = (pid: string, quantity: number, unitPrice: number) => ({ description: 'صنف', productId: pid, quantity, unitPrice, taxRate: 15 });
  const service = (amount: number) => ({ description: 'خدمة', quantity: 1, unitPrice: amount, taxRate: 15 });
  const buy = (lines: { quantity: number; unitPrice: number }[], inputVatUse: string, extra: Record<string, unknown> = {}) =>
    post('/purchases')
      .send({
        supplierId,
        date: today(),
        subtotal: round2(lines.reduce((t, l) => t + l.quantity * l.unitPrice, 0)),
        warehouseId,
        branchId,
        category: 'مصروفات أخرى',
        inputVatUse,
        lines,
        ...extra,
      })
      .expect(201);
  const sell = (pid: string, quantity: number) =>
    post('/invoices')
      .send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'بيع', productId: pid, quantity, unitPrice: 150, taxRate: 15 }] })
      .expect(201);

  it('⓪ الشاهدُ الموجب: شراءٌ خاضعٌ وحدَه — ضريبتُه في 1250 كما هي، ولا حدث', async () => {
    let id = '';
    const d = await deltaOf(async () => {
      id = (await buy([service(1000)], 'TAXABLE_ONLY')).body.id;
    });
    expect({ vat1250: d('1250'), expense5400: d('5400') }).toEqual({ vat1250: 150, expense5400: 1000 });
    expect(await eventsOf(id)).toHaveLength(0);
    await balanced('taxable-only');
  });

  it('① بندٌ خدميّ منسوبٌ إلى المعفى — ضريبتُه إلى حساب المصروف نفسِه عند الشراء، و1250 لا يتحرّك', async () => {
    let id = '';
    const d = await deltaOf(async () => {
      id = (await buy([service(1000)], 'EXEMPT_ONLY')).body.id;
    });
    expect({ vat1250: d('1250'), expense5400: d('5400') }).toEqual({ vat1250: 0, expense5400: 1150 });
    const [event] = await eventsOf(id);
    expect({ trigger: event.trigger, expense: Number(event.baseExpense), amount: Number(event.baseAmount) }).toEqual({ trigger: 'PURCHASE', expense: 150, amount: 150 });
    await balanced('exempt-only-service');
  });

  it('② بندٌ مخزنيّ باستلامٍ ضمنيّ — الطبقةُ تولد بتكلفتها مع الضريبة (46 لا 40)، والبيعُ بعدها تكلفتُه 46', async () => {
    const p = await product('مخزنيّ معفى');
    const d = await deltaOf(async () => {
      await buy([stocked(p, 10, 40)], 'EXEMPT_ONLY');
    });
    expect({ vat1250: d('1250'), inventory1300: d('1300') }).toEqual({ vat1250: 0, inventory1300: 460 });
    expect(await layerOf(p)).toEqual([{ remaining: 10, unitCost: 46 }]);
    await balanced('exempt-only-stocked');
    const s = await deltaOf(async () => {
      await sell(p, 4);
    });
    expect(s('5100')).toBe(184);
    await balanced('sale-after');
  });

  it('③ مستندٌ يجمع المخزنيَّ والخدميّ — الضريبةُ تُوزَّع على البنود بصافيها (60 للطبقة · 15 للمصروف)', async () => {
    const p = await product('مختلط معفى');
    const d = await deltaOf(async () => {
      await buy([stocked(p, 10, 40), service(100)], 'EXEMPT_ONLY');
    });
    expect({ vat1250: d('1250'), inventory1300: d('1300'), expense5400: d('5400') }).toEqual({ vat1250: 0, inventory1300: 460, expense5400: 115 });
    expect(await layerOf(p)).toEqual([{ remaining: 10, unitCost: 46 }]);
    await balanced('exempt-only-mixed-lines');
  });

  it('④ مفوتَرٌ لم يُستلم — حصّتُه تنتظر في الوسيط، وتنتقل إلى طبقتها مع كلِّ استلام، وتعود إليه بعكسه', async () => {
    const p = await product('ينتظر الاستلام');
    let purchase: { id: string; lines: { id: string }[] } = { id: '', lines: [] };
    const d = await deltaOf(async () => {
      purchase = (await buy([stocked(p, 10, 40)], 'EXEMPT_ONLY', { receiveNow: false })).body;
    });
    expect({ vat1250: d('1250'), inventory1300: d('1300') }).toEqual({ vat1250: 0, inventory1300: 0 });
    expect((await balanced('invoiced-not-received')).nonDeductiblePending).toBe(60);

    await post(`/purchases/${purchase.id}/receipts`).send({ receivedAt: today(), warehouseId, lines: [{ purchaseLineId: purchase.lines[0].id, quantity: 4 }] }).expect(201);
    expect(await layerOf(p)).toEqual([{ remaining: 4, unitCost: 46 }]);
    expect((await balanced('received-4')).nonDeductiblePending).toBe(36);

    const second = (await post(`/purchases/${purchase.id}/receipts`).send({ receivedAt: today(), warehouseId, lines: [{ purchaseLineId: purchase.lines[0].id, quantity: 6 }] }).expect(201)).body.id;
    expect((await layerOf(p)).map((l) => l.unitCost)).toEqual([46, 46]);
    expect((await balanced('received-all')).nonDeductiblePending).toBe(0);

    await del(`/purchases/${purchase.id}/receipts/${second}`).expect(204);
    expect((await balanced('receipt-voided')).nonDeductiblePending).toBe(36);
  });

  it('⑤ 🔴 طبقةٌ استُهلك بعضُها ثم تغيّر الإسناد — ما على الرفّ يرفع تكلفتَها، وما استُهلك إلى 5100 في فترة الحدث؛ والعكسُ مرآة', async () => {
    const p = await product('استُهلك بعضُه');
    const purchase = (await buy([stocked(p, 10, 40)], 'MIXED')).body;
    await sell(p, 4);
    const toExempt = await deltaOf(async () => {
      await patch(`/purchases/${purchase.id}`).send({ inputVatUse: 'EXEMPT_ONLY' }).expect(200);
    });
    expect({ vat1250: toExempt('1250'), inventory1300: toExempt('1300'), cogs5100: toExempt('5100') }).toEqual({ vat1250: -60, inventory1300: 36, cogs5100: 24 });
    expect(await layerOf(p)).toEqual([{ remaining: 6, unitCost: 46 }]);
    const [event] = await eventsOf(purchase.id);
    expect({ trigger: event.trigger, line: { inv: Number(event.lines[0].baseInventory), cogs: Number(event.lines[0].baseCogs) } }).toEqual({ trigger: 'PURCHASE_EDIT', line: { inv: 36, cogs: 24 } });
    await balanced('reclassified-after-consumption');

    const back = await deltaOf(async () => {
      await patch(`/purchases/${purchase.id}`).send({ inputVatUse: 'TAXABLE_ONLY' }).expect(200);
    });
    expect({ vat1250: back('1250'), inventory1300: back('1300'), cogs5100: back('5100') }).toEqual({ vat1250: 60, inventory1300: -36, cogs5100: -24 });
    expect(await layerOf(p)).toEqual([{ remaining: 6, unitCost: 40 }]);
    await balanced('reclassified-back');
  });

  it('⑥ إشعارُ سعرٍ دائن على طبقةٍ استُهلك بعضُها — ضريبتُه تتبع صافيه بالقاعدة نفسِها، و1250 صافيه صفر', async () => {
    const p = await product('إشعار سعر');
    const purchase = (await buy([stocked(p, 10, 40)], 'EXEMPT_ONLY')).body;
    await sell(p, 4);
    const d = await deltaOf(async () => {
      await post(`/purchases/${purchase.id}/supplier-credit-note`)
        .send({ reason: 'تخفيض ريالين', lines: [{ description: 'تخفيض سعر', quantity: 10, unitPrice: 2, returnsPurchaseLineId: purchase.lines[0].id }] })
        .expect(201);
    });
    // الصافي 20: الرفُّ (6) −12 · المستهلَك (4) −8 — وضريبتُه 3: الرفُّ −1.8 · المستهلَك −1.2.
    expect({ vat1250: d('1250'), inventory1300: d('1300'), cogs5100: d('5100') }).toEqual({ vat1250: 0, inventory1300: -13.8, cogs5100: -9.2 });
    expect(await layerOf(p)).toEqual([{ remaining: 6, unitCost: 43.7 }]);
    await balanced('price-note');
  });

  it('⑦ إعادةُ بضاعةٍ إلى المورّد — تخرج بتكلفتها مع حصّتها، وضريبةُ الإشعار تقابل ذلك على 5100 فصافيهما صفر', async () => {
    const p = await product('إعادة للمورّد');
    const purchase = (await buy([stocked(p, 10, 40)], 'EXEMPT_ONLY')).body;
    const d = await deltaOf(async () => {
      await post(`/purchases/${purchase.id}/supplier-credit-note`)
        .send({ reason: 'إعادة وحدتين', lines: [{ description: 'مُعاد', productId: p, quantity: 2, unitPrice: 40, returnsPurchaseLineId: purchase.lines[0].id, goodsReturned: true }] })
        .expect(201);
    });
    expect({ vat1250: d('1250'), cogs5100: d('5100'), inventory1300: d('1300') }).toEqual({ vat1250: 0, cogs5100: 0, inventory1300: -92 });
    expect(await layerOf(p)).toEqual([{ remaining: 8, unitCost: 46 }]);
    await balanced('goods-return-note');
  });

  it('⑧ إلغاءُ شراءٍ منسوبٍ إلى المعفى — كلُّ حصّةٍ تعود، والطبقةُ تخرج بتكلفتها كما استُلمت', async () => {
    const p = await product('يُلغى');
    let id = '';
    const d = await deltaOf(async () => {
      id = (await buy([stocked(p, 5, 40), service(100)], 'EXEMPT_ONLY')).body.id;
      await del(`/purchases/${id}`).expect(204);
    });
    expect({ vat1250: d('1250'), inventory1300: d('1300'), expense5400: d('5400') }).toEqual({ vat1250: 0, inventory1300: 0, expense5400: 0 });
    expect((await eventsOf(id)).map((e) => e.trigger)).toEqual(['PURCHASE', 'RECEIPT_VOID', 'PURCHASE_VOID']);
    await balanced('voided');
  });

  it('⑨ تعديلُ البنود — حصّةُ القديم تعود وحصّةُ الجديد توضع (8 × 50 ⟸ 57.50)', async () => {
    const p = await product('يُعدَّل');
    const purchase = (await buy([stocked(p, 10, 40)], 'EXEMPT_ONLY')).body;
    await patch(`/purchases/${purchase.id}`).send({ subtotal: 400, lines: [stocked(p, 8, 50)] }).expect(200);
    const live = (await layerOf(p)).filter((l) => l.remaining > 0);
    expect(live).toEqual([{ remaining: 8, unitCost: 57.5 }]);
    await balanced('lines-edited');
  });

  it('⑩ ⛔ المشتركُ (MIXED) لا يُرحَّل — محبوسٌ على قرارٍ لم يُحسم: ضريبتُه في 1250 ولا حدث', async () => {
    let id = '';
    const d = await deltaOf(async () => {
      id = (await buy([service(200)], 'MIXED')).body.id;
    });
    expect(d('1250')).toBe(30);
    expect(await eventsOf(id)).toHaveLength(0);
  });

  it('⑪ ما سبق البناء لا يُحوَّل — مستندٌ غيرُ متتبَّع يبقى في 1250 ولو صار منسوباً إلى المعفى، ويعدّه الإقرار', async () => {
    const id = (await buy([service(200)], 'MIXED')).body.id;
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.purchase.update({ where: { id }, data: { nonDeductibleTracked: false } }));
    const d = await deltaOf(async () => {
      await patch(`/purchases/${id}`).send({ inputVatUse: 'EXEMPT_ONLY' }).expect(200);
    });
    expect(d('1250')).toBe(0);
    expect(await eventsOf(id)).toHaveLength(0);

    // الإقرارُ يعلن الباقي في 1250 بقسمَيه — والمتتبَّعُ المرحَّل (①–⑨) لا يدخله.
    const now = new Date();
    const declaration = (await get('/obligations/vat-declaration').query({ year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 }).expect(200)).body;
    const limit = (declaration.limits as { code: string; message: string }[]).find((l) => l.code === 'NON_DEDUCTIBLE_INPUT_VAT_NOT_POSTED');
    // المجموعُ نفسُه ٣٠ لا أكثر: المرحَّلُ (①–⑨) لا يدخله — والتوكيدُ على الرقم في موضعه لا على وروده في أيّ مكان.
    expect(limit?.message).toContain('في هذه الفترة 30.00 —');
    expect(limit?.message).toContain('المشتركُ غيرُ المخصوم 0.00');
    expect(limit?.message).toContain('سبقت ترحيلَه 30.00');
  });
});
