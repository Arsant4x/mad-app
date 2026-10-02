import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(180000);

/**
 * ⚖️ **رسالةُ حدّ الائتمان وما يُحفظ منها لا تُري المقيَّدَ ذمّةَ المنشأة** (توجيه ٢٧٥ · `ق-١٥٨١`).
 *
 * مسحُ توجيه ٢٧٤ (الكتلة ٥ج): الحدُّ يُقاس على ذمّة العميل في المنشأة كلِّها (حدُّه حدُّ المنشأة لا الفرع)، **ورسالةُ الرفض
 * تحمل الذمّةَ وما تصير إليه**؛ وإذا تجاوز من يملك الاعتمادَ حُفظت الذمّةُ على الفاتورة (`creditOverrideExposure`) فقرأها كلُّ من
 * يقرأ فواتيرَ ذلك الفرع. والذمّةُ رقمُ المنشأة كلِّها، و«الأرقامُ المجمَّعة على مستوى المنشأة تُرفض للمقيَّد».
 *
 * **والقياسُ يبقى على المنشأة كلِّها** (الحدُّ لا يُخفَّف)؛ الذي يتغيّر ما يُقال للمقيَّد: حدُّ العميل وهذه الفاتورة، بلا الذمّة.
 * والمالكُ يرى الرسالةَ كاملة، ومثلُه من يرى الفروعَ كلَّها.
 *
 * الأرقام: حدُّ العميل 100 · فاتورةٌ في فرع ب 1,000 (1,150.00 بالضريبة) · والمقيَّدُ في فرع أ يُصدر 10 (11.50).
 */
describe('رسالةُ حدّ الائتمان لا تُري المقيَّدَ ذمّةَ المنشأة (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  type Auth = (r: request.Test) => request.Test;
  const bearer = (token: string): Auth => (r) => r.set('Authorization', `Bearer ${token}`);
  let owner: Auth;
  let restricted: Auth;
  let branchA: string;
  let customerId: string;
  const EXPOSURE = '1,150.00';
  const sale = (branchId: string, creditOverride?: boolean) => ({
    customerId,
    branchId,
    issueDate: today,
    dueDate: today,
    lines: [{ description: `بيع ${suffix}`, quantity: 1, unitPrice: 10, taxCategory: 'S' }],
    ...(creditOverride ? { creditOverride: true } : {}),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'credit-figures');
    owner = bearer(company.token);
    branchA = (await owner(http().post('/branches')).send({ name: `فرع أ ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    const branchB = (await owner(http().post('/branches')).send({ name: `فرع ب ${suffix}`, type: 'فرع' }).expect(201)).body.id as string;

    customerId = await createTenantCustomer(app, company.token, `عميل الحدّ ${suffix}`);
    // ذمّةٌ في فرع ب قبل أن يُوضع الحدّ — فلا يُفحص عليها هي.
    await owner(http().post('/invoices'))
      .send({ customerId, branchId: branchB, issueDate: today, dueDate: today, lines: [{ description: `بيع ب ${suffix}`, quantity: 1, unitPrice: 1000, taxCategory: 'S' }] })
      .expect(201);
    await owner(http().patch(`/customers/${customerId}`)).send({ creditLimit: 100 }).expect(200);

    // قالبٌ بالفواتير وأفعالها كلِّها (ومنها `review` الذي يجيز التجاوز) — فالفرقُ المقيس فرقُ الفروع وحدَه.
    const template = (await owner(http().post('/templates')).send({ name: `الحدّ ${suffix}`, allowedScreens: ['dashboard', 'invoice', 'customers'] }).expect(201)).body.id as string;
    const username = `credit-north-${suffix}`;
    await owner(http().post('/company-users')).send({ name: username, username, password: 'CreditPass123!', permissionTemplateId: template, branchIds: [branchA] }).expect(201);
    restricted = bearer((await http().post('/auth/login').send({ username, password: 'CreditPass123!' }).expect(200)).body.accessToken);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 4.3] 🔴 ① الرفضُ للمقيَّد يسمّي حدَّ العميل وهذه الفاتورة بلا ذمّة المنشأة، وللمالك بها — والحدُّ يُقاس على المنشأة للاثنين', async () => {
    const mine = await restricted(http().post('/invoices')).send(sale(branchA));
    const all = await owner(http().post('/invoices')).send(sale(branchA));
    const text = (body: { message: string | string[] }) => ([] as string[]).concat(body.message).join(' | ');
    expect({
      mine: { status: mine.status, code: mine.body.code, exposure: text(mine.body).includes(EXPOSURE), adding: text(mine.body).includes('11.50') },
      all: { status: all.status, code: all.body.code, exposure: text(all.body).includes(EXPOSURE) },
    }).toEqual({
      mine: { status: 409, code: 'CREDIT_LIMIT_EXCEEDED', exposure: false, adding: true },
      all: { status: 409, code: 'CREDIT_LIMIT_EXCEEDED', exposure: true },
    });
  });

  it('[SPEC 4.3] 🔴 ② والتجاوزُ المحفوظ: ذمّةُ المنشأة على الفاتورة لا تصل المقيَّدَ في القائمة، وتصل المالك', async () => {
    const overridden = (await restricted(http().post('/invoices')).send(sale(branchA, true)).expect(201)).body as { id: string };
    type Row = { id: string; creditOverrideExposure?: string | null; creditOverrideLimit?: string | null };
    const rowsOf = (body: unknown) => (Array.isArray(body) ? body : (body as { items: Row[] }).items) as Row[];
    const mine = rowsOf((await restricted(http().get('/invoices')).expect(200)).body).find((r) => r.id === overridden.id);
    const all = rowsOf((await owner(http().get('/invoices')).expect(200)).body).find((r) => r.id === overridden.id);
    expect({
      mine: { found: Boolean(mine), exposure: mine ? 'creditOverrideExposure' in mine : null, limit: mine?.creditOverrideLimit !== undefined && mine?.creditOverrideLimit !== null },
      all: { exposure: Number(all?.creditOverrideExposure) },
    }).toEqual({
      mine: { found: true, exposure: false, limit: true },
      all: { exposure: 1150 },
    });
  });
});
