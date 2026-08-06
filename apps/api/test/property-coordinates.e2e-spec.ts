import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Coordinates are what put a property on the map. The columns and DTO fields
 * already existed but nothing ever wrote them, so these lock in the round-trip
 * before the map screen starts depending on it.
 */
describe('Property coordinates (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const createdIds: string[] = [];

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
  }, 30000);

  afterAll(async () => {
    for (const id of createdIds) {
      await request(app.getHttpServer()).delete(`/properties/${id}`).set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('stores coordinates on create and returns them in the list', async () => {
    const created = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار الخريطة ${suffix}`, ownership: 'owned', lat: 24.7136, lng: 46.6753 })
      .expect(201);
    createdIds.push(created.body.id);

    expect(created.body.lat).toBeCloseTo(24.7136);
    expect(created.body.lng).toBeCloseTo(46.6753);

    // The map reads the list endpoint, not the detail one.
    const list = await request(app.getHttpServer()).get('/properties').set('Authorization', `Bearer ${token}`).expect(200);
    const row = list.body.find((p: { id: string }) => p.id === created.body.id);
    expect(row.lat).toBeCloseTo(24.7136);
  }, 30000);

  it('adds coordinates to a property that had none', async () => {
    const created = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار بلا إحداثيات ${suffix}`, ownership: 'owned' })
      .expect(201);
    createdIds.push(created.body.id);

    // Null, not 0 — a property with no coordinates must be distinguishable
    // from one at the equator, since the map skips the first and pins the second.
    expect(created.body.lat).toBeNull();

    const updated = await request(app.getHttpServer())
      .patch(`/properties/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: 21.4225, lng: 39.8262 })
      .expect(200);

    expect(updated.body.lat).toBeCloseTo(21.4225);
    expect(updated.body.lng).toBeCloseTo(39.8262);
  }, 30000);

  it('rejects a non-numeric coordinate', async () => {
    await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار خاطئ ${suffix}`, ownership: 'owned', lat: 'الرياض' })
      .expect(400);
  }, 30000);
});
