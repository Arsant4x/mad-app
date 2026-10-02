import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(120000);

/**
 * ⚖️ **السنةُ المالية تُنشأ مع المنشأة: ميلاديةٌ افتراضاً، ويغيّر التاجرُ شهرَ بدايتها قبل أوّل ترحيل، وتتجدّد تلقائياً. فلا يعمل
 * القفلُ مفتوحاً** (توجيه ٢٧٥ · `ق-١٥٨٤`، بحكم صاحب المشروع).
 *
 * كان القفلُ لا يعمل حتى ينشئ التاجرُ سنةً بيده (`assertPeriodOpen`: لا فترةَ أصلاً ⟵ يمرّ كلُّ شيء)، ومنشأةٌ جديدة تولد بلا
 * سنة. والحكم: سنةٌ ميلاديةٌ مع الميلاد · وكلُّ ترحيلٍ يقع في فترةٍ تُقفل · وشهرُ البداية يتغيّر قبل أوّل ترحيلٍ وحدَه.
 */
describe('السنةُ المالية تُنشأ مع المنشأة وتتجدّد (e2e)', () => {
  let app: INestApplication;
  const companies: IsolatedCompany[] = [];
  const http = () => request(app.getHttpServer());
  type Auth = (r: request.Test) => request.Test;
  const bearer = (token: string): Auth => (r) => r.set('Authorization', `Bearer ${token}`);
  const thisYear = new Date().getUTCFullYear();
  type Period = { id: string; month: number; year: number; status: string };
  type Year = { id: string; start: string; end: string; periods: Period[] };

  const born = async (tag: string): Promise<Auth> => {
    const company = await registerIsolatedCompany(app, tag);
    companies.push(company);
    return bearer(company.token);
  };
  const yearsOf = async (as: Auth) => ((await as(http().get('/fiscal-years')).expect(200)).body as Year[]).sort((a, b) => a.start.localeCompare(b.start));
  const accountId = async (as: Auth, code: string) => ((await as(http().get('/accounts')).expect(200)).body as { id: string; code: string }[]).find((a) => a.code === code)!.id;
  const post = async (as: Auth, date: string) =>
    as(http().post('/journal')).send({
      date,
      memo: `قيدٌ للسنة ${date}`,
      lines: [
        { accountId: await accountId(as, '1000'), debit: 10, credit: 0 },
        { accountId: await accountId(as, '4100'), debit: 0, credit: 10 },
      ],
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    for (const c of companies) await removeIsolatedCompany(app, c);
    await app.close();
  });

  it('[SPEC 3.6] 🔴 ① منشأةٌ جديدة تولد بسنةٍ ميلاديةٍ لسنة ميلادها، باثنتي عشرة فترةً مفتوحة', async () => {
    const as = await born('fy-birth');
    const years = await yearsOf(as);
    expect(
      years.map((y) => ({ start: y.start.slice(0, 10), end: y.end.slice(0, 10), periods: y.periods.length, open: y.periods.every((p) => p.status === 'OPEN') })),
    ).toEqual([{ start: `${thisYear}-01-01`, end: `${thisYear}-12-31`, periods: 12, open: true }]);
  });

  it('[SPEC 3.7] 🔴 ② وتتجدّد: قيدٌ في السنة التالية يُنشئ سنتَها، وفترتُها تُقفل فيُرفض فيها القيد — فلا يعمل القفلُ مفتوحاً', async () => {
    const as = await born('fy-renew');
    const nextDate = `${thisYear + 1}-01-15`;
    expect((await post(as, nextDate)).status).toBe(201);
    const next = (await yearsOf(as)).find((y) => y.start.slice(0, 10) === `${thisYear + 1}-01-01`);
    expect(next?.periods.length).toBe(12);
    const january = next!.periods.find((p) => p.month === 1)!;
    await as(http().patch(`/fiscal-years/periods/${january.id}/close`)).expect(200);
    const blocked = await post(as, nextDate);
    expect(blocked.status).toBe(409);
  });

  it('[SPEC 3.6] 🔴 ③ ويغيّر التاجرُ شهرَ بدايتها قبل أوّل ترحيل، ولا يغيّره بعده', async () => {
    const as = await born('fy-start-month');
    const changed = await as(http().patch('/fiscal-years/start-month')).send({ month: 7 });
    const years = await yearsOf(as);
    const containsToday = years.find((y) => y.start.slice(0, 10) <= new Date().toISOString().slice(0, 10) && y.end.slice(0, 10) >= new Date().toISOString().slice(0, 10));
    const posted = await post(as, new Date().toISOString().slice(0, 10));
    const after = await as(http().patch('/fiscal-years/start-month')).send({ month: 1 });
    expect({
      changed: changed.status,
      posted: posted.status,
      years: years.length,
      startsInJuly: containsToday?.start.slice(5, 10),
      periods: containsToday?.periods.length,
      afterPosting: after.status,
    }).toEqual({ changed: 200, posted: 201, years: 1, startsInJuly: '07-01', periods: 12, afterPosting: 409 });
  });
});
