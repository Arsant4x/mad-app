import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { STANDARD_VAT_RATE } from '../src/common/vat/standard-rate';
import { buildUnsignedInvoiceXml } from '../src/zatca/ubl/invoice-xml.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * **⑧ فئةُ ضريبة القيمة المضافة تُعلَن على الصنف وتُنسخ لحظةَ البيع** (`ق-١٢١١` · `ق-١٢١٢` · `ق-١٢٢٣` · `ق-١٢٢٥`):
 *   ① صنفٌ جديد بلا فئةٍ `400` مسمّى؛ والتابعُ للمشتري (`HEA`) يُردّ باسمه (الحدُّ المعلَن)؛ و`Z` بلا سبب يُردّ.
 *   ② صنفُ `Z` + `VATEX-SA-35` يُرَنّ في الكاشير بصفرٍ: السطرُ يحمل الفئةَ والرمزَ، والضريبةُ على الخاضع وحدَه.
 *   ③ إعادةُ تصنيف الصنف لا تغيّر الفاتورةَ الصادرة — السطرُ نسخةٌ لحظةَ البيع.
 *   ④ بندٌ بلا صنف: صفرٌ بلا سبب `400`؛ وبفئةٍ وسببٍ يمرّ؛ والنسبةُ الأساسية وحدَها إعلانٌ لـ`S`.
 *   ⑤ الإقرارُ يقرأ السطورَ: الخاضعُ في `1`، والدواءُ في `3`، والمعفى في `5`، و`2` صفرٌ معلَن، وخارجُ النطاق عدّاً.
 *   ⑥ قيدُ `CHECK` يرفض القيمةَ القديمة لصفٍّ جديد — بمسبارٍ مُصادَق بصفٍّ قديمٍ يُقبل (`ق-٩٠٢`).
 *   ⑦ الدفترُ والمستندُ من السطور نفسِها: ضريبةُ القيد = ضريبةُ الخاضع وحدَه، والمُصدَرُ يحمل السببَ في تفصيله.
 * منشأةٌ معزولة تُزال في الختام.
 */
jest.setTimeout(90000);

class RollbackSignal extends Error {}

