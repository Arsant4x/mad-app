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
 * ⚖️ **إعادةُ فتح الفترة بسببٍ مكتوبٍ يُسجَّل** (توجيه ٢٧٥ · `ق-١٥٨٣`، بحكم صاحب المشروع).
 *
 * كانت إعادةُ الفتح طلباً بلا جسم: تُفتح فترةٌ مقفلة (وقد تُعكس بها إقفالاتُ السنة) ولا يُعرف لماذا. والحكم: لا تُفتح إلا بسببٍ
 * مكتوب، ويُحفظ على الفترة مع لحظته ومن فتحها — فيُقرأ بجانبها لا في سجلّ التدقيق وحدَه.
 */
describe('إعادةُ فتح الفترة بسببٍ مكتوب (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  // سنةٌ بعيدة لا تتقاطع مع ما تنشئه الحزمُ الأخرى.
  const YEAR = 2093;
  let periodId: string;

  type Period = { id: string; status: string; reopenReason?: string | null; reopenedAt?: string | null; reopenedById?: string | null };
  const periodOf = async (): Promise<Period | undefined> =>
    ((await auth(http().get('/fiscal-years')).expect(200)).body as { periods: Period[] }[]).flatMap((y) => y.periods).find((p) => p.id === periodId);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'reopen-reason');
    const year = (await auth(http().post('/fiscal-years')).send({ name: `سنة ${YEAR}`, start: `${YEAR}-01-01`, end: `${YEAR}-12-31` }).expect(201)).body as { periods: Period[] };
    periodId = year.periods[2].id;
    await auth(http().patch(`/fiscal-years/periods/${periodId}/close`)).expect(200);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 3.7] 🔴 ① بلا سببٍ لا تُفتح: 400، والفترةُ مقفلةٌ كما هي', async () => {
    const res = await auth(http().patch(`/fiscal-years/periods/${periodId}/reopen`)).send({});
    expect({ status: res.status, period: (await periodOf())?.status }).toEqual({ status: 400, period: 'CLOSED' });
  });

  it('[SPEC 3.7] 🔴 ② وبسببٍ مكتوبٍ تُفتح، ويُحفظ السببُ على الفترة مع لحظته ومن فتحها', async () => {
    const reason = 'تصحيحُ قيدِ مصروفٍ رُحّل على حسابٍ خطأ';
    await auth(http().patch(`/fiscal-years/periods/${periodId}/reopen`)).send({ reason }).expect(200);
    const period = await periodOf();
    expect({ status: period?.status, reason: period?.reopenReason, stamped: Boolean(period?.reopenedAt), by: Boolean(period?.reopenedById) }).toEqual({
      status: 'OPEN',
      reason,
      stamped: true,
      by: true,
    });
  });
});
