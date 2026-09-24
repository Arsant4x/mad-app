import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { invoiceTypeFor } from '../src/zatca/hash-chain.util';
import { buildUnsignedInvoiceXml } from '../src/zatca/ubl/invoice-xml.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (46.6 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(140000);

/**
 * الحزمة أ (`ق-١٢٦١`) — **صفةُ المشتري ومعرّفُه البديل وبلدُه، ونوعُ الفاتورة منها** (②A1):
 * م٥٣(١)(أ) توجب الكاملةَ للمؤسّسة والشخص الاعتباري ولو بلا تسجيل، والمبسّطةَ للطبيعيّ (م٥٣(٧))؛ و`BR-KSA-14`
 * معرّفٌ بديل بمخطّطه في المستند؛ والقائمُ يُعلَن ولا يُفوتَر قبله (نمطُ `ق-٨٩٢`).
 */
describe('Buyer kind decides the invoice type (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const invoiceFor = (customerId: string) =>
    auth(http().post('/invoices')).send({
      customerId,
      issueDate: '2026-06-01',
      dueDate: '2026-06-30',
      lines: [{ description: 'خدمة', quantity: 1, unitPrice: 100, taxRate: 15 }],
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'buyerkind');
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('[SPEC 4.10] ① the kind is required and declared — no silent default; the alternative id is a pair with a listed scheme, the country a code', async () => {
    const missing = await auth(http().post('/customers')).send({ name: 'بلا صفة' }).expect(400);
    expect(String(missing.body.message)).toContain('صفة');

    const est = await auth(http().post('/customers')).send({ kind: 'ESTABLISHMENT', name: 'مؤسسة النور', otherIdScheme: 'CRN', otherId: '1010101010' }).expect(201);
    expect(est.body).toMatchObject({ kind: 'ESTABLISHMENT', otherIdScheme: 'CRN', otherId: '1010101010', country: 'SA' });

    const half = await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'نصف معرّف', otherIdScheme: 'NAT' }).expect(400);
    expect(String(half.body.message)).toContain('معاً');
    await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'مخطّط مجهول', otherIdScheme: 'XYZ', otherId: '1' }).expect(400);
    await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'بلد مشوّه', country: 'uae' }).expect(400);

    // «700» تُخزَّن وتُعاد كما هي — نصٌّ مقيَّد لا تعدادٌ يترجمها.
    const seven = await auth(http().post('/customers')).send({ kind: 'LEGAL_PERSON', name: 'شركة السبعمئة', otherIdScheme: '700', otherId: '7001234567', country: 'AE' }).expect(201);
    expect(seven.body).toMatchObject({ kind: 'LEGAL_PERSON', otherIdScheme: '700', otherId: '7001234567', country: 'AE' });

    // مسحُ الزوج بنصفٍ فارغ يمسحهما معاً.
    const cleared = await auth(http().patch(`/customers/${seven.body.id}`)).send({ otherIdScheme: '', otherId: '' }).expect(200);
    expect(cleared.body).toMatchObject({ otherIdScheme: null, otherId: null });

    // ⚖️ `ق-١٤٠٤` — **العقدُ الذي تحترمه النافذةُ الآن**: الإنشاءُ بمخطّطٍ فارغ يُردّ (`''` ليس من القائمة — وكانت النافذةُ ترسله
    //    فيُردّ كلُّ عميلٍ جديدٍ بلا معرّفٍ بديل)، والإنشاءُ بلا الحقل يُقبل، والمحوُ في التعديل بـ`null` يُقبل كالفارغ.
    const emptyOnCreate = await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'مخطّط فارغ', otherIdScheme: '', otherId: '' }).expect(400);
    expect(String(emptyOnCreate.body.message)).toContain('مخطّط المعرّف البديل');
    const omitted = await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'بلا معرّفٍ بديل' }).expect(201);
    expect(omitted.body).toMatchObject({ otherIdScheme: null, otherId: null });
    const clearedByNull = await auth(http().patch(`/customers/${est.body.id}`)).send({ otherIdScheme: null, otherId: null }).expect(200);
    expect(clearedByNull.body).toMatchObject({ otherIdScheme: null, otherId: null });
  }, 30000);

  it('[SPEC 4.10] ② a customer from before the build is refused a document by name until its kind is declared — then it is invoiced', async () => {
    // صفٌّ سبق البناءَ: قيمةٌ قديمة بتاريخ إنشاءٍ قبل لحظة الحبس — كما تتركه الهجرةُ للقائم.
    const legacyId = 'legacy-' + Date.now();
    await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO customers (id, "companyId", name, kind, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'LEGACY_UNDECLARED', '2020-01-01', now())`,
        legacyId,
        company.companyId,
        'عميل قديم',
      ),
    );
    const refused = await invoiceFor(legacyId).expect(400);
    expect(String(refused.body.message)).toContain('عميل قديم');
    expect(String(refused.body.message)).toContain('صفته');

    await auth(http().patch(`/customers/${legacyId}`)).send({ kind: 'ESTABLISHMENT' }).expect(200);
    const issued = await invoiceFor(legacyId).expect(201);
    expect(issued.body.no).toMatch(/^INV-/);
    // ولا عودةَ إلى «غير معلَن» من الواجهة.
    await auth(http().patch(`/customers/${legacyId}`)).send({ kind: 'LEGACY_UNDECLARED' }).expect(400);
  }, 30000);

  it('[SPEC 4.10] ③ the type follows the kind (م٥٣) and the document carries the alternative id with its scheme and the buyer country (BR-KSA-14 · BT-55)', () => {
    // ⑤A3: السطورُ تدخل الاشتقاق (الصادرات) — هنا محلّيةٌ خاضعة فلا تغيّر الحكم.
    const local = [{ taxExemptionReasonCode: null }];
    expect(invoiceTypeFor({ kind: 'ESTABLISHMENT', vatNumber: null, country: 'SA' }, local)).toBe('standard');
    expect(invoiceTypeFor({ kind: 'LEGAL_PERSON', vatNumber: null, country: 'SA' }, local)).toBe('standard');
    expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: null, country: 'SA' }, local)).toBe('simplified');
    expect(invoiceTypeFor({ kind: 'NATURAL', vatNumber: '300000000000003', country: 'SA' }, local)).toBe('standard');

    const xml = buildUnsignedInvoiceXml({
      number: 'INV-2026-0001',
      uuid: '44444444-4444-4444-4444-444444444444',
      issued: { date: '2026-06-01', time: '10:00:00' },
      invoiceType: 'standard',
      icv: 1,
      pih: createHash('sha256').update('0').digest('base64'),
      seller: { name: 'منشأة البائع', vatNumber: '300000000000003', crNumber: '2050000000' },
      buyer: { name: 'مؤسسة النور', vatNumber: null, otherId: { scheme: '700', id: '7001234567' }, country: 'AE', street: 'شارع', buildingNumber: '1234', district: 'حي', city: 'دبي', postalCode: '12345' },
      lines: [{ description: 'خدمة', quantity: 1, unitPrice: 100, taxRate: 15, taxCategory: 'S', taxExemptionReasonCode: null, taxExemptionReason: null }],
      currency: 'SAR',
      subtotal: 100,
      taxTotal: 15,
      total: 115,
      taxTotalSar: 15,
    });
    const buyerXml = xml.slice(xml.indexOf('<cac:AccountingCustomerParty>'), xml.indexOf('</cac:AccountingCustomerParty>'));
    expect(buyerXml).toContain('<cac:PartyIdentification><cbc:ID schemeID="700">7001234567</cbc:ID></cac:PartyIdentification>');
    expect(buyerXml).toContain('<cbc:IdentificationCode>AE</cbc:IdentificationCode>');
    // والبائعُ كما كان: سجلُّه التجاريّ بمخطّط CRN وبلدُه SA.
    const sellerXml = xml.slice(xml.indexOf('<cac:AccountingSupplierParty>'), xml.indexOf('</cac:AccountingSupplierParty>'));
    expect(sellerXml).toContain('schemeID="CRN">2050000000<');
    expect(sellerXml).toContain('<cbc:IdentificationCode>SA</cbc:IdentificationCode>');
  });

  it('[SPEC 4.10] ⑤ ⑤A3 — an export supply to a foreign buyer is a standard invoice even for a natural person (م٥٣(١)(أ)(٣)); a foreign buyer with only local lines is not; a Saudi VAT number on a foreign customer is refused by name', async () => {
    // أجنبيٌّ برقمِ تسجيلٍ سعوديّ تناقضٌ — يُرفض عند البطاقة لا عند الختم (BR-KSA-46).
    const conflict = await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'أجنبي برقم سعودي', country: 'AE', vatNumber: '300000000000003' }).expect(400);
    expect(String(conflict.body.message)).toContain('TIN');
    const foreign = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'مشترٍ في الإمارات', country: 'AE', otherIdScheme: 'TIN', otherId: 'AE1234567' }).expect(201)).body as { id: string };
    await auth(http().patch(`/customers/${foreign.id}`)).send({ vatNumber: '300000000000003' }).expect(400);

    const exported = (
      await auth(http().post('/invoices'))
        .send({ customerId: foreign.id, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: [{ description: 'خدمة مصدَّرة', quantity: 1, unitPrice: 100, taxRate: 0, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-33' }] })
        .expect(201)
    ).body as { id: string };
    const local = (await invoiceFor(foreign.id).expect(201)).body as { id: string };
    const rows = (await auth(http().get('/invoices')).expect(200)).body as { id: string; invoiceType: string }[];
    expect(rows.find((r) => r.id === exported.id)?.invoiceType).toBe('standard');
    // خدمةٌ تُستهلك في المملكة لمشترٍ أجنبيّ فرد: مبسّطةٌ كما كانت — البلدُ وحدَه لا يصنع صادرات.
    expect(rows.find((r) => r.id === local.id)?.invoiceType).toBe('simplified');
  }, 60000);

  it('[SPEC 6.13] ④ ⑤A4 — a register sale to a legal person completes but its receipt carries no code and is gated until clearance; the walk-in sale is not', async () => {
    const productId = (await auth(http().post('/products')).send({ name: 'صنف الكاشير', unitCode: 'H87', expiryTracked: false, taxCategory: 'S', price: 100 }).expect(201)).body.id;
    const legal = (await auth(http().post('/customers')).send({ kind: 'LEGAL_PERSON', name: 'شركة المشتري' }).expect(201)).body.id;
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);

    const gated = await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH', customerId: legal }).expect(201);
    expect(gated.body.status).toBe('PAID');
    expect(gated.body.clearance).toMatchObject({ required: true });
    expect(String(gated.body.clearance.message)).toContain('الإجازة');
    expect(gated.body.zatcaQr).toBeNull();
    expect(gated.body.zatcaStamped).toBe(false);

    const walkIn = await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' }).expect(201);
    expect(walkIn.body.clearance).toEqual({ required: false });
    // عميلُ المرور طبيعيٌّ بالبناء — أُعلن عند إنشائه لا افتُرض.
    const customers = (await auth(http().get('/customers')).expect(200)).body as { name: string; kind: string }[];
    expect(customers.find((c) => c.name === 'عميل نقدي')?.kind).toBe('NATURAL');
  }, 60000);
});
