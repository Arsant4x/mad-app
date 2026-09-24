import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { inventoryLedgerReconciliation } from '../src/inventory/inventory-ledger-reconciliation.util';
import { inventoryDistributionCheck } from '../src/inventory/inventory-distribution.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ معزولة وفاتورتا بيعٍ وشراءٌ مخزنيّ وسبعُ مراحل تقرأ الدفترَ والطبقة.
jest.setTimeout(180000);

/**
 * ⚖️ **`ق-١٣٦٠` — «إقفالُ الإقرار» حدثٌ مستقلٌّ بتاريخه** (الخيارُ (ب) بحكم المالك).
 *
 * بنصّ المالك: «حدثٌ مستقلٌّ «إقفالُ الإقرار» بتاريخ الحدث نفسِه في أوّل فترةٍ مفتوحة. ⇒ فتغيّرُ التقدير يُثبَت في فترته لا بأثرٍ
 * رجعيّ، ولا يُعلَّق على علَمٍ يرفعه التاجرُ بيده. ⚠️ ولا يُرفع إلا بحدثٍ عاكسٍ بتاريخه، والتسويةُ السنويةُ حدثٌ مثلُه.»
 *
 * **المنشأةُ مختلطةٌ بالبناء في الربع الرابع من 2025**: بيعٌ خاضعٌ `600` ومعفىً `400` ⟸ نسبةُ السنة الفعلية `0.6` · والمعلَنةُ `0.5` ·
 * وشراءٌ مشتركٌ مخزنيٌّ عشرُ وحداتٍ بعشرة (ضريبتُه `15`). ⟸ غيرُ القابل للخصم **بالمعلَنة** `7.5` **وبالفعلية** `6` — أرقامٌ تُحسب يداً.
 */
