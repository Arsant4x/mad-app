import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (9.9 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * **السنةُ المالية بمدّتها المعلَنة: ٦ إلى ١٨ شهراً** (`ق-١٢٧٩` · د/①A3 — `domain-scan/01` A3 · S24).
 *
 * ## ما قِيس قبل البناء (2026-09-22)
 * `monthsFrom(start)` كان يولّد **اثني عشر شهراً دائماً**، و`end` يُفحص أن يكون بعد البداية **ولا يؤثّر
 * في الفترات**. فسنةٌ أولى من ثمانية عشر شهراً (نظامُ الشركات م١٦) تترك **ستّةَ أشهرٍ بلا فترة**، وكلُّ
 * قيدٍ فيها يُردّ `fiscal_no_period_for_date` — تقويمٌ خاطئ من اليوم الأوّل.
 * **والقائمُ قِيس**: `77` سنةً على التطوير و`23` على النظيفة، **كلُّها اثنا عشر شهراً** ولا واحدةَ خارج
 * `6–18` — فلا صفَّ قائماً يخالف الحدَّ الجديد (المسبارُ مُصادَق: بلا سياقٍ `0` وبه `77`).
 *
 * ## ما يُثبَت هنا
 * ① اثنا عشر شهراً: `12` فترة (السلوكُ القائم لا ينكسر) · ② ثمانيةَ عشرَ: `18` فترةً تغطّي الشهرَ
 * الأخير — ويُقبل قيدٌ فيه · ③ خمسةٌ: `400` مسمّىً بالعدد · ④ تسعةَ عشرَ: `400` كذلك.
 */
describe('[SPEC 3.6] السنةُ المالية ٦–١٨ شهراً، وفتراتُها بمدّتها (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let cashId: string;
  let revenueId: string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());

  interface Period { id: string; month: number; year: number }
  const createYear = (name: string, start: string, end: string) => auth(http().post('/fiscal-years')).send({ name, start, end });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'fy-span');
    const accounts = await auth(http().get('/accounts')).expect(200);
    cashId = accounts.body.find((a: { code: string }) => a.code === '1000').id;
    revenueId = accounts.body.find((a: { code: string }) => a.code === '4100').id;
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① سنةٌ عادية اثنا عشر شهراً ⟵ اثنتا عشرة فترة', async () => {
    const res = await createYear('سنة 2090', '2090-01-01', '2090-12-31').expect(201);
    const periods = res.body.periods as Period[];
    expect(periods).toHaveLength(12);
    expect(periods[0]).toMatchObject({ month: 1, year: 2090 });
    expect(periods[11]).toMatchObject({ month: 12, year: 2090 });
  }, 40000);

  it('⭐ ② سنةٌ أولى من ثمانية عشر شهراً ⟵ ثماني عشرة فترة، وقيدٌ في شهرها الأخير يُقبل', async () => {
    const res = await createYear('السنة الأولى 2091', '2091-07-01', '2092-12-31').expect(201);
    const periods = res.body.periods as Period[];
    expect(periods).toHaveLength(18);
    expect(periods[0]).toMatchObject({ month: 7, year: 2091 });
    expect(periods[17]).toMatchObject({ month: 12, year: 2092 });

    // الشهرُ الثالثَ عشر كان بلا فترةٍ قبل البناء — فالقيدُ فيه يُردّ. الآن يُقبل.
    await auth(http().post('/journal'))
      .send({
        date: '2092-07-15',
        memo: 'قيدٌ في الشهر الخامس عشر من السنة الأولى',
        lines: [
          { accountId: cashId, debit: 100, credit: 0 },
          { accountId: revenueId, debit: 0, credit: 100 },
        ],
      })
      .expect(201);
  }, 40000);

  it('③ خمسةُ أشهرٍ تُردّ 400 مسمّىً بالعدد وبالمادة', async () => {
    const res = await createYear('سنة قصيرة', '2094-01-01', '2094-05-31').expect(400);
    expect(String(res.body.message)).toContain('5 شهراً');
    expect(String(res.body.message)).toContain('المادة ١٦');
  }, 40000);

  it('④ تسعةَ عشرَ شهراً تُردّ كذلك — الحدُّ من الجهتين', async () => {
    const res = await createYear('سنة طويلة', '2095-01-01', '2096-07-31').expect(400);
    expect(String(res.body.message)).toContain('19 شهراً');
  }, 40000);
});
