import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Suppliers + purchase invoices: tenant isolation, duplicate-name rejection,
 * server-side tax computation, and the FK-restrict guard that stops deleting
 * a supplier that still has purchases.
 */
describe('Suppliers/Purchases tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('[SPEC 5.1] creates a supplier, rejects a duplicate name, and keeps it invisible to company B', async () => {
    const uniqueName = `مورد اختبار ${Date.now()}`;
    const created = await request(app.getHttpServer()).post('/suppliers').set('Authorization', `Bearer ${tokenA}`).send({ name: uniqueName }).expect(201);

    await request(app.getHttpServer()).post('/suppliers').set('Authorization', `Bearer ${tokenA}`).send({ name: uniqueName }).expect(409);

    const resB = await request(app.getHttpServer()).get('/suppliers').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((s: { id: string }) => s.id === created.body.id)).toBe(false);

    await request(app.getHttpServer()).delete(`/suppliers/${created.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  }, 20000);

  it('[SPEC 5.1 6.1] computes purchase tax/total server-side, isolates it from company B, and blocks supplier deletion while it exists', async () => {
    const supplier = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `مورد فاتورة ${Date.now()}` })
      .expect(201);

    const purchase = await request(app.getHttpServer())
      .post('/purchases')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ supplierId: supplier.body.id, date: '2026-07-01', category: 'اختبار', subtotal: 800, exempt: false })
      .expect(201);

    expect(Number(purchase.body.taxAmount)).toBeCloseTo(120, 2); // 800 * 0.15
    expect(Number(purchase.body.total)).toBeCloseTo(920, 2);

    const resB = await request(app.getHttpServer()).get('/purchases').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((p: { id: string }) => p.id === purchase.body.id)).toBe(false);

    await request(app.getHttpServer()).delete(`/suppliers/${supplier.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);

    // الحالةُ مشتقّةٌ من تخصيصات سندات الصرف (ق-٨٧٢) — شراءٌ جديد `DUE` بلا مسدَّد، والعلَمُ
    // القديم (`paid`) صار مرفوضاً من الصمّام لا متجاهَلاً (ق-٨٧٤).
    expect(purchase.body.status).toBe('DUE');
    const listed = (await request(app.getHttpServer()).get('/purchases').set('Authorization', `Bearer ${tokenA}`).expect(200)).body.find(
      (p: { id: string }) => p.id === purchase.body.id,
    );
    // ② نصٌّ بخانتين (`ق-١٢٣٥`).
    expect({ allocated: listed.allocated, remaining: listed.remaining }).toEqual({ allocated: '0.00', remaining: '920.00' });
    await request(app.getHttpServer())
      .patch(`/purchases/${purchase.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ paid: true, paidDate: '2026-07-05' })
      .expect(400);

    // ⚖️ الحذفُ إلغاءٌ بقيد عكس (`ق-٩٩٧`/②): الصفُّ يبقى مُلغىً — فمورّدُه يبقى محجوزاً بمستنده ولا يُحذف.
    await request(app.getHttpServer()).delete(`/purchases/${purchase.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
    const voided = (await request(app.getHttpServer()).get('/purchases').set('Authorization', `Bearer ${tokenA}`).expect(200)).body.find(
      (p: { id: string }) => p.id === purchase.body.id,
    );
    expect(voided.voidedAt).toBeTruthy();
    expect(voided.remaining).toBe('0.00');
    await request(app.getHttpServer()).delete(`/suppliers/${supplier.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);
  }, 20000);
});