describe('⚖️ ق-١٣٦٠ — «إقفالُ الإقرار» حدثٌ مستقلٌّ بتاريخه، والتسويةُ السنويةُ حدثٌ مثلُه (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const Q4 = { year: 2025, quarter: 4 };
  let productId = '';
  let warehouseId = '';
  let customerId = '';
  let branchId = '';
  let closingId = '';

  const ledger = async (): Promise<Record<string, number>> =>
    Object.fromEntries(((await auth(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
  const deltaOf = async (fn: () => Promise<void>) => {
    const before = await ledger();
    await fn();
    const after = await ledger();
    return (code: string) => Number(((after[code] ?? 0) - (before[code] ?? 0)).toFixed(2));
  };
  const layer = async () =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx) => {
      const l = await tx.inventoryLayer.findFirstOrThrow({ where: { productId }, orderBy: { createdAt: 'asc' } });
      return { remaining: Number(l.qtyRemaining), unitCost: Number(l.unitCost) };
    });
  const declaration = async () => (await auth(http().get('/obligations/vat-declaration')).query(Q4).expect(200)).body;
  const guards = async () =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx) => ({
      shelf: (await inventoryLedgerReconciliation(tx)).difference,
      distribution: (await inventoryDistributionCheck(tx)).findings,
    }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'vat-closing');

    const suffix = Date.now();
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل إقفال ${suffix}` }).expect(201)).body.id;
    const supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد إقفال ${suffix}` }).expect(201)).body.id;
    warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع إقفال ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع إقفال ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف مشترك ${suffix}`, price: 50, cost: 10 }).expect(201)).body.id;

    // توريدٌ خاضعٌ 600 ومعفىً 400 في الربع الرابع من 2025 — نسبةُ السنة الفعلية 0.6.
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2025-11-10', dueDate: '2025-12-10', lines: [{ description: 'خاضع', quantity: 1, unitPrice: 600, taxRate: 15 }] })
      .expect(201);
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2025-11-10', dueDate: '2025-12-10', lines: [{ description: 'معفى', quantity: 1, unitPrice: 400, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
      .expect(201);
    // شراءٌ مشتركٌ مخزنيّ: عشرُ وحداتٍ بعشرة، ضريبتُه 15 — كلُّها في 1250 حتى يُقفل الربع.
    await auth(http().post('/purchases'))
      .send({ supplierId, date: '2025-11-05', subtotal: 100, warehouseId, branchId, category: 'بضاعة', inputVatUse: 'MIXED', lines: [{ description: 'صنف', productId, quantity: 10, unitPrice: 10, taxRate: 15 }] })
      .expect(201);
    await auth(http().post('/obligations/vat-ratio')).send({ year: 2025, ratio: 0.5, basis: 'ESTIMATED' }).expect(201);
  }, 240000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① قبل الإقفال: المشتركُ كلُّه في 1250 والإقرارُ يعلن أنه لم يُرحَّل — بنسبة الفترة (0.5) وغيرُ قابله 7.5', async () => {
    const d = await declaration();
    expect({ applies: d.proportional.applies, ratio: d.proportional.ratio, closing: d.proportional.closing, mixedPosted: d.proportional.mixedPosted }).toEqual({
      applies: true,
      ratio: 0.5,
      closing: null,
      mixedPosted: '0.00',
    });
    const warning = d.limits.find((l: { code: string }) => l.code === 'NON_DEDUCTIBLE_INPUT_VAT_NOT_POSTED');
    expect(warning?.message).toContain('7.50');
    expect(await layer()).toEqual({ remaining: 10, unitCost: 10 });
  });

  it('② الإقفالُ حدثٌ بتاريخ اليوم: 7.5 من 1250 إلى تكلفة ما على الرفّ — والإقرارُ يرى الإقفالَ ولا يعلن باقياً', async () => {
    let body: { id: string; kind: string; ratio: number; date: string; documentsCount: number; baseAmount: string } | null = null;
    const delta = await deltaOf(async () => {
      body = (await auth(http().post('/obligations/vat-declaration/closings')).send(Q4).expect(201)).body;
    });
    expect(body).toEqual(expect.objectContaining({ kind: 'CLOSING', ratio: 0.5, documentsCount: 1, baseAmount: '7.50' }));
    expect(String(body!.date).slice(0, 10)).toBe(today());
    closingId = body!.id;
    expect({ '1250': delta('1250'), '1300': delta('1300'), '5100': delta('5100') }).toEqual({ '1250': -7.5, '1300': 7.5, '5100': 0 });
    expect(await layer()).toEqual({ remaining: 10, unitCost: 10.75 });

    // الحدثُ يُختم على حدث الضريبة الذي أطلقه — بتاريخه لا بتاريخ المستند.
    const event = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.nonDeductibleVatEvent.findFirstOrThrow({ where: { vatReturnClosingId: closingId } }));
    expect({ trigger: event.trigger, date: event.date.toISOString().slice(0, 10) }).toEqual({ trigger: 'VAT_RETURN_CLOSING', date: today() });

    const d = await declaration();
    expect(d.proportional.closing).toEqual(expect.objectContaining({ id: closingId, ratio: 0.5 }));
    expect(d.proportional.mixedPosted).toBe('7.50');
    expect(d.limits.map((l: { code: string }) => l.code)).not.toContain('NON_DEDUCTIBLE_INPUT_VAT_NOT_POSTED');
    expect(await guards()).toEqual({ shelf: 0, distribution: [] });
  });

  it('③ لا إقفالَ مرّتين ولا متداخل ولا قبل انقضاء الفترة — مسمّاةً', async () => {
    expect((await auth(http().post('/obligations/vat-declaration/closings')).send(Q4).expect(409)).body.message).toContain('vat_closing_exists');
    expect((await auth(http().post('/obligations/vat-declaration/closings')).send({ year: 2025, month: 11 }).expect(409)).body.message).toContain('vat_closing_overlap');
    expect((await auth(http().post('/obligations/vat-declaration/closings')).send({ year: 2026, quarter: 4 }).expect(409)).body.message).toContain('vat_closing_period_open');
  });

  it('④ «ولا يُرفع إلا بحدثٍ عاكسٍ بتاريخه»: العكسُ بعد بيعٍ من الطبقة يعيد ما على الرفّ إلى 1250 وحصّةَ المبيع من 5100', async () => {
    // بيعُ أربعٍ اليوم — تخرج بتكلفة الطبقة بعد الإقفال (10.75).
    await auth(http().post('/invoices'))
      .send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'بيع', productId, quantity: 4, unitPrice: 50, taxRate: 15 }] })
      .expect(201);
    let reversalId = '';
    const delta = await deltaOf(async () => {
      const r = (await auth(http().post(`/obligations/vat-declaration/closings/${closingId}/reverse`)).send({}).expect(201)).body;
      expect(r).toEqual(expect.objectContaining({ kind: 'REVERSAL', baseAmount: '-7.50' }));
      reversalId = r.id;
    });
    // −7.5: الرفُّ (ستٌّ من عشر) −4.5 · والمبيعُ (أربع) −3 من 5100.
    expect({ '1250': delta('1250'), '1300': delta('1300'), '5100': delta('5100') }).toEqual({ '1250': 7.5, '1300': -4.5, '5100': -3 });
    expect(await layer()).toEqual({ remaining: 6, unitCost: 10 });
    expect((await auth(http().post(`/obligations/vat-declaration/closings/${closingId}/reverse`)).send({}).expect(409)).body.message).toContain('vat_closing_already_reversed');
    expect((await auth(http().post(`/obligations/vat-declaration/closings/${reversalId}/reverse`)).send({}).expect(409)).body.message).toContain('vat_closing_reversal_final');
    expect((await declaration()).proportional.closing).toBeNull();
    expect(await guards()).toEqual({ shelf: 0, distribution: [] });
  });

  it('⑤ إقفالٌ جديدٌ بعد العكس — حدثٌ ثالثٌ بتاريخه، والسجلُّ يروي الثلاثة', async () => {
    const delta = await deltaOf(async () => {
      closingId = (await auth(http().post('/obligations/vat-declaration/closings')).send(Q4).expect(201)).body.id;
    });
    expect({ '1250': delta('1250'), '1300': delta('1300'), '5100': delta('5100') }).toEqual({ '1250': -7.5, '1300': 4.5, '5100': 3 });
    const events = (await auth(http().get('/obligations/vat-declaration/closings')).query({ year: 2025 }).expect(200)).body as { kind: string; reversedById: string | null }[];
    expect(events.map((e) => [e.kind, e.reversedById !== null])).toEqual([
      ['CLOSING', true],
      ['REVERSAL', false],
      ['CLOSING', false],
    ]);
  });

  it('⑥ التسويةُ السنويةُ حدثٌ مثلُه: بنسبة السنة الفعلية (0.6) يعود 1.5 إلى 1250 — ولا تسويةَ لسنةٍ لم تنتهِ، ولا عكسَ لإقفالٍ تعتمد عليه', async () => {
    // سنةٌ لم تنتهِ — ولو أُعلنت نسبتُها — لا تُسوّى.
    await auth(http().post('/obligations/vat-ratio')).send({ year: 2026, ratio: 0.5, basis: 'ESTIMATED' }).expect(201);
    expect((await auth(http().post('/obligations/vat-ratio/settle')).send({ year: 2026 }).expect(409)).body.message).toContain('vat_adjustment_year_open');
    let adjustmentId = '';
    const delta = await deltaOf(async () => {
      const r = (await auth(http().post('/obligations/vat-ratio/settle')).send({ year: 2025 }).expect(201)).body;
      expect({ actualRatio: r.actualRatio, kind: r.adjustment.kind, ratio: r.adjustment.ratio, baseAmount: r.adjustment.baseAmount }).toEqual({
        actualRatio: 0.6,
        kind: 'ANNUAL_ADJUSTMENT',
        ratio: 0.6,
        baseAmount: '-1.50',
      });
      expect(r.settledAt).not.toBeNull();
      adjustmentId = r.adjustment.id;
    });
    // −1.5: الرفُّ (ستٌّ من عشر) −0.9 · والمبيعُ −0.6.
    expect({ '1250': delta('1250'), '1300': delta('1300'), '5100': delta('5100') }).toEqual({ '1250': 1.5, '1300': -0.9, '5100': -0.6 });
    expect((await auth(http().post(`/obligations/vat-declaration/closings/${closingId}/reverse`)).send({}).expect(409)).body.message).toContain('vat_closing_adjustment_first');
    expect((await auth(http().post('/obligations/vat-ratio/settle')).send({ year: 2025 }).expect(409)).body.message).toContain('vat_adjustment_exists');

    // وعكسُ التسوية يعيد نسبةَ الإقفال (0.5) — ويرفع ختمَها.
    const back = await deltaOf(async () => {
      await auth(http().post(`/obligations/vat-declaration/closings/${adjustmentId}/reverse`)).send({}).expect(201);
    });
    expect({ '1250': back('1250'), '1300': back('1300'), '5100': back('5100') }).toEqual({ '1250': -1.5, '1300': 0.9, '5100': 0.6 });
    const ratio = (await auth(http().get('/obligations/vat-ratio')).query({ year: 2025 }).expect(200)).body;
    expect(ratio.declared.settledAt).toBeNull();
    expect(await guards()).toEqual({ shelf: 0, distribution: [] });
  });

  it('⑦ المعاينةُ تُحسب ولا تُكتب — والحسابُ اليدويّ حَكَم: (0.6 − 0.5) × 15 = 1.5', async () => {
    const preview = (await auth(http().get('/obligations/vat-ratio/settlement')).query({ year: 2025 }).expect(200)).body;
    expect({ actualRatio: preview.actualRatio, appliedRatio: preview.appliedRatio, difference: preview.difference }).toEqual({ actualRatio: 0.6, appliedRatio: 0.5, difference: 1.5 });
    const ratio = (await auth(http().get('/obligations/vat-ratio')).query({ year: 2025 }).expect(200)).body;
    expect(ratio.declared.settledAt).toBeNull();
  });
});
