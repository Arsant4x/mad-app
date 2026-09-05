import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { decodeZatcaQr } from '../src/zatca/qr.util';
import { STORED_DOC_CORRUPT } from '../src/zatca/zatca.service';

/**
 * ⑤ الختم المتزامن (`ق-١٨٧` · `ق-١٩٦`) — على الخدمة الحقيقية بمفاتيحٍ حقيقية:
 *
 * ① بيعٌ حيّ لمنشأةٍ مربوطة يخرج إيصاله **بالوسوم التسعة**، والمستندُ الموقَّع محفوظ.
 * ② الإبلاغ يُرسل المحفوظ؛ وإن تلف المخزونُ بعد التوقيع **لا يُرسَل** — يُردّ بسببٍ
 *    مسمّى (`ق-١٩٦`/٤: من عطلٍ لا من نيّة).
 * ③ سقوطُ الختم (مفتاحٌ معطوب) **لا يُسقط البيع**: إيصالٌ بالوسوم الخمسة وسببٌ للكاشير
 *    (`ق-١٩٦`/١).
 *
 * ⛔ لا شبكةَ هيئة: `ZATCA_API_BASE_OVERRIDE` على منفذٍ لا يستمع أحدٌ عليه — التوقيع
 * حقيقي، والإرسال وحده يسقط (كحزمة `zatca-phase2`).
 */
