import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * تصنيفُ العقد للضريبة وشمولُ قيمته (ق-٨٩١ · ق-٨٩٢ · ق-٨٩٨):
 *   · إلزاميان بتعدادٍ مغلق — عقدٌ بلا تصنيفٍ يُرفض، والقيمةُ القديمة لا يقبلها الخادمُ لعقدٍ جديد.
 *   · التجديدُ يُعلنهما لا يرثهما.
 *   · عقدٌ سبق الهجرة (قيمةٌ قديمة صريحة) لا يُعدَّل قبل إعلانهما — «يُنقص بيدٍ عند لمس العقد».
 *   · والحبسُ في القاعدة: صفٌّ جديد بالقيمة القديمة يرفضه قيدُ CHECK ولو تجاوز الخادم.
 */
describe('Contract classification (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'contract-class');
    token = company.token;
  }, 30000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function makeUnit() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const property = await auth(request(app.getHttpServer()).post('/properties')).send({ name: `عقار التصنيف ${suffix}`, ownership: 'owned' }).expect(201);
    const unit = await auth(request(app.getHttpServer()).post('/units'))
      .send({ propertyId: property.body.id, unitNo: `C-${suffix}`, type: 'apartment', rentMonthly: 1000 })
      .expect(201);
    return unit.body.id as string;
  }

  const base = (unitId: string) => ({ unitId, tenant: 'مستأجر التصنيف', value: 12000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31' });

  it('عقدٌ بلا تصنيفٍ أو بلا إعلانِ شمولٍ يُرفض — ولا افتراضَ صامت', async () => {
    const unitId = await makeUnit();
    const noClass = await auth(request(app.getHttpServer()).post('/contracts')).send({ ...base(unitId), vatInclusion: 'EXCLUSIVE' }).expect(400);
    expect(JSON.stringify(noClass.body)).toContain('classification');
    const noVat = await auth(request(app.getHttpServer()).post('/contracts')).send({ ...base(unitId), classification: 'COMMERCIAL' }).expect(400);
    expect(JSON.stringify(noVat.body)).toContain('vatInclusion');
  });

  it('القيمةُ القديمة ليست في التعداد المفتوح للخادم — تُرفض لعقدٍ جديد', async () => {
    const unitId = await makeUnit();
    await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ ...base(unitId), classification: 'LEGACY_UNCLASSIFIED', vatInclusion: 'EXCLUSIVE' })
      .expect(400);
    await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ ...base(unitId), classification: 'COMMERCIAL', vatInclusion: 'LEGACY_UNDECLARED' })
      .expect(400);
  });

  it('التصنيفُ يُقرأ من الإعلان وحدَه — لا من كلمة الوحدة (وحدةٌ نوعُها apartment تُصنَّف تجاريةً إن أُعلنت كذلك)', async () => {
    const unitId = await makeUnit();
    const created = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ ...base(unitId), classification: 'COMMERCIAL', vatInclusion: 'INCLUSIVE' })
      .expect(201);
    expect(created.body.classification).toBe('COMMERCIAL');
    expect(created.body.vatInclusion).toBe('INCLUSIVE');
    const fetched = await auth(request(app.getHttpServer()).get(`/contracts/${created.body.id}`)).expect(200);
    expect(fetched.body.classification).toBe('COMMERCIAL');
    expect(fetched.body.vatInclusion).toBe('INCLUSIVE');
  });

  it('التجديدُ يُعلن تصنيفَه ولا يرثه — بلا إعلانٍ يُرفض، وبإعلانٍ مغايرٍ يحمل المُعلَن', async () => {
    const unitId = await makeUnit();
    const source = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ ...base(unitId), classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(201);
    await auth(request(app.getHttpServer()).post(`/contracts/${source.body.id}/renew`)).send({ start: '2027-01-01', end: '2027-12-31' }).expect(400);
    const renewed = await auth(request(app.getHttpServer()).post(`/contracts/${source.body.id}/renew`))
      .send({ start: '2027-01-01', end: '2027-12-31', classification: 'COMMERCIAL', vatInclusion: 'INCLUSIVE' })
      .expect(201);
    expect(renewed.body.classification).toBe('COMMERCIAL');
    expect(renewed.body.vatInclusion).toBe('INCLUSIVE');
    expect(renewed.body.renewedFromId).toBe(source.body.id);
  });

  it('عقدٌ سبق الهجرة (قيمةٌ قديمة صريحة) لا يُعدَّل قبل إعلان تصنيفه وشمولِ قيمته — ثم يُنقص بيدٍ', async () => {
    const unitId = await makeUnit();
    const created = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ ...base(unitId), classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(201);
    const id = created.body.id as string;
    // يُحاكى صفٌّ سبق الهجرة: القيمةُ القديمة مع createdAt قبل لحظة الهجرة — وهو ما يجيزه القيدُ للقديم وحدَه.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$executeRaw(Prisma.sql`UPDATE "contracts" SET "classification" = 'LEGACY_UNCLASSIFIED'::"ContractClassification", "vatInclusion" = 'LEGACY_UNDECLARED'::"ContractVatInclusion", "createdAt" = TIMESTAMP '2020-01-01 00:00:00' WHERE "id" = ${id}`),
    );
    const legacy = await auth(request(app.getHttpServer()).get(`/contracts/${id}`)).expect(200);
    expect(legacy.body.classification).toBe('LEGACY_UNCLASSIFIED');

    const blocked = await auth(request(app.getHttpServer()).patch(`/contracts/${id}`)).send({ tenant: 'اسمٌ جديد' }).expect(400);
    expect(String(blocked.body.message)).toContain('تصنيف');
    const halfBlocked = await auth(request(app.getHttpServer()).patch(`/contracts/${id}`)).send({ classification: 'COMMERCIAL' }).expect(400);
    expect(String(halfBlocked.body.message)).toContain('شمول');

    const declared = await auth(request(app.getHttpServer()).patch(`/contracts/${id}`))
      .send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', tenant: 'اسمٌ جديد' })
      .expect(200);
    expect(declared.body.classification).toBe('COMMERCIAL');
    expect(declared.body.vatInclusion).toBe('EXCLUSIVE');
    expect(declared.body.tenant).toBe('اسمٌ جديد');
  });

  it('⭐ الحبسُ في القاعدة: صفٌّ جديد بالقيمة القديمة يرفضه قيدُ CHECK ولو تجاوز الخادم', async () => {
    const unitId = await makeUnit();
    const created = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ ...base(unitId), classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(201);
    const id = created.body.id as string;
    let error = '';
    try {
      await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
        tx.$executeRaw(Prisma.sql`INSERT INTO "contracts" ("id","companyId","unitId","no","tenant","value","cycle","start","end","deposit","currency","exchangeRate","baseValue","status","classification","vatInclusion","createdAt","updatedAt")
          SELECT ${`${id}-legacy-probe`}, "companyId", "unitId", ${`PROBE-${Date.now()}`}, "tenant", "value", "cycle", "start", "end", 0, "currency", "exchangeRate", "baseValue", 'DUE'::"ContractStatus", 'LEGACY_UNCLASSIFIED'::"ContractClassification", 'EXCLUSIVE'::"ContractVatInclusion", clock_timestamp(), clock_timestamp()
          FROM "contracts" WHERE "id" = ${id}`),
      );
    } catch (e) {
      error = String((e as Error).message);
    }
    // التوكيدُ على القيد بعينه لا على مجرّد الرفض (§8 — التوكيد الضيّق).
    expect(error).toContain('contracts_legacy_classification_before_cutover');
  });
});
