import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * The condition-of-unit form. Its entire value is being unarguable later — so
 * what these lock in is the *lock itself*: once signed, nothing about the form
 * can change, and the signing time comes from the server rather than whoever
 * happens to be filing it.
 */
describe('Contract handover forms (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function createHandover(type: 'DELIVERY' | 'RECEIPT', items: { label: string; condition: string; note?: string }[] = []) {
    return request(app.getHttpServer())
      .post(`/contracts/${contractId}/handovers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type, date: '2026-01-01', electricityMeter: '12345', waterMeter: '678', items })
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;

    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار التسليم ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `HO-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: unit.body.id,
        tenant: `مستأجر التسليم ${suffix}`,
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
      })
      .expect(201);
    contractId = contract.body.id;
  }, 60000);

  afterAll(async () => {
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-12-31', cancelReason: 'تنظيف بيانات الاختبار', installmentDisposition: 'cancel' });
    await app.close();
  });

  it('[SPEC 16.14] starts as a draft with its items and meter readings', async () => {
    const res = await createHandover('DELIVERY', [
      { label: 'المطبخ', condition: 'GOOD' },
      { label: 'المكيّف', condition: 'FAIR', note: 'يحتاج تنظيف' },
    ]);

    const handover = res.body.handovers[0];
    expect(handover.status).toBe('DRAFT');
    expect(handover.signedAt).toBeNull();
    expect(handover.electricityMeter).toBe('12345');
    expect(handover.items).toHaveLength(2);
    expect(handover.items.map((i: { condition: string }) => i.condition)).toEqual(['GOOD', 'FAIR']);
  }, 30000);

  it('[SPEC 16.14] lets a draft be edited, replacing the item list wholesale', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const draft = contract.body.handovers.find((h: { status: string }) => h.status === 'DRAFT');

    const res = await request(app.getHttpServer())
      .patch(`/contracts/${contractId}/handovers/${draft.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        electricityMeter: '12999',
        notes: 'أُعيد الفحص',
        items: [{ label: 'المطبخ', condition: 'DAMAGED', note: 'كسر بالرخام' }],
      })
      .expect(200);

    const updated = res.body.handovers.find((h: { id: string }) => h.id === draft.id);
    expect(updated.electricityMeter).toBe('12999');
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].condition).toBe('DAMAGED');
  }, 30000);

  it('[SPEC 11.5 16.15] stamps the signing time from the server clock, not the caller', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const draft = contract.body.handovers.find((h: { status: string }) => h.status === 'DRAFT');

    const before = Date.now();
    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/handovers/${draft.id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ signedBy: 'أبو محمد — المستأجر' })
      .expect(201);
    const after = Date.now();

    const signed = res.body.handovers.find((h: { id: string }) => h.id === draft.id);
    expect(signed.status).toBe('SIGNED');
    expect(signed.signedBy).toBe('أبو محمد — المستأجر');
    // The signing endpoint takes no timestamp at all — this proves the value
    // came from the server, which is what makes it worth anything in a dispute.
    const signedAt = new Date(signed.signedAt).getTime();
    expect(signedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(signedAt).toBeLessThanOrEqual(after + 1000);
  }, 30000);

  it('[SPEC 11.5 16.15] refuses every change to a signed form', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const signed = contract.body.handovers.find((h: { status: string }) => h.status === 'SIGNED');

    // Editing the readings — the single most tempting thing to fudge later.
    const edit = await request(app.getHttpServer())
      .patch(`/contracts/${contractId}/handovers/${signed.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ electricityMeter: '00000' })
      .expect(409);
    expect(edit.body.message).toContain('موقَّع');

    // Re-signing, to move the timestamp.
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/handovers/${signed.id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ signedBy: 'شخص آخر' })
      .expect(409);

    // Deleting it outright.
    await request(app.getHttpServer()).delete(`/contracts/${contractId}/handovers/${signed.id}`).set('Authorization', `Bearer ${token}`).expect(409);

    // And the stored form is genuinely unchanged.
    const after = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const stillThere = after.body.handovers.find((h: { id: string }) => h.id === signed.id);
    expect(stillThere.electricityMeter).toBe('12999');
    expect(stillThere.signedBy).toBe('أبو محمد — المستأجر');
  }, 30000);

  it('deletes a draft, since nothing has been agreed yet', async () => {
    const created = await createHandover('RECEIPT');
    const draft = created.body.handovers.find((h: { status: string }) => h.status === 'DRAFT');

    const res = await request(app.getHttpServer())
      .delete(`/contracts/${contractId}/handovers/${draft.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.handovers.find((h: { id: string }) => h.id === draft.id)).toBeUndefined();
  }, 30000);

  it('[SPEC 16.14] keeps delivery and receipt as separate forms on the same lease', async () => {
    await createHandover('RECEIPT', [{ label: 'المطبخ', condition: 'GOOD' }]);

    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const types = contract.body.handovers.map((h: { type: string }) => h.type);
    expect(types).toContain('DELIVERY');
    expect(types).toContain('RECEIPT');
  }, 30000);

  it('rejects a blank item label and an unknown condition', async () => {
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/handovers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DELIVERY', date: '2026-01-01', items: [{ label: '   ', condition: 'GOOD' }] })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/handovers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'DELIVERY', date: '2026-01-01', items: [{ label: 'المطبخ', condition: 'BROKEN_ISH' }] })
      .expect(400);
  }, 30000);
});