describe('ZATCA synchronous stamp at sale (e2e)', () => {
  let app: INestApplication;
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
    process.env.ZATCA_API_BASE_OVERRIDE = 'http://127.0.0.1:9';

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
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ name: `صنف ختم ${suffix}`, price: 100 }).expect(201)).body.id;
    const open = await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 0 });
    if (open.status !== 201 && open.status !== 409) throw new Error(`تعذّر فتح مناوبة: ${open.status}`);
    if (open.status === 201) openedShiftId = open.body.id;
  }, 60000);

  afterAll(async () => {
    delete process.env.ZATCA_API_BASE_OVERRIDE;
    // ما فُتح هنا يُغلق هنا — مناوبةٌ مفتوحة تُسقط حزمةَ الكاشير التالية بـ409 (قِيس على قاعدةٍ نظيفة).
    if (openedShiftId) await auth(request(app.getHttpServer()).post(`/pos/shifts/${openedShiftId}/close`)).send({ declaredClosing: 0 }).catch(() => undefined);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } })).catch(() => undefined);
    // الفواتير المختومة تحمل موقعاً في السلسلة فلا تُحذف (حارس الحذف) — تبقى في
    // المنشأة التجريبية كغيرها من بقايا الاختبارات؛ والصنف يُحذف حذفاً ناعماً فقط،
    // فبنودُها تشير إليه ومسحُه من السلة يُرفض بالقيد المرجعي (سلوكٌ مقصود).
    for (const id of invoiceIds) await auth(request(app.getHttpServer()).delete(`/invoices/${id}`)).catch(() => undefined);
    await auth(request(app.getHttpServer()).delete(`/products/${productId}`)).catch(() => undefined);
    await app.close();
  });

  it('① بيعٌ حيّ لمنشأةٍ مربوطة: الإيصال بالوسوم التسعة، والمستندُ الموقَّع محفوظٌ — والمزامنةُ المكرَّرة تعيد الرمزَ نفسه', async () => {
    const keys = await realKeys();
    await seedCredential(keys.privateKeyPem, keys.certBase64);

    const res = await sale().expect(201);
    invoiceIds.push(res.body.id);
    expect(res.body.zatcaStamped).toBe(true);
    expect(res.body.stampError).toBeNull();
    const fields = decodeZatcaQr(res.body.zatcaQr);
    // الوسوم ٦–٩ هي ما يجعله ختماً: تجزئة المستند وتوقيعه ومفتاحه العام وتوقيع الشهادة.
    expect(Object.keys(fields).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fields[1]).toBe(`مؤسسة الختم ${suffix}`);

    const stored = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: res.body.id }, select: { zatcaStatus: true, zatcaSignedXml: true, zatcaQrPayload: true, zatcaHash: true, zatcaIcv: true } }),
    );
    expect(stored.zatcaStatus).toBe('STAMPED');
    expect(stored.zatcaSignedXml).toContain('<ds:SignatureValue>');
    expect(stored.zatcaQrPayload).toBe(res.body.zatcaQr);
    expect(stored.zatcaIcv).not.toBeNull();
    // الوسم ٦ = التجزئة المحفوظة — الرمز على الإيصال يُشير إلى المستند الذي سيُرسَل بعينه.
    expect(fields[6]).toBe(stored.zatcaHash);

    // ⭐ إعادةُ المزامنة بنفس المعرّف تعيد الرمزَ المحفوظ حرفاً — لا توقيعاً جديداً (`ق-١٩٦`).
    const again = await auth(request(app.getHttpServer()).post('/pos/sales/sync'))
      .send({ clientSaleId: randomUUID(), ringAt: new Date().toISOString(), ringOffsetMin: 180, lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(again.body.id);
    expect(again.body.zatcaStamped).toBe(true);
  }, 60000);

  it('② الإبلاغ يرفض مخزوناً تلف بعد التوقيع — بسببٍ مسمّى، ولا يُرسَل (ق-١٩٦/٤)', async () => {
    const res = await sale().expect(201);
    invoiceIds.push(res.body.id);
    expect(res.body.zatcaStamped).toBe(true);

    // تلفٌ في المتن بعد التوقيع: حرفٌ في اسم البائع داخل المستند المخزَّن — التوقيع على
    // SignedInfo يبقى صحيحاً، فلا يكشفه إلا إعادةُ التجزئة من البايتات.
    await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const row = await tx.invoice.findUniqueOrThrow({ where: { id: res.body.id }, select: { zatcaSignedXml: true } });
      const corrupted = row.zatcaSignedXml!.replace(`مؤسسة الختم ${suffix}`, `مؤسسة الختم ${suffix} X`);
      expect(corrupted).not.toBe(row.zatcaSignedXml);
      await tx.invoice.update({ where: { id: res.body.id }, data: { zatcaSignedXml: corrupted } });
    });

    const submit = await auth(request(app.getHttpServer()).post(`/zatca/invoices/${res.body.id}/submit`)).expect(201);
    expect(submit.body.zatcaStatus).toBe('REJECTED');
    expect(submit.body.zatcaMessage).toBe(STORED_DOC_CORRUPT);

    // الوجه الثاني: مستندٌ سليم يمرّ من الفحص ويصل إلى الشبكة — فيسقط هناك (المنفذ ٩) لا في الفحص.
    const healthy = await sale().expect(201);
    invoiceIds.push(healthy.body.id);
    const submitted = await auth(request(app.getHttpServer()).post(`/zatca/invoices/${healthy.body.id}/submit`)).expect(201);
    expect(submitted.body.zatcaStatus).toBe('REJECTED');
    expect(submitted.body.zatcaMessage).not.toBe(STORED_DOC_CORRUPT);
    expect(String(submitted.body.zatcaMessage)).toMatch(/fetch|ECONNREFUSED|failed/i);
  }, 60000);

  it('③ سقوطُ الختم لا يُسقط البيع: مفتاحٌ معطوب ⇒ إيصالٌ بالوسوم الخمسة وسببٌ للكاشير (ق-١٩٦/١)', async () => {
    const keys = await realKeys();
    await seedCredential('not-a-real-private-key', keys.certBase64);

    const res = await sale().expect(201);
    invoiceIds.push(res.body.id);
    expect(res.body.zatcaStamped).toBe(false);
    expect(typeof res.body.stampError).toBe('string');
    expect(res.body.stampError.length).toBeGreaterThan(0);
    // الإيصال يخرج — بالوسوم الخمسة لا التسعة.
    const fields = decodeZatcaQr(res.body.zatcaQr);
    expect(Object.keys(fields).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

    const stored = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: res.body.id }, select: { zatcaStatus: true, zatcaSignedXml: true, status: true } }),
    );
    expect(stored.status).toBe('PAID'); // البيع تمّ
    expect(stored.zatcaSignedXml).toBeNull();
    expect(stored.zatcaStatus).toBe('REJECTED'); // مردودٌ بسببه، والموقع محفوظ للمحاولة التالية
  }, 60000);
});
