import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';
import { startAuthorityStub, STUB_REJECTION_MESSAGE, type AuthorityStub } from './zatca-authority-stub';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { decodeZatcaQr } from '../src/zatca/qr.util';
import { STORED_DOC_CORRUPT } from '../src/zatca/zatca.service';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (44.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(135000);

/**
 * ⑤ الختم المتزامن (`ق-١٨٧` · `ق-١٩٦`) — على الخدمة الحقيقية بمفاتيحٍ حقيقية:
 *
 * ① بيعٌ حيّ لمنشأةٍ مربوطة يخرج إيصاله **بالوسوم التسعة**، والمستندُ الموقَّع محفوظ.
 * ② الإبلاغ يُرسل المحفوظ؛ وإن تلف المخزونُ بعد التوقيع **لا يُرسَل** — يُردّ بسببٍ
 *    مسمّى (`ق-١٩٦`/٤: من عطلٍ لا من نيّة).
 * ③ سقوطُ الختم (مفتاحٌ معطوب) **لا يُسقط البيع**: إيصالٌ بالوسوم الخمسة وسببٌ للكاشير
 *    (`ق-١٩٦`/١).
 *
 * ⛔ لا شبكةَ هيئة: `ZATCA_API_BASE_OVERRIDE` على خادمٍ محلّيٍّ يمثّل الهيئة ويجيب بالردّ `400`
 * (`ق-٩٧١`) — التوقيع حقيقي، والجوابُ ردٌّ حقيقيُّ الشكل (كحزمة `zatca-phase2`).
 */
describe('ZATCA synchronous stamp at sale (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  let productId: string;
  let openedShiftId: string | null = null;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const invoiceIds: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function seedCredential(privateKeyPem: string, certBase64: string) {
    const data = {
      privateKeyEnc: encryptSecret(privateKeyPem),
      productionCsidEnc: encryptSecret(certBase64),
      productionSecretEnc: encryptSecret('fake-production-secret'),
      status: 'PRODUCTION_ISSUED' as const,
    };
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
    );
  }

  async function realKeys() {
    const webcrypto = new Crypto();
    x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);
    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      { serialNumber: '01', name: 'CN=mad-app-test, C=SA', notBefore: new Date('2026-01-01'), notAfter: new Date('2027-01-01'), keys, signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' } },
      webcrypto as unknown as globalThis.Crypto,
    );
    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    return {
      privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`,
      certBase64: Buffer.from(cert.rawData).toString('base64'),
    };
  }

  const sale = () =>
    auth(request(app.getHttpServer()).post('/pos/sales/sync')).send({
      clientSaleId: randomUUID(),
      ringAt: new Date().toISOString(),
      ringOffsetMin: 180,
      lines: [{ productId, quantity: 1 }],
      paymentMethod: 'CASH',
    });

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    authority = await startAuthorityStub('reject');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;

    // شرطُ الختم: اسمٌ قانوني ورقمٌ ضريبي — يُضبطان هنا لا يُفترَضان.
    await auth(request(app.getHttpServer()).patch('/company-profile'))
      .send({ legalName: `مؤسسة الختم ${suffix}`, vatNumber: `3${String(Date.now()).padStart(13, '0').slice(-13)}3` })
      .expect(200);
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف ختم ${suffix}`, price: 100 }).expect(201)).body.id;
    const open = await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 0 });
    if (open.status !== 201 && open.status !== 409) throw new Error(`تعذّر فتح مناوبة: ${open.status}`);
    if (open.status === 201) openedShiftId = open.body.id;
  }, 60000);

  afterAll(async () => {
    await authority.close();
    // ما فُتح هنا يُغلق هنا — مناوبةٌ مفتوحة تُسقط حزمةَ الكاشير التالية بـ409 (قِيس على قاعدةٍ نظيفة).
    if (openedShiftId) await auth(request(app.getHttpServer()).post(`/pos/shifts/${openedShiftId}/close`)).send({ declaredClosing: 0 }).catch(() => undefined);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } })).catch(() => undefined);
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣)،
    // فلا تبقى الفواتيرُ المختومة رواسبَ كما كانت.
    await purgeInvoicesForTest(tenantPrisma, companyId, invoiceIds).catch(() => undefined);
    await auth(request(app.getHttpServer()).delete(`/products/${productId}`)).catch(() => undefined);
    await app.close();
    // ⏱️ ميزانيةٌ معلَنة للتنظيف — كما في `zatca-phase2`: خمسُ ثوانٍ افتراضاً لا تكفي إغلاقَ
    // مناوبةٍ ومحوَ فواتيرَ مختومةٍ وإغلاقَ التطبيق. **مقيسٌ لا مُقدَّر** (2026-09-22): الحزمةُ
    // تسقط في الخطّاف بالميزانية الافتراضية وتمرّ `3/3` بثلاثين ثانية — والعَرَضُ نفسُه مسجَّلٌ
    // على حزمٍ أخرى قبلها بأسابيع (`pos` · `ledger-statement` · `zatca-invoice-edit-guard`).
  }, 60000);

  it('① بيعٌ حيّ لمنشأةٍ مربوطة: الإيصال بالوسوم التسعة، والمستندُ الموقَّع محفوظٌ — والمزامنةُ المكرَّرة تعيد الرمزَ نفسه', async () => {
    const keys = await realKeys();
    await seedCredential(keys.privateKeyPem, keys.certBase64);

    const res = await sale().expect(201);
    invoiceIds.push(res.body.id);
    // السببُ يُطبع قبل التوكيد — سقوطٌ بلا سببه يُقاس مرتَين.
    if (!res.body.stamped) console.log(`stampError: ${res.body.stampError}`);
    expect(res.body.stamped).toBe(true);
    expect(res.body.stampError).toBeNull();
    const fields = decodeZatcaQr(res.body.receiptQr);
    // الوسوم ٦–٩ هي ما يجعله ختماً: تجزئة المستند وتوقيعه ومفتاحه العام وتوقيع الشهادة.
    expect(Object.keys(fields).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fields[1]).toBe(`مؤسسة الختم ${suffix}`);

    const stored = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: res.body.id }, select: { zatcaStatus: true, zatcaSignedXml: true, zatcaQrPayload: true, zatcaHash: true, zatcaIcv: true } }),
    );
    expect(stored.zatcaStatus).toBe('STAMPED');
    expect(stored.zatcaSignedXml).toContain('<ds:SignatureValue>');
    expect(stored.zatcaQrPayload).toBe(res.body.receiptQr);
    expect(stored.zatcaIcv).not.toBeNull();
    // الوسم ٦ = التجزئة المحفوظة — الرمز على الإيصال يُشير إلى المستند الذي سيُرسَل بعينه.
    expect(fields[6]).toBe(stored.zatcaHash);

    // ⭐ إعادةُ المزامنة بنفس المعرّف تعيد الرمزَ المحفوظ حرفاً — لا توقيعاً جديداً (`ق-١٩٦`).
    const again = await auth(request(app.getHttpServer()).post('/pos/sales/sync'))
      .send({ clientSaleId: randomUUID(), ringAt: new Date().toISOString(), ringOffsetMin: 180, lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(again.body.id);
    expect(again.body.stamped).toBe(true);
  }, 60000);

  it('② الإبلاغ يرفض مخزوناً تلف بعد التوقيع — بسببٍ مسمّى، ولا يُرسَل (ق-١٩٦/٤)', async () => {
    const res = await sale().expect(201);
    invoiceIds.push(res.body.id);
    expect(res.body.stamped).toBe(true);

    // تلفٌ في المتن بعد التوقيع: حرفٌ في اسم البائع داخل المستند المخزَّن — التوقيع على
    // SignedInfo يبقى صحيحاً، فلا يكشفه إلا إعادةُ التجزئة من البايتات.
    await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const row = await tx.invoice.findUniqueOrThrow({ where: { id: res.body.id }, select: { zatcaSignedXml: true } });
      const corrupted = row.zatcaSignedXml!.replace(`مؤسسة الختم ${suffix}`, `مؤسسة الختم ${suffix} X`);
      expect(corrupted).not.toBe(row.zatcaSignedXml);
      await tx.invoice.update({ where: { id: res.body.id }, data: { zatcaSignedXml: corrupted } });
    });

    // التلفُ عطلٌ عندنا لا جوابٌ من الهيئة (ق-٩٧١): يُرمى بسببه ولا يُكتب مردوداً — المستندُ
    // مختومٌ كما كان، والسببُ مكتوبٌ ليُرى، والخادمُ المحلّيّ لم يُطرَق.
    const before = authority.requests.length;
    const submit = await auth(request(app.getHttpServer()).post(`/zatca/invoices/${res.body.id}/submit`)).expect(503);
    expect(String(submit.body.message)).toContain(STORED_DOC_CORRUPT);
    const corruptRow = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: res.body.id }, select: { zatcaStatus: true, zatcaMessage: true, zatcaSubmittedAt: true } }),
    );
    expect(corruptRow.zatcaStatus).toBe('STAMPED');
    expect(corruptRow.zatcaMessage).toBe(STORED_DOC_CORRUPT);
    expect(corruptRow.zatcaSubmittedAt).toBeNull();
    expect(authority.requests.length).toBe(before);

    // الوجه الثاني: مستندٌ سليم يمرّ من الفحص ويصل الخادمَ — فيُردّ هناك (جواب 400) لا في الفحص.
    const healthy = await sale().expect(201);
    invoiceIds.push(healthy.body.id);
    const submitted = await auth(request(app.getHttpServer()).post(`/zatca/invoices/${healthy.body.id}/submit`)).expect(201);
    expect(submitted.body.zatcaStatus).toBe('REJECTED');
    expect(submitted.body.zatcaMessage).not.toBe(STORED_DOC_CORRUPT);
    expect(String(submitted.body.zatcaMessage)).toContain(STUB_REJECTION_MESSAGE);
    expect(authority.requests.length).toBe(before + 1);
  }, 60000);

  it('③ سقوطُ الختم لا يُسقط البيع: مفتاحٌ معطوب ⇒ إيصالٌ بالوسوم الخمسة وسببٌ للكاشير (ق-١٩٦/١)', async () => {
    const keys = await realKeys();
    await seedCredential('not-a-real-private-key', keys.certBase64);

    const res = await sale().expect(201);
    invoiceIds.push(res.body.id);
    expect(res.body.stamped).toBe(false);
    expect(typeof res.body.stampError).toBe('string');
    expect(res.body.stampError.length).toBeGreaterThan(0);
    // الإيصال يخرج — بالوسوم الخمسة لا التسعة.
    const fields = decodeZatcaQr(res.body.receiptQr);
    expect(Object.keys(fields).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

    const stored = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: res.body.id }, select: { zatcaStatus: true, zatcaSignedXml: true, status: true, zatcaMessage: true, zatcaIcv: true } }),
    );
    expect(stored.status).toBe('PAID'); // البيع تمّ
    expect(stored.zatcaSignedXml).toBeNull();
    // سقوطُ التوقيع ليس جواباً من الهيئة (ق-٩٧١): يُحرَّر الادّعاء ويُكتب السبب — لا مردودة.
    expect(stored.zatcaStatus).toBe('NOT_SUBMITTED');
    expect(stored.zatcaMessage).toBeTruthy();
    // والموقعُ يُحرَّر معه (ق-١١٩٨/⑦): السلفُ صار `ICV − 1` بعينه، وموقعٌ بلا بصمةٍ يحبس ما بعده —
    // فيأخذه التالي، ويأخذ هذا موقعاً جديداً حين يُعاد. (كان يبقى محفوظاً «للمحاولة التالية».)
    expect(stored.zatcaIcv).toBeNull();
  }, 60000);
});
