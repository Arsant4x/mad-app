import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (8.9 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * ق-١٢٥٣/② — **حذفُ السنة المالية لا يفكّ الإقفال.** كان `DELETE /fiscal-years/:id` يحذف السنةَ وفتراتِها
 * المقفلةَ بالتتالي بلا حارس (`domain-scan/01` — A2)، فيصير الشهرُ المقفل مفتوحاً لكلِّ ترحيلٍ بلا أثرٍ يميّزه.
 * الحارسُ: سنةٌ فيها فترةٌ مقفلة **لا تُحذف** (`409` مسمّىً) — يُعاد فتحُ الفترة أولاً (فعلٌ مقصودٌ مُسجَّل)،
 * ثم يُحذف التقويمُ الذي لا يقفل شيئاً. منشأةٌ معزولة كي لا يترك التقويمُ أثراً على منشأة العرض.
 */
describe('Fiscal year deletion does not unlock closed periods (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let cashId: string;
  let revenueId: string;
  let yearId: string;
  let marchId: string;
  /** سنةٌ بعيدة كي لا تصطدم بتواريخ الحِزم الأخرى. */
  const YEAR = 2088;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const entryInMarch = () => ({
    date: `${YEAR}-03-15`,
    memo: 'قيدٌ في الشهر المقفل',
    lines: [
      { accountId: cashId, debit: 100, credit: 0 },
      { accountId: revenueId, debit: 0, credit: 100 },
    ],
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'fy-delete');
    const accounts = await auth(request(app.getHttpServer()).get('/accounts')).expect(200);
    cashId = accounts.body.find((a: { code: string }) => a.code === '1000').id;
    revenueId = accounts.body.find((a: { code: string }) => a.code === '4100').id;

    const year = await auth(request(app.getHttpServer()).post('/fiscal-years'))
      .send({ name: `سنة ${YEAR}`, start: `${YEAR}-01-01`, end: `${YEAR}-12-31` })
      .expect(201);
    yearId = year.body.id;
    marchId = year.body.periods.find((p: { month: number }) => p.month === 3).id;
    await auth(request(app.getHttpServer()).patch(`/fiscal-years/periods/${marchId}/close`)).expect(200);
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 3.7] ① refuses to delete a year that still has a closed period — and the lock survives the attempt', async () => {
    const refused = await auth(request(app.getHttpServer()).delete(`/fiscal-years/${yearId}`)).expect(409);
    expect(refused.body.message).toContain('مقفلة');

    // السنةُ باقية بفترتها المقفلة، والشهرُ ما زال يرفض الترحيل.
    const years = await auth(request(app.getHttpServer()).get('/fiscal-years')).expect(200);
    const year = years.body.find((y: { id: string }) => y.id === yearId);
    expect(year).toBeDefined();
    expect(year.periods.find((p: { id: string }) => p.id === marchId).status).toBe('CLOSED');
    const blocked = await auth(request(app.getHttpServer()).post('/journal')).send(entryInMarch()).expect(409);
    expect(blocked.body.message).toContain('مقفلة');
  }, 30000);

  it('[SPEC 3.7] ② deletes once every period is reopened — a calendar that locks nothing may go', async () => {
    await auth(request(app.getHttpServer()).patch(`/fiscal-years/periods/${marchId}/reopen`)).send({ reason: 'إعادةُ فتحٍ في الاختبار' }).expect(200);
    await auth(request(app.getHttpServer()).delete(`/fiscal-years/${yearId}`)).expect(204);
    const years = await auth(request(app.getHttpServer()).get('/fiscal-years')).expect(200);
    expect(years.body.some((y: { id: string }) => y.id === yearId)).toBe(false);
    // وتاريخٌ بلا فترةٍ يُنشئ سنتَه مفتوحةً عند الترحيل (`ق-١٥٨٤`) — فالحذفُ لا يترك التاريخَ بلا قفلٍ ولا يفكّ إقفالاً.
    await auth(request(app.getHttpServer()).post('/journal')).send(entryInMarch()).expect(201);
    const again = (await auth(request(app.getHttpServer()).get('/fiscal-years')).expect(200)).body as { start: string; periods: { month: number; status: string }[] }[];
    const recreated = again.find((y) => y.start.slice(0, 10) === `${YEAR}-01-01`);
    expect(recreated?.periods.find((p) => p.month === 3)?.status).toBe('OPEN');
  }, 30000);
});
