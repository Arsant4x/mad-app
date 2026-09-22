import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { GENESIS_PREVIOUS_HASH } from '../src/zatca/hash-chain.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (14.1 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(45000);

/**
 * The six-document conformance run: obtaining a compliance CSID must be
 * followed, in the same flow, by one passing sample of every document kind —
 * standard/simplified × invoice/credit/debit — because the authority refuses
 * a production CSID until all six pass.
 *
 * The authority itself is a local mock here (ZATCA_API_BASE_OVERRIDE), which
 * is exactly what makes the six submissions *observable*: every request body
 * the flow sends is captured and taken apart.
 */
describe('ZATCA onboarding — six-document compliance check (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;

  let mock: Server;
  let complianceSubmissions: { invoiceHash: string; uuid: string; invoice: string }[] = [];
  /** When set, the Nth (1-based) /compliance/invoices call is rejected. */
  let failAtSubmission: number | null = null;
  let certificateBase64: string;

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';

    // A certificate of the right shape for the mock to issue — the flow signs
    // the six samples with it, so it must parse as real X.509.
    const webcrypto = new Crypto();
    x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);
    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      {
        serialNumber: '03',
        name: 'CN=mad-app-mock-authority, C=SA',
        notBefore: new Date('2026-01-01'),
        notAfter: new Date('2027-01-01'),
        keys,
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
      },
      webcrypto as unknown as globalThis.Crypto,
    );
    certificateBase64 = Buffer.from(cert.rawData).toString('base64');

    mock = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url?.endsWith('/compliance')) {
          // `requestID` identifies this conformance run, and the production
          // step refuses to send without it (see requestProductionCertificate)
          // — a mock that omits it makes the flow untestable past the samples.
          // Numeric here because that is the shape the authority returns.
          res.end(JSON.stringify({ binarySecurityToken: certificateBase64, secret: 'mock-compliance-secret', requestID: 1234567890123 }));
          return;
        }
        if (req.url?.endsWith('/compliance/invoices')) {
          complianceSubmissions.push(JSON.parse(raw));
          if (failAtSubmission !== null && complianceSubmissions.length === failAtSubmission) {
            res.statusCode = 400;
            res.end(JSON.stringify({ errors: [{ message: 'mock validation failure' }] }));
            return;
          }
          res.end(JSON.stringify({}));
          return;
        }
        if (req.url?.endsWith('/production/csids')) {
          res.end(JSON.stringify({ binarySecurityToken: certificateBase64, secret: 'mock-production-secret' }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({}));
      });
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    process.env.ZATCA_API_BASE_OVERRIDE = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    tenantPrisma = app.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;

    /**
     * ── اكتفاءٌ ذاتي: لا تفترض ما لم تصنعه ─────────────────────────────────
     *
     * `/zatca/onboarding/start` يرفض بـ`400` (`zatca_profile_incomplete`) ما
     * لم يكن للمنشأة **اسمٌ نظاميّ ورقمٌ ضريبي**، **والبذرةُ لا تملؤهما**.
     * فكانت هذه المجموعة تنجح **فقط إن سبقتها** مجموعةٌ تكتب ملفَّ المنشأة.
     *
     * ⚠️ **وظهر حين تغيّر ترتيبُ الملفات** بإضافة مجموعةٍ جديدة — **لا بعطلٍ
     * في الميزة**: وهي عائلةُ «توكيدٌ يفترض ما تركه غيرُه» (`ق-٢٩٨`)، ونظيرُها
     * موثَّقٌ في `zatca-phase2` بنصّه.
     */
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'شركة الأفق التجارية', vatNumber: '300000000000003' })
      .expect(200);

    await clearCredential();
  }, 30000);

  afterAll(async () => {
    await clearCredential();
    delete process.env.ZATCA_API_BASE_OVERRIDE;
    await new Promise<void>((resolve) => mock.close(() => resolve()));
    await app.close();
  });

  function clearCredential() {
    return tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
  }

  function xmlOf(submission: { invoice: string }): string {
    return Buffer.from(submission.invoice, 'base64').toString('utf8');
  }

  function pihOf(xml: string): string {
    const match = xml.match(/<cbc:ID>PIH<\/cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text\/plain">([^<]+)</);
    expect(match).toBeTruthy();
    return match![1];
  }

  it('submits exactly six samples — standard and simplified, each as invoice, credit and debit note — and lands on COMPLIANCE_ISSUED', async () => {
    complianceSubmissions = [];
    failAtSubmission = null;

    await request(app.getHttpServer()).post('/zatca/onboarding/start').set('Authorization', `Bearer ${token}`).send({ environment: 'SANDBOX' }).expect(201);
    const res = await request(app.getHttpServer()).post('/zatca/onboarding/otp').set('Authorization', `Bearer ${token}`).send({ otp: '123456' }).expect(201);

    expect(res.body.status).toBe('COMPLIANCE_ISSUED');
    expect(res.body.lastError).toBeNull();
    expect(complianceSubmissions).toHaveLength(6);

    // The exact conformance matrix, in order: type code × transaction code.
    const expected = [
      { code: '388', name: '0100000' },
      { code: '381', name: '0100000' },
      { code: '383', name: '0100000' },
      { code: '388', name: '0200000' },
      { code: '381', name: '0200000' },
      { code: '383', name: '0200000' },
    ];
    const xmls = complianceSubmissions.map(xmlOf);
    xmls.forEach((xml, i) => {
      expect(xml).toContain(`<cbc:InvoiceTypeCode name="${expected[i].name}">${expected[i].code}</cbc:InvoiceTypeCode>`);
    });

    // Every note sample carries the original reference and a reason; the
    // plain invoices carry neither.
    for (const i of [1, 2, 4, 5]) {
      expect(xmls[i]).toContain('<cac:BillingReference>');
      expect(xmls[i]).toContain('<cbc:InstructionNote>');
    }
    for (const i of [0, 3]) {
      expect(xmls[i]).not.toContain('<cac:BillingReference>');
    }

    // The samples form one chain, ICV 1→6 from the genesis hash — each
    // document embeds as PIH exactly the hash the previous submission
    // declared for itself.
    expect(pihOf(xmls[0])).toBe(GENESIS_PREVIOUS_HASH);
    for (let i = 1; i < 6; i++) {
      expect(pihOf(xmls[i])).toBe(complianceSubmissions[i - 1].invoiceHash);
      expect(xmls[i]).toContain(`<cbc:UUID>${i + 1}</cbc:UUID>`); // ICV
    }

    // With all six passed, the production step goes through.
    const production = await request(app.getHttpServer()).post('/zatca/onboarding/production').set('Authorization', `Bearer ${token}`).expect(201);
    expect(production.body.status).toBe('PRODUCTION_ISSUED');
  }, 60000);

  it('stops at the first failing sample and surfaces which one failed', async () => {
    await clearCredential();
    complianceSubmissions = [];
    failAtSubmission = 4; // the simplified invoice sample

    await request(app.getHttpServer()).post('/zatca/onboarding/start').set('Authorization', `Bearer ${token}`).send({ environment: 'SANDBOX' }).expect(201);
    const res = await request(app.getHttpServer()).post('/zatca/onboarding/otp').set('Authorization', `Bearer ${token}`).send({ otp: '123456' }).expect(201);

    expect(res.body.status).toBe('FAILED');
    // Which sample failed is the actionable part of the message.
    expect(res.body.lastError).toContain('simplified/invoice');
    expect(res.body.lastError).toContain('mock validation failure');
    // Sequential and aborted: nothing after the failing sample was sent.
    expect(complianceSubmissions).toHaveLength(4);
  }, 60000);
});
