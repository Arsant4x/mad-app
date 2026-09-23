import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/common/health/health.controller';

// ⏱️ ميزانيةُ الحزمة (`ق-١٢٨٥`) — ثلاثةُ أضعاف المقيس، وجُلُّه في `beforeAll`.
jest.setTimeout(60000);

/**
 * **شقُّ الصحّة** (`ق-١٣١٨` · ⑪A3 — باب `⑪ تشغيلُ المنصّة`، مُسح).
 *
 * ① يُجيب **بلا مصادقة** — وإلا لم ينفع فحصَ الحاوية.
 * ② ويقرأ القاعدةَ والمخزنَ **بذهابٍ حقيقيّ** لا بوجود إعداد.
 * ③ 🔴 **والرمزُ هو الحكم**: سقوطُ تابعٍ ⟵ `503` لا `200` بجسمٍ يقول «down».
 * ④ ولا يُفصح عمّا لا يلزم — قيمٌ منطقية فقط.
 */
describe('شقُّ الصحّة (e2e)', () => {
  let app: INestApplication;
  let controller: HealthController;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    controller = app.get(HealthController);
  });

  afterAll(async () => {
    await app.close();
  });

  it('⭐ ① يُجيب بلا مصادقة، والحالُ سليم', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: true, storage: true } });
  });

  it('② ولا يُفصح عمّا لا يلزم — قيمٌ منطقية لا نصوصٌ ولا إصدارات', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    for (const value of Object.values(res.body.checks as Record<string, unknown>)) {
      expect(typeof value).toBe('boolean');
    }
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/localhost|127\.0\.0\.1|password|secret/i);
  });

  it('🔴 ③ وسقوطُ تابعٍ يُنزل الرمزَ إلى 503 — فالفحصُ الآليّ يقرأ الرمز', async () => {
    // **المسبارُ يُسقط القاعدةَ في الفحص وحدَه** (لا في التطبيق): يُستبدل نداؤُها ثم يُعاد.
    const original = (controller as unknown as { pingDatabase: () => Promise<boolean> }).pingDatabase;
    (controller as unknown as { pingDatabase: () => Promise<boolean> }).pingDatabase = () => Promise.resolve(false);
    try {
      const res = await request(app.getHttpServer()).get('/health').expect(503);
      expect(res.body).toEqual({ status: 'down', checks: { database: false, storage: true } });
    } finally {
      (controller as unknown as { pingDatabase: () => Promise<boolean> }).pingDatabase = original;
    }
    // ومصادقةُ المسبار: يعود السليمُ بعد الاستعادة — فالسقوطُ كان من الكسر لا من البيئة.
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
