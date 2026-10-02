import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(120000);

/**
 * ⚖️ **شطبُ التالف يحتاج شخصين افتراضاً، والمنشأةُ ذاتُ الشخص الواحد تُطفئه بنفسها** (توجيه ٢٧٥ · `ق-١٥٨٣`، بحكم صاحب المشروع).
 *
 * كان الافتراضُ الاعتمادَ الذاتيّ (`writeOffRequiresTwoPersons = false`)، ولا مفتاحَ له في الواجهة — فعُرض في توجيه ٢٧٤ سياسةً
 * ولم يُبنَ. والحكمُ الآن: منشأةٌ جديدةٌ تولد بشخصين، ومن يسجّل الشطبَ لا يعتمده؛ وصاحبُ المنشأة يطفئه من إعداداتها.
 */
describe('شطبُ التالف بشخصين افتراضاً (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const NO_ADJUSTMENT = WRITEOFF_REASONS.find((r) => r.taxPath === 'NO_ADJUSTMENT')!;
  let productId: string;
  let warehouseId: string;

  const record = async (): Promise<{ id: string; no: string }> =>
    (
      await auth(http().post('/inventory/write-offs'))
        .send({ productId, warehouseId, qty: 1, reasonCode: NO_ADJUSTMENT.code, occurredAt: today, note: `تلف ${suffix}` })
        .expect(201)
    ).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'two-persons');
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف الشطب ${suffix}`, price: 10 }).expect(201)).body.id;
    warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع الشطب ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 30.5] 🔴 ① منشأةٌ جديدة تولد بشخصين: من سجّل الشطبَ لا يعتمده', async () => {
    const profile = (await auth(http().get('/company-profile')).expect(200)).body as { writeOffRequiresTwoPersons: boolean };
    const wo = await record();
    const self = await auth(http().post(`/inventory/write-offs/${wo.id}/approve`)).send({});
    expect({ setting: profile.writeOffRequiresTwoPersons, self: self.status, named: String(self.body.message).includes(wo.no) }).toEqual({ setting: true, self: 403, named: true });
  });

  it('[SPEC 30.5] ② والمنشأةُ ذاتُ الشخص الواحد تطفئه بنفسها، فيعتمد صاحبُها ما سجّله', async () => {
    await auth(http().patch('/company-profile')).send({ writeOffRequiresTwoPersons: false }).expect(200);
    const wo = await record();
    await auth(http().post(`/inventory/write-offs/${wo.id}/approve`)).send({}).expect(201);
  });
});
