import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { buildUnsignedInvoiceXml } from '../src/zatca/ubl/invoice-xml.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * **① وحدةُ القياس تُعلَن ولا تُفترض** (`ق-١٠٦٩` · 2026-09-18):
 *   ① صنفٌ جديد بلا وحدةٍ من القائمة المغلقة يُرفض باسمه — ولا «قطعة» صامتة؛ ومثالُ الهيئة `PCE` ليس في القائمة فيُرفض.
 *   ② القائمُ بلا وحدة يبقى بلا وحدة حتى يُعلنها التاجر — لا يُخمَّن من نصّه القديم؛ ويُعدّ ويُرى.
 *   ③ سطرُ المستند ينسخ وحدةَ صنفه لحظةَ الكتابة: فاتورةٌ · عرضٌ وتحويلُه · شراءٌ · إشعارٌ دائن — وصنفٌ لم يُعلن يترك السطرَ بلا وحدة.
 *   ④ الكاشير ينسخ من بطاقة الصنف كذلك.
 *   ⑤ مستندُ الهيئة يقرأ وحدةَ السطر: المعلَنُ يحمل رمزَه، وغيرُ المعلَن يخرج بلا السمة — ولا `PCE` ثابت.
 * منشأةٌ معزولة تُزال في الختام.
 */
// كلُّ مرحلةٍ ستّةُ طلباتٍ فأكثر على مضيفٍ بطيء — السقفُ الافتراضيّ (خمس ثوانٍ) يقطعها لا يقيسها.
jest.setTimeout(60000);

