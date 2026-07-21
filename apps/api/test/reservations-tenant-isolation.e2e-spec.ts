import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Reservations (e2e)', () => {
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

  async function setupUnit(token: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار حجوزات ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `U-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    return unit.body;
  }

  it('reserves a vacant unit and rejects a second active reservation on the same unit', async () => {
    const unit = await setupUnit(tokenA);

    const reservation = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'خالد المطيري', deposit: 500, expiryDate: '2030-01-01' })
      .expect(201);
    expect(reservation.body.status).toBe('ACTIVE');

    await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'شخص آخر', expiryDate: '2030-02-01' })
      .expect(409);
  });

  it('rejects reserving a unit that is currently rented', async () => {
    const unit = await setupUnit(tokenA);
    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'مستأجر حالي', value: 1000, cycle: 'monthly', start: '2020-01-01', end: '2035-12-31' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'محاولة حجز', expiryDate: '2036-01-01' })
      .expect(409);
  });

  it('rejects a contract on a reserved unit under a different name, but converts the reservation when the name matches', async () => {
    const unit = await setupUnit(tokenA);
    await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'سعود العتيبي', expiryDate: '2030-01-01' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'مستأجر مختلف', value: 1000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'سعود العتيبي', value: 1000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31' })
      .expect(201);

    const reservations = await request(app.getHttpServer()).get('/reservations').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const converted = reservations.body.find((r: { unitId: string }) => r.unitId === unit.id);
    expect(converted.status).toBe('CONVERTED');

    // The unit is free to reserve again under a new name now that the old
    // reservation is no longer ACTIVE — but it's rented, so this should 409
    // for the "currently rented" reason instead, proving the unit isn't
    // double-countable as both reserved and rented.
    await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'شخص جديد', expiryDate: '2030-01-01' })
      .expect(409);
  });

  it('cancelling a reservation frees the unit up for a new reservation', async () => {
    const unit = await setupUnit(tokenA);
    const reservation = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'حجز للإلغاء', expiryDate: '2030-01-01' })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .patch(`/reservations/${reservation.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(cancelled.body.status).toBe('EXPIRED');

    await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'حجز جديد', expiryDate: '2030-06-01' })
      .expect(201);
  });

  it("keeps company B from seeing, cancelling, or reserving against company A's units/reservations", async () => {
    const unit = await setupUnit(tokenA);
    const reservation = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, name: 'عزل بين الشركات', expiryDate: '2030-01-01' })
      .expect(201);

    const listB = await request(app.getHttpServer()).get('/reservations').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(listB.body.some((r: { id: string }) => r.id === reservation.body.id)).toBe(false);

    await request(app.getHttpServer())
      .patch(`/reservations/${reservation.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ unitId: unit.id, name: 'محاولة عبور الشركات', expiryDate: '2030-01-01' })
      .expect(404);
  });
});
