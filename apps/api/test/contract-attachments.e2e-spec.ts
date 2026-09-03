import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

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

    const property = await authA(request(app.getHttpServer()).post('/properties')).send({ name: `عقار المرفقات ${suffix}`, ownership: 'owned' }).expect(201);
    const unit = await authA(request(app.getHttpServer()).post('/units'))
      .send({ propertyId: property.body.id, unitNo: `ATT-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await authA(request(app.getHttpServer()).post('/contracts'))
      .send({ unitId: unit.body.id, tenant: `مستأجر ${suffix}`, value: 12000, cycle: 'monthly', start: '2025-01-01', end: '2025-12-31' })
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
      .attach('file', Buffer.from('%PDF-1.4 signed lease'), { filename: `عقد موقّع ${suffix}.pdf`, contentType: 'application/pdf' })
      .expect(201);
    attachmentId = res.body.id;
    expect(res.body.filename).toContain(suffix);
    expect(res.body.mimeType).toBe('application/pdf');
    expect(res.body.size).toBeGreaterThan(0);

    const list = await authA(request(app.getHttpServer()).get(`/contracts/${contractId}/attachments`)).expect(200);
    expect((list.body as { id: string }[]).some((a) => a.id === attachmentId)).toBe(true);
  }, 40000);

  it('[SPEC 11.2] hands back a short-lived signed download URL', async () => {
    const res = await authA(request(app.getHttpServer()).get(`/contracts/attachments/${attachmentId}/download-url`)).expect(200);
    expect(res.body.url).toMatch(/^https?:\/\//);
    expect(res.body.expiresInSeconds).toBeGreaterThan(0);
  }, 40000);

  it('refuses a file type outside the allow-list', async () => {
    await authA(request(app.getHttpServer()).post(`/contracts/${contractId}/attachments`))
      .attach('file', Buffer.from('#!/bin/sh\necho hi'), { filename: 'evil.sh', contentType: 'application/x-sh' })
      .expect(400);
  }, 40000);

  it('never lets one company reach another\'s attachments', async () => {
    // B can't list A's contract attachments — the contract is invisible to it.
    await authB(request(app.getHttpServer()).get(`/contracts/${contractId}/attachments`)).expect(404);
    // Nor download by guessing the attachment id.
    await authB(request(app.getHttpServer()).get(`/contracts/attachments/${attachmentId}/download-url`)).expect(404);
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
