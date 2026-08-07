import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * مستند §5 — مستندات فاتورة المصروف: رفع حقيقي إلى التخزين، رابط تنزيل موقَّع،
 * وحذف يطهّر الصف. العزل بين المستأجرين مُثبت بمحاولة جارٍ الوصول لمرفق ليس له.
 */
describe('Purchase attachments (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let supplierId: string;
  let purchaseId: string;
  let attachmentId: string;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tokenA = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' })).body.accessToken;

    supplierId = (await authA(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورد تأسيس ${suffix}` }).expect(201)).body.id;
    purchaseId = (
      await authA(request(app.getHttpServer()).post('/purchases'))
        .send({ supplierId, date: '2025-05-01', category: 'مصروفات تأسيس', subtotal: 5000, exempt: false, excludeFromVat: false, amortize: false, incorpItem: 'رسوم ترخيص' })
        .expect(201)
    ).body.id;
  }, 60000);

  afterAll(async () => {
    await authA(request(app.getHttpServer()).delete(`/purchases/${purchaseId}`));
    await authA(request(app.getHttpServer()).delete(`/suppliers/${supplierId}`));
    await authA(request(app.getHttpServer()).delete(`/trash/suppliers/${supplierId}`));
    await app.close();
  });

  it('uploads a founding-invoice document and lists it', async () => {
    const res = await authA(request(app.getHttpServer()).post(`/purchases/${purchaseId}/attachments`))
      .attach('file', Buffer.from('%PDF-1.4 fake founding invoice'), { filename: `فاتورة-ترخيص-${suffix}.pdf`, contentType: 'application/pdf' })
      .expect(201);
    attachmentId = res.body.id;
    expect(res.body.filename).toContain('فاتورة-ترخيص');

    const list = await authA(request(app.getHttpServer()).get(`/purchases/${purchaseId}/attachments`)).expect(200);
    expect(list.body.map((a: { id: string }) => a.id)).toContain(attachmentId);
  }, 60000);

  it('serves a signed download URL that actually returns the bytes', async () => {
    const { body } = await authA(request(app.getHttpServer()).get(`/purchases/attachments/${attachmentId}/download-url`)).expect(200);
    expect(body.url).toBeTruthy();
    const download = await fetch(body.url);
    expect(download.status).toBe(200);
    expect(await download.text()).toContain('fake founding invoice');
  }, 60000);

  it('a neighbour company cannot list, sign, or delete the attachment', async () => {
    const authB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);
    await authB(request(app.getHttpServer()).get(`/purchases/${purchaseId}/attachments`)).expect(404);
    await authB(request(app.getHttpServer()).get(`/purchases/attachments/${attachmentId}/download-url`)).expect(404);
    await authB(request(app.getHttpServer()).delete(`/purchases/attachments/${attachmentId}`)).expect(404);
  }, 60000);

  it('deletes the attachment and the list empties', async () => {
    await authA(request(app.getHttpServer()).delete(`/purchases/attachments/${attachmentId}`)).expect(204);
    const list = await authA(request(app.getHttpServer()).get(`/purchases/${purchaseId}/attachments`)).expect(200);
    expect(list.body).toHaveLength(0);
  }, 60000);
});
