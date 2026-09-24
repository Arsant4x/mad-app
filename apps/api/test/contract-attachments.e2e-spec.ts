import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { FilesService } from '../src/files/files.service';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (17.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(55000);

/**
 * Files attached to a lease, stored in object storage.
 *
 * The property worth protecting is the same as the contract ledger itself: a
 * signed lease and a clearance letter are exactly the documents one must never
 * be able to list, open, or delete on another company's contract — not even by
 * guessing an id, since object storage has no RLS of its own.
 */
describe('Contract attachments (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let contractId: string;
  let attachmentId: string;
  let companyA: string;
  const ORIGINAL = '%PDF-1.4 signed lease';

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  function authA(req: request.Test) {
    return req.set('Authorization', `Bearer ${tokenA}`);
  }
  function authB(req: request.Test) {
    return req.set('Authorization', `Bearer ${tokenB}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
    companyA = loginA.body.user?.companyId;
    expect(typeof companyA).toBe('string');

    const property = await authA(request(app.getHttpServer()).post('/properties')).send({ name: `عقار المرفقات ${suffix}`, ownership: 'owned' }).expect(201);
    const unit = await authA(request(app.getHttpServer()).post('/units'))
      .send({ propertyId: property.body.id, unitNo: `ATT-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await authA(request(app.getHttpServer()).post('/contracts'))
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.body.id, customerId: await createTenantCustomer(app, tokenA, `مستأجر ${suffix}`), value: 12000, cycle: 'monthly', start: '2025-01-01', end: '2025-12-31' })
      .expect(201);
    contractId = contract.body.id;
  }, 60000);

  afterAll(async () => {
    if (attachmentId) await authA(request(app.getHttpServer()).delete(`/contracts/attachments/${attachmentId}`));
    await authA(request(app.getHttpServer()).post(`/contracts/${contractId}/cancel`)).send({
      cancelDate: '2025-12-31',
      cancelReason: 'تنظيف بيانات الاختبار',
      installmentDisposition: 'cancel',
    });
    await app.close();
  });

  it('[SPEC 11.2] uploads a document and lists it back', async () => {
    const res = await authA(request(app.getHttpServer()).post(`/contracts/${contractId}/attachments`))
      .attach('file', Buffer.from(ORIGINAL), { filename: `عقد موقّع ${suffix}.pdf`, contentType: 'application/pdf' })
      .expect(201);
    attachmentId = res.body.id;
    expect(res.body.filename).toContain(suffix);
    expect(res.body.mimeType).toBe('application/pdf');
    expect(res.body.size).toBeGreaterThan(0);

    const list = await authA(request(app.getHttpServer()).get(`/contracts/${contractId}/attachments`)).expect(200);
    expect((list.body as { id: string }[]).some((a) => a.id === attachmentId)).toBe(true);
  }, 40000);

  it('[SPEC 11.2] ⚖️ ق-١٣٦٥ يُنزَّل عبر الخادم مفكوكاً — بايتاتُه كما رُفعت، والمخزنُ يحمل الغلافَ لا النصّ', async () => {
    const res = await authA(request(app.getHttpServer()).get(`/contracts/attachments/${attachmentId}/download`))
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((res.body as Buffer).toString('utf8')).toBe(ORIGINAL);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toContain(encodeURIComponent(suffix));

    // المخزنُ نفسُه: الكائنُ في المقطع الحسّاس، وبايتاتُه غلافٌ (`mfb1`) لا يحمل النصَّ الأصليّ.
    const row = await app.get(TenantPrismaService).runInTenantContext(companyA, (tx) => tx.contractAttachment.findUniqueOrThrow({ where: { id: attachmentId }, select: { fileKey: true } }));
    expect(row.fileKey).toMatch(/^companies\/[^/]+\/sensitive\//);
    const files = app.get(FilesService) as unknown as { client: S3Client; bucket: string };
    const raw = Buffer.from(await (await files.client.send(new GetObjectCommand({ Bucket: files.bucket, Key: row.fileKey }))).Body!.transformToByteArray());
    expect(raw.subarray(0, 4).toString('ascii')).toBe('mfb1');
    expect(raw.includes(Buffer.from('signed lease'))).toBe(false);
  }, 40000);

  it('⚖️ ق-١٣٦٥ لا رابطَ موقَّعاً لمرفق عقد — «لا برابطٍ موقَّع»', async () => {
    const res = await authA(request(app.getHttpServer()).get(`/contracts/attachments/${attachmentId}/download-url`)).expect(403);
    expect(String(res.body.message)).toContain('المخزن الحسّاس');
  });

  it('refuses a file type outside the allow-list', async () => {
    await authA(request(app.getHttpServer()).post(`/contracts/${contractId}/attachments`))
      .attach('file', Buffer.from('#!/bin/sh\necho hi'), { filename: 'evil.sh', contentType: 'application/x-sh' })
      .expect(400);
  }, 40000);

  it('never lets one company reach another\'s attachments', async () => {
    // B can't list A's contract attachments — the contract is invisible to it.
    await authB(request(app.getHttpServer()).get(`/contracts/${contractId}/attachments`)).expect(404);
    // Nor download by guessing the attachment id — neither the old signed link nor the server stream.
    await authB(request(app.getHttpServer()).get(`/contracts/attachments/${attachmentId}/download-url`)).expect(404);
    await authB(request(app.getHttpServer()).get(`/contracts/attachments/${attachmentId}/download`)).expect(404);
    // Nor delete it.
    await authB(request(app.getHttpServer()).delete(`/contracts/attachments/${attachmentId}`)).expect(404);

    // And after all that, A's attachment is still there.
    const list = await authA(request(app.getHttpServer()).get(`/contracts/${contractId}/attachments`)).expect(200);
    expect((list.body as { id: string }[]).some((a) => a.id === attachmentId)).toBe(true);
  }, 40000);

  it('[SPEC 11.2] deletes the attachment', async () => {
    await authA(request(app.getHttpServer()).delete(`/contracts/attachments/${attachmentId}`)).expect(204);
    const list = await authA(request(app.getHttpServer()).get(`/contracts/${contractId}/attachments`)).expect(200);
    expect((list.body as { id: string }[]).some((a) => a.id === attachmentId)).toBe(false);
    attachmentId = '';
  }, 40000);
});