describe('⑧ فئةُ ضريبة الصنف — من البطاقة إلى الكاشير والمستند والإقرار (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  let customerId: string;
  let standardId: string;
  let medicineId: string;
  let posInvoiceId: string;
  let serviceInvoiceId: string;
  const suffix = `${Date.now()}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const lineSelect = { productId: true, description: true, quantity: true, unitPrice: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } as const;
  const invoiceLines = (invoiceId: string) => tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoiceLine.findMany({ where: { invoiceId }, select: lineSelect }));
  const product = (body: Record<string, unknown>) => auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, name: `صنف ${suffix}`, price: 100, ...body });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'product-tax');
    token = company.token;
    companyId = company.companyId;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الفئات ${suffix}` }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app?.close();
  }, 120000);

  it('① صنفٌ جديد بلا فئةٍ يُرفض باسمه؛ والتابعُ للمشتري غيرُ مدعوم؛ ونسبةُ الصفر بلا سبب تُرفض', async () => {
    const missing = await product({ name: `بلا فئة ${suffix}` }).expect(400);
    expect(String(missing.body.message)).toContain('فئةُ ضريبة القيمة المضافة مطلوبة');
    const hea = await product({ name: `مواطن ${suffix}`, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-HEA' }).expect(400);
    expect(String(hea.body.message)).toContain('غيرُ مدعومة');
    const noReason = await product({ name: `صفر بلا سبب ${suffix}`, taxCategory: 'Z' }).expect(400);
    expect(String(noReason.body.message)).toContain('سببَ الإعفاء');
    const onStandard = await product({ name: `خاضع بسبب ${suffix}`, taxCategory: 'S', taxExemptionReasonCode: 'VATEX-SA-35' }).expect(400);
    expect(String(onStandard.body.message)).toContain('لا تحمل سببَ إعفاء');

    standardId = (await product({ name: `قهوة ${suffix}`, taxCategory: 'S', price: 100 }).expect(201)).body.id;
    const medicine = await product({ name: `دواء ${suffix}`, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35', price: 40 }).expect(201);
    medicineId = medicine.body.id;
    expect(medicine.body.taxCategory).toBe('Z');
    expect(medicine.body.taxExemptionReasonCode).toBe('VATEX-SA-35');
    expect(medicine.body.taxExemptionReason).toBeNull();
  });

  it('② الكاشير يرنّ الدواءَ بصفرٍ والقهوةَ بالأساسية — الفئةُ والرمزُ منسوخان على السطر، والضريبةُ على الخاضع وحدَه', async () => {
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
    const sale = await auth(http().post('/pos/sales'))
      .send({ lines: [{ productId: standardId, quantity: 2 }, { productId: medicineId, quantity: 3 }], paymentMethod: 'CASH' })
      .expect(201);
    posInvoiceId = sale.body.id;
    // 2 × 100 خاضع = 200 + 30 ضريبة · 3 × 40 دواء = 120 بلا ضريبة ⟵ 320 + 30 = 350
    expect(Number(sale.body.subtotal)).toBeCloseTo(320, 2);
    expect(Number(sale.body.taxTotal)).toBeCloseTo(30, 2);
    expect(Number(sale.body.total)).toBeCloseTo(350, 2);
    const rows = await invoiceLines(posInvoiceId);
    const coffee = rows.find((l) => l.productId === standardId)!;
    const drug = rows.find((l) => l.productId === medicineId)!;
    expect([coffee.taxCategory, Number(coffee.taxRate), coffee.taxExemptionReasonCode]).toEqual(['S', STANDARD_VAT_RATE, null]);
    expect([drug.taxCategory, Number(drug.taxRate), drug.taxExemptionReasonCode]).toEqual(['Z', 0, 'VATEX-SA-35']);
  });

  it('③ إعادةُ تصنيف الصنف لا تغيّر الفاتورةَ الصادرة — والبيعُ التالي يقرأ البطاقةَ الجديدة', async () => {
    const changed = await auth(http().patch(`/products/${medicineId}`)).send({ taxCategory: 'S', taxExemptionReasonCode: null }).expect(200);
    expect(changed.body.taxCategory).toBe('S');
    expect(changed.body.taxExemptionReasonCode).toBeNull();
    const rows = await invoiceLines(posInvoiceId);
    expect(rows.find((l) => l.productId === medicineId)?.taxCategory).toBe('Z');
    // ويعود دواءً — والتغييرُ يُفحص على ما سيصير عليه الصنفُ لا على الجزء المرسَل.
    const mismatch = await auth(http().patch(`/products/${medicineId}`)).send({ taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-35' }).expect(400);
    expect(String(mismatch.body.message)).toContain('لا يتبع هذه الفئة');
    await auth(http().patch(`/products/${medicineId}`)).send({ taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' }).expect(200);
  });

  it('④ بندٌ بلا صنف: صفرٌ بلا سبب يُرفض، وبفئةٍ وسببٍ يمرّ، والأساسيةُ وحدَها إعلانٌ لـS — وخارجُ النطاق بنصّه المقيَّد', async () => {
    const base = { customerId, issueDate: today(), dueDate: today() };
    const ambiguous = await auth(http().post('/invoices')).send({ ...base, lines: [{ description: 'خدمة بصفر', quantity: 1, unitPrice: 100, taxRate: 0 }] }).expect(400);
    expect(String(ambiguous.body.message)).toContain('غامضةٌ');
    const conflict = await auth(http().post('/invoices')).send({ ...base, lines: [{ description: 'متعارض', quantity: 1, unitPrice: 100, taxRate: STANDARD_VAT_RATE, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] }).expect(400);
    expect(String(conflict.body.message)).toContain('تخالف فئةَ الضريبة');
    const blank = await auth(http().post('/invoices')).send({ ...base, lines: [{ description: 'خارج النطاق', quantity: 1, unitPrice: 10, taxCategory: 'O', taxExemptionReason: '   ' }] }).expect(400);
    expect(String(blank.body.message)).toContain('تحتاج سببها نصّاً');

    const created = await auth(http().post('/invoices'))
      .send({
        ...base,
        lines: [
          { description: 'استشارة', quantity: 1, unitPrice: 200, taxRate: STANDARD_VAT_RATE },
          { description: 'خدمة مالية معفاة', quantity: 1, unitPrice: 50, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' },
          { description: 'رسوم حكومية', quantity: 1, unitPrice: 10, taxCategory: 'O', taxExemptionReason: '  رسومٌ حكومية تُحصَّل نيابةً عن الجهة  ' },
        ],
      })
      .expect(201);
    serviceInvoiceId = created.body.id;
    expect(Number(created.body.subtotal)).toBeCloseTo(260, 2);
    expect(Number(created.body.taxTotal)).toBeCloseTo(30, 2);
    const rows = await invoiceLines(serviceInvoiceId);
    expect(rows.map((l) => [l.description, l.taxCategory, l.taxExemptionReasonCode, l.taxExemptionReason, Number(l.taxRate)]).sort()).toEqual(
      [
        ['استشارة', 'S', null, null, STANDARD_VAT_RATE],
        ['خدمة مالية معفاة', 'E', 'VATEX-SA-29', null, 0],
        ['رسوم حكومية', 'O', 'VATEX-SA-OOS', 'رسومٌ حكومية تُحصَّل نيابةً عن الجهة', 0],
      ].sort(),
    );
  });

  it('⑤ الإقرارُ يقرأ السطور: الخاضعُ في 1، والدواءُ في 3، والمعفى في 5، والخانةُ 2 صفرٌ معلَن، وخارجُ النطاق عدّاً لا خانةً', async () => {
    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const d = await auth(http().get('/obligations/vat-declaration')).query({ year: now.getUTCFullYear(), quarter }).expect(200);
    // ② المالُ نصّاً بخانتين (`ق-١٢٣٥`) — الحقولُ تُقارَن حرفاً لا بعد تحويل، فالشكلُ جزءٌ من العقد.
    expect(d.body.boxes['1']).toEqual({ net: '400.00', vat: '60.00' }); // 200 قهوة + 200 استشارة
    expect(d.body.boxes['3']).toEqual({ net: '120.00' }); // الدواء
    expect(d.body.boxes['4']).toEqual({ net: '0.00' });
    expect(d.body.boxes['5']).toEqual({ net: '50.00' }); // المعفى
    expect(d.body.boxes['2']).toEqual({ net: '0.00', vat: '0.00', supported: false });
    expect(d.body.salesCitizens).toBe('0.00');
    expect(String(d.body.salesCitizensNote)).toContain('تتبع هويّةَ المشتري');
    expect(d.body.salesOutOfScope).toEqual({ lineCount: 1, net: '10.00' });
    expect(d.body.legacyZeroLines).toEqual({ lineCount: 0, net: '0.00' });
    expect(d.body.legacyStandardLines).toEqual({ lineCount: 0, net: '0.00' });
    expect(d.body.salesStandard).toBe('400.00');
    expect(d.body.salesStandardVat).toBe('60.00');
    expect(d.body.salesExempt).toBe('50.00');
    expect(d.body.totalSales).toBe('570.00');
    expect(d.body.boxes['6']).toEqual({ net: '570.00' });
  });

  it('⑥ قيدُ CHECK يحبس القيمةَ القديمة على ما سبق الهجرة — بمسبارٍ يُقبل فيه صفٌّ قديم ويُرفض الجديد', async () => {
    const attempt = (createdAt: string, category: string) =>
      tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await tx.$executeRaw`INSERT INTO "products" ("id", "companyId", "name", "taxCategory", "createdAt", "updatedAt")
          VALUES (${`probe-${suffix}-${createdAt}`}, ${companyId}, ${'مسبار القيد'}, ${category}::"TaxCategory", ${createdAt}::timestamp, now())`;
        throw new RollbackSignal();
      });
    // الحالةُ الموجبة: صفٌّ سبق الهجرة يقبل القيمةَ القديمة — فالمسبار يرى، والرفضُ أدناه رفضُ القيد لا عمى.
    await expect(attempt('2000-01-01', 'LEGACY_STANDARD')).rejects.toThrow(RollbackSignal);
    // الحالةُ السالبة: صفٌّ جديد بالقيمة القديمة يُرفض من القاعدة نفسِها.
    await expect(attempt(new Date().toISOString(), 'LEGACY_STANDARD')).rejects.toThrow(/products_legacy_tax_category_before_cutover/);
    // والمعفى بلا سببٍ يُرفض من القاعدة كذلك — لا من الخدمة وحدها.
    await expect(attempt('2000-01-02', 'E')).rejects.toThrow(/products_tax_reason_coupling/);
    // وسطرُ فاتورةٍ جديد لا يحمل LEGACY_ZERO.
    await expect(
      tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await tx.$executeRaw`INSERT INTO "invoice_lines" ("id", "companyId", "invoiceId", "description", "quantity", "unitPrice", "taxRate", "taxCategory")
          VALUES (${`probe-line-${suffix}`}, ${companyId}, ${serviceInvoiceId}, ${'قديم'}, 1, 1, 0, 'LEGACY_ZERO')`;
        throw new RollbackSignal();
      }),
    ).rejects.toThrow(/invoice_lines_legacy_zero_before_cutover/);
  });

  it('⑦ الدفترُ والمستندُ من السطور نفسِها: ضريبةُ القيد ضريبةُ الخاضع وحدَه، والمُصدَرُ يحمل السببَ في تفصيله وبلا نسبةٍ لخارج النطاق', async () => {
    const entry = await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: serviceInvoiceId }, select: { journalEntryId: true, no: true } });
      const lines = await tx.journalLine.findMany({ where: { journalEntryId: inv.journalEntryId! }, select: { debit: true, credit: true, account: { select: { code: true } } } });
      return { no: inv.no, lines: lines.map((l) => [l.account.code, Number(l.debit), Number(l.credit)]) };
    });
    expect(entry.lines).toEqual(expect.arrayContaining([['1200', 290, 0], ['4100', 0, 260], ['2200', 0, 30]]));

    const rows = await invoiceLines(serviceInvoiceId);
    const xml = buildUnsignedInvoiceXml({
      number: entry.no,
      uuid: '33333333-3333-3333-3333-333333333333',
      issued: { date: today(), time: '10:00:00' },
      invoiceType: 'simplified',
      icv: 1,
      pih: createHash('sha256').update('0').digest('base64'),
      seller: { name: 'منشأة الفئات', vatNumber: '300000000000003' },
      buyer: { name: 'عميل', vatNumber: null },
      lines: rows.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxRate: Number(l.taxRate),
        taxCategory: l.taxCategory,
        taxExemptionReasonCode: l.taxExemptionReasonCode,
        taxExemptionReason: l.taxExemptionReason,
      })),
      currency: 'SAR',
      subtotal: 260,
      taxTotal: 30,
      total: 290,
      taxTotalSar: 30,
    });
    expect(xml.match(/<cac:TaxSubtotal>/g)).toHaveLength(3);
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>VATEX-SA-29</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>الخدمات المالية</cbc:TaxExemptionReason>');
    expect(xml).toContain('<cac:TaxCategory><cbc:ID>O</cbc:ID><cbc:TaxExemptionReasonCode>VATEX-SA-OOS</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>رسومٌ حكومية تُحصَّل نيابةً عن الجهة</cbc:TaxExemptionReason>');
    expect(xml).toContain('<cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cac:TaxScheme>');
  });
});
