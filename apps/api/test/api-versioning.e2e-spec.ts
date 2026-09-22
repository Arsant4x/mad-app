import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { API_VERSION_PREFIX, applyApiVersioning } from '../src/common/versioning';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (115.5 ث) — والمقيسُ تشغيلٌ **بارد**
//    لحزمةٍ وحدَها، فهو كزمن أوّلِ حزمةٍ في دفعة (تُحسب فيه ترجمةُ `ts-jest` وإقلاعُ `Nest`
//    كلُّها): `477 ms` لأبطأ اختبارٍ فيها، والباقي خطّافُ التهيئة.
jest.setTimeout(350000);

/**
 * **الإصدارُ في المسار** (`ق-١٢٨٦` · ي/⑫A1) — **مُثبَتٌ بالطرق لا بقراءة السطر**.
 *
 * ① بابٌ محايد (`/accounts`) يُجيب كما كان — فلا تنكسر الواجهةُ ولا الحزمُ القائمة.
 * ② وبابٌ بإصدار (`/v1/accounts`) يُجيب **بالجسد نفسِه** — لا «كلاهما ٢٠٠».
 * ③ وإصدارٌ لا وجود له (`/v2/accounts`) يُردّ `404` — فالمعلَنُ واحدٌ لا أيُّ رقم.
 * ④ والعزلُ يسري على المسار الجديد كما على القديم: بلا رمزٍ ⟵ `401`.
 * ⑤ **وحارسُ الوصل**: `main.ts` يستدعي الدالّة فعلاً — فمحرّكٌ يعمل في الحزمة ولا
 *    يُستدعى في الإقلاع لا يُصدِر شيئاً (`§8.5`: «مكتوبة» ليست «تعمل»).
 */
describe('إصدارُ الواجهة في المسار (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    // **كما في الإقلاع بالضبط** — الدالّةُ نفسُها لا نسخةٌ منها، وقبل `init` كي تُسجَّل المسارات.
    applyApiVersioning(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'versioning');
    token = company.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('⭐ ① البابُ المحايد و② البابُ بإصدار يُجيبان بالجسد نفسِه', async () => {
    const neutral = await auth(http().get('/accounts')).expect(200);
    const versioned = await auth(http().get(`/${API_VERSION_PREFIX}/accounts`)).expect(200);
    // `pageArray` تُعيد المصفوفةَ نفسَها حين لا تُطلب صفحة (`paged.util.ts:103`) — مقروءٌ من المصدر.
    expect(Array.isArray(neutral.body)).toBe(true);
    expect((neutral.body as unknown[]).length).toBeGreaterThan(0);
    expect(versioned.body).toEqual(neutral.body);
  });

  it('③ وإصدارٌ لا وجود له يُردّ ٤٠٤ — فالمعلَنُ واحدٌ لا أيُّ رقم', async () => {
    await auth(http().get('/v2/accounts')).expect(404);
  });

  it('④ والعزلُ يسري على المسار الجديد: بلا رمزٍ ⟵ ٤٠١', async () => {
    await http().get(`/${API_VERSION_PREFIX}/accounts`).expect(401);
  });

  it('⑤ وحارسُ الوصل: الإقلاعُ يستدعي الدالّة فعلاً', () => {
    const main = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');
    expect(main).toContain('applyApiVersioning(app)');
  });
});
