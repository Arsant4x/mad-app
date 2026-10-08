import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ معزولة وفرعان وسندا قبض؛ لم تُقَس بعد، فالسقفُ معلنٌ هنا.
jest.setTimeout(120000);

interface BankTxRow {
  id: string;
  bankId: string;
  description: string;
  amount: string | number;
  branchId: string | null;
}

/**
 * ⚖️ **البند ٥٩٩ (توجيه ٢٨٦ · القاعدة ٣٧ · `ق-١٥٨١`)**: صفُّ الحركة البنكية الذي يكتبه الترحيلُ مرآةً لسندٍ
 * (`mirrorBankMovement`) كان يُكتب بلا فرع، وقائمةُ الحركات ترشّح بـ`branchFilter` الذي يُدخل ما بلا فرع، فيرى
 * الموظّفُ المقيَّدُ بالشمال حركةَ صندوق الجنوب. **قِيس حيّاً قبل الإصلاح بهذا الملفّ نفسِه** فسقط ①.
 *
 * والحكمُ `ق-١٥٨١`: القوائمُ ترشَّح بفروع القارئ. فالمرآةُ تحمل فرعَ قيدها، والمقيَّدُ بالجنوب يراها (الموجبة)،
 * والمقيَّدُ بالشمال لا يراها.
 */
describe('مرآةُ البنك تحمل فرعَ سندها، فلا يراها المقيَّدُ بفرعٍ آخر (البند ٥٩٩ · ق-١٥٨١)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  let northId: string;
  let southId: string;
  let southBoxId: string;
  let customerId: string;
  let northToken: string;
  let southToken: string;

  const listAs = async (token: string): Promise<BankTxRow[]> =>
    ((await http().get('/transactions').query({ pageSize: 100 }).set('Authorization', `Bearer ${token}`).expect(200)).body as { items: BankTxRow[] }).items;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'mirror-branch');
    northId = ((await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body as { id: string }).id;
    southId = ((await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body as { id: string }).id;
    southBoxId = ((await asOwner(http().post('/banks')).send({ name: `صندوق الجنوب ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: today(), branchId: southId }).expect(201)).body as { id: string }).id;
    customerId = await createTenantCustomer(app, company.token, `عميل المرآة ${suffix}`);

    const template = (await asOwner(http().post('/templates')).send({ name: `الحركات ${suffix}`, allowedScreens: ['dashboard', 'transactions'] }).expect(201)).body as { id: string };
    const staff = async (who: string, branchId: string): Promise<string> => {
      await asOwner(http().post('/company-users'))
        .send({ name: who, username: `${who}-mirror-${suffix}`, password: 'ScopePass123!', permissionTemplateId: template.id, branchIds: [branchId] })
        .expect(201);
      return ((await http().post('/auth/login').send({ username: `${who}-mirror-${suffix}`, password: 'ScopePass123!' }).expect(200)).body as { accessToken: string }).accessToken;
    };
    northToken = await staff('north', northId);
    southToken = await staff('south', southId);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('🔴 ① سندُ قبضٍ نقديّ في صندوق الجنوب: مرآتُه بفرع الجنوب، يراها المقيَّدُ بالجنوب ولا يراها المقيَّدُ بالشمال', async () => {
    await asOwner(http().post('/payments'))
      .send({ customerId, branchId: southId, date: today(), amount: 250, method: 'CASH', bankId: southBoxId, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } })
      .expect(201);

    const ownerRows = (await listAs(company.token)).filter((t) => t.bankId === southBoxId);
    // المسبارُ يرى: المالكُ يرى المرآةَ (صفٌّ واحدٌ بالمبلغ) قبل أن يُحكم على غيابها عند غيره.
    expect(ownerRows.map((t) => Number(t.amount))).toEqual([250]);
    expect({
      south: (await listAs(southToken)).some((t) => t.id === ownerRows[0].id),
      north: (await listAs(northToken)).some((t) => t.id === ownerRows[0].id),
    }).toEqual({ south: true, north: false });
    expect(ownerRows[0].branchId).toBe(southId);
  });
});
