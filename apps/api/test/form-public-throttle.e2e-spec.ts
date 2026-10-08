import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { tenantTracker } from '../src/common/throttle/tenant-tracker';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — يُكتب بعد أوّل تشغيل.
jest.setTimeout(75000);

/**
 * ⚖️ **حدٌّ للطلبات على الرابط والرمز** (توجيه ٢٨٧ ⑪) — **يُفحص بسلوكه لا بوجود تصريحه**، على نمط `throttle-enforced.e2e-spec.ts`:
 * المقنِّنُ معطّلٌ تحت الاختبار (`skipIf`)، فيُستبدَل مزوّدُ خياراته في هذه الحزمة وحدَها بالخيارات نفسِها بلا `skipIf` وبمفتاح الإنتاج
 * (`tenantTracker`: العميلُ بلا حساب يُعدّ بعنوان شبكته). **والرمزُ هنا مجهول** عمداً: الحدُّ يقع قبل المعالج، فالطلبُ المرفوض `404`
 * يُعدّ كالمقبول — فمن يجرّب رموزاً لا يتجاوز الحدّ بأنها خاطئة.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d('Public form link rate limits — enforced, not declared (e2e)', () => {
  let app: INestApplication;
  const unknown = 'B'.repeat(43);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getOptionsToken())
      .useFactory({ factory: (jwt: JwtService) => ({ throttlers: [{ limit: 600, ttl: 60_000 }], getTracker: tenantTracker(jwt) }), inject: [JwtService] })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('① طلبُ الرمز: خمسةٌ في الدقيقة ثم 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app.getHttpServer()).post(`/public/forms/${unknown}/otp`)).status);
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses[5]).toBe(429);
  });

  it('② تحقيقُ الرمز: عشرةٌ في الدقيقة ثم 429', async () => {
    const statuses: number[] = [];
    const body = { challengeId: '00000000-0000-4000-8000-000000000000', code: '123456' };
    for (let i = 0; i < 11; i++) statuses.push((await request(app.getHttpServer()).post(`/public/forms/${unknown}/otp/verify`).send(body)).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('③ فتحُ الرابط: ثلاثون في الدقيقة ثم 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await request(app.getHttpServer()).get(`/public/forms/${unknown}`)).status);
    expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