describe('① وحدةُ القياس تُعلَن ولا تُفترض (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  let customerId: string;
  let supplierId: string;
  let warehouseId: string;
  let declaredId: string;
  let legacyId: string;
  const suffix = `${Date.now()}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const invoiceLines = (invoiceId: string) =>
    tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoiceLine.findMany({ where: { invoiceId }, orderBy: { createdAt: 'asc' }, select: { productId: true, unitCode: true, description: true, quantity: true, unitPrice: true, taxRate: true } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'unit-of-measure');
    token = company.token;
    companyId = company.companyId;
    customerId = (await auth(http().post('/customers')).send({ name: `عميل الوحدات ${suffix}` }).expect(201)).body.id;
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد الوحدات ${suffix}` }).expect(201)).body.id;
    warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع الوحدات ${suffix}` }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app?.close();
  }, 120000);

  /** الأسطرُ المتداخلة تُكتب بطابعٍ زمنيّ واحد فلا يُعتمد ترتيبُها — تُقرأ بصنفها: المعلَن · القديم · بلا صنف. */
  const unitsByKind = (rows: { productId: string | null; unitCode: string | null }[]) => ({
    declared: rows.find((l) => l.productId === declaredId)?.unitCode,
    legacy: rows.find((l) => l.productId === legacyId)?.unitCode,
    service: rows.find((l) => l.productId === null)?.unitCode,
  });

  it('① صنفٌ جديد بلا وحدةٍ من القائمة يُرفض باسمه — ولا «قطعة» صامتة؛ ومثالُ الهيئة `PCE` ليس في القائمة', async () => {
    const missing = await auth(http().post('/products')).send({ name: `بلا وحدة ${suffix}`, price: 10 }).expect(400);
    expect(String(missing.body.message)).toContain('وحدة القياس مطلوبة');
    const pce = await auth(http().post('/products')).send({ name: `PCE ${suffix}`, price: 10, unitCode: 'PCE' }).expect(400);
    expect(String(pce.body.message)).toContain('ليست من القائمة');
    // النصُّ الحرّ لم يعد باباً — الحقلُ القديم يُرفض في الطلب.
    await auth(http().post('/products')).send({ name: `نصّ ${suffix}`, price: 10, unit: 'قطعة' }).expect(400);
    // ٥+٦: التتبّعُ بالدفعة والانتهاء يُعلَن كذلك عند الإنشاء (ق-١٠٨١) — كما الوحدة.
    const created = await auth(http().post('/products')).send({ name: `أرزّ ${suffix}`, price: 100, unitCode: 'KGM', expiryTracked: false }).expect(201);
    expect(created.body.unitCode).toBe('KGM');
    declaredId = created.body.id;
  });

  it('② القائمُ بلا وحدة يبقى بلا وحدة حتى يُعلنها التاجر — لا يُخمَّن من نصّه القديم، ويُعدّ ويُرى', async () => {
    // صفٌّ كما تركته الهجرة: نصٌّ قديم «كرتون» وبلا رمز.
    legacyId = (
      await tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.product.create({ data: { companyId, name: `صنفٌ قديم ${suffix}`, unit: 'كرتون', price: 25, cost: 0 } as unknown as Prisma.ProductUncheckedCreateInput }),
      )
    ).id;
    const list = (await auth(http().get('/products')).expect(200)).body as { id: string; unitCode: string | null; unit: string | null }[];
    const legacy = list.find((p) => p.id === legacyId)!;
    expect(legacy.unitCode).toBeNull();
    expect(legacy.unit).toBe('كرتون');
    expect(list.filter((p) => p.unitCode === null)).toHaveLength(1);
    // إعلانٌ خارج القائمة يُرفض؛ وتعديلٌ لا يذكر الوحدة لا يمسّها.
    await auth(http().patch(`/products/${legacyId}`)).send({ unitCode: 'BOGUS' }).expect(400);
    const renamed = await auth(http().patch(`/products/${legacyId}`)).send({ name: `صنفٌ قديم ${suffix} — مُعاد` }).expect(200);
    expect(renamed.body.unitCode).toBeNull();
  });

  it('③ سطرُ المستند ينسخ وحدةَ صنفه لحظةَ الكتابة — فاتورةٌ وعرضٌ وتحويلُه وشراءٌ وإشعارٌ دائن؛ وغيرُ المعلَن بلا وحدة', async () => {
    const lines = [
      { description: 'أرزّ', productId: declaredId, quantity: 2, unitPrice: 100, taxRate: 15 },
      { description: 'قديم', productId: legacyId, quantity: 1, unitPrice: 25, taxRate: 15 },
      { description: 'خدمة بلا صنف', quantity: 1, unitPrice: 30, taxRate: 15 },
    ];
    const invoice = (await auth(http().post('/invoices')).send({ customerId, issueDate: today(), dueDate: today(), lines }).expect(201)).body;
    const invoiceRows = await invoiceLines(invoice.id);
    expect(invoiceRows).toHaveLength(3);
    expect(unitsByKind(invoiceRows)).toEqual({ declared: 'KGM', legacy: null, service: null });

    const quote = (await auth(http().post('/quotes')).send({ customerId, issueDate: today(), validUntil: today(), lines }).expect(201)).body;
    const quoteLines = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.quoteLine.findMany({ where: { quoteId: quote.id }, orderBy: { unitPrice: 'desc' }, select: { unitCode: true, productId: true } }));
    expect(quoteLines.find((l) => l.productId === declaredId)?.unitCode).toBe('KGM');
    expect(quoteLines.find((l) => l.productId === legacyId)?.unitCode).toBeNull();
    const converted = (await auth(http().post(`/quotes/${quote.id}/convert`)).expect(201)).body.invoice;
    expect(unitsByKind(await invoiceLines(converted.id))).toEqual({ declared: 'KGM', legacy: null, service: null });

    const purchase = (
      await auth(http().post('/purchases'))
        .send({ supplierId, date: today(), subtotal: 300, warehouseId, category: 'بضاعة', lines: [{ description: 'أرزّ', productId: declaredId, quantity: 3, unitPrice: 100, taxRate: 15 }] })
        .expect(201)
    ).body;
    const purchaseLines = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.purchaseLine.findMany({ where: { purchaseId: purchase.id }, select: { unitCode: true } }));
    expect(purchaseLines.map((l) => l.unitCode)).toEqual(['KGM']);

    // الإشعارُ الدائن الكامل يُعبَّأ من بنود الأصل — ووحدةُ كلِّ سطرٍ من صنفه.
    const credit = (await auth(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: 'اختبارُ الوحدات', issueDate: today() }).expect(201)).body;
    const creditRows = await invoiceLines(credit.id);
    expect(creditRows).toHaveLength(3);
    expect(unitsByKind(creditRows)).toEqual({ declared: 'KGM', legacy: null, service: null });
  });

  it('④ الكاشير ينسخ الوحدةَ من بطاقة الصنف كذلك', async () => {
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
    const sale = (await auth(http().post('/pos/sales')).send({ lines: [{ productId: declaredId, quantity: 1 }, { productId: legacyId, quantity: 1 }], paymentMethod: 'CASH' }).expect(201)).body;
    const invoiceId: string = sale.invoiceId ?? sale.invoice?.id ?? sale.id;
    const rows = await invoiceLines(invoiceId);
    expect(rows.find((l) => l.productId === declaredId)?.unitCode).toBe('KGM');
    expect(rows.find((l) => l.productId === legacyId)?.unitCode).toBeNull();
  });

  it('⑤ مستندُ الهيئة يقرأ وحدةَ السطر المخزَّنة: المعلَنُ برمزه وغيرُ المعلَن بلا سمة — ولا `PCE` ثابت', async () => {
    const invoice = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today(), dueDate: today(), lines: [{ description: 'أرزّ', productId: declaredId, quantity: 2, unitPrice: 100, taxRate: 15 }, { description: 'قديم', productId: legacyId, quantity: 1, unitPrice: 25, taxRate: 15 }] })
        .expect(201)
    ).body;
    const rows = await invoiceLines(invoice.id);
    // كما يبنيه `zatca.service` من الصفوف المخزَّنة لا من بطاقة الصنف.
    const xml = buildUnsignedInvoiceXml({
      number: invoice.no,
      uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28c1',
      issued: { date: today(), time: '09:30:00' },
      invoiceType: 'standard',
      icv: 1,
      pih: createHash('sha256').update('0').digest('base64'),
      seller: { name: 'منشأة الوحدات', vatNumber: '300000000000003' },
      buyer: { name: 'عميل', vatNumber: null },
      lines: rows.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitCode: l.unitCode ?? null, unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) })),
      currency: 'SAR',
      subtotal: 225,
      taxTotal: 33.75,
      total: 258.75,
      taxTotalSar: 33.75,
    });
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="KGM">2.0</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cbc:InvoicedQuantity>1.0</cbc:InvoicedQuantity>');
    expect(xml).not.toContain('PCE');
  });
});
