import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * **سقفُ نطاق الرموز يُعلَن قبل الاصطدام** (`ق-٢٩٥`).
 *
 * `MAX+1` يمشي في اتجاهٍ واحد: **الفجوةُ لا تُعاد تعبئتُها، وحسابُ بنكٍ حُذف
 * كيانُه يبقى رمزُه مشغولاً**. فنطاقُ البنوك نفد فعلاً في قاعدة التطوير —
 * **بلا إنذارٍ واحد**، وظهر رفضُه `409` بدا رفضاً آخر (`ق-٢٩٤`).
 */
describe('سقفُ نطاق رموز الحسابات (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): البنوكُ تُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض التي استُنفد نطاقُها.
  let company: IsolatedCompany;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  interface BandStatus {
    key: string;
    name: string;
    capacity: number;
    remaining: number;
    next: string | null;
    warnThreshold: number;
    warn: boolean;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'code-band');
    token = company.token;
  }, 30000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('🔴 شاشةُ البنوك تُعلن سقفَها — والنطاقُ الثاني داخلٌ في السعة', async () => {
    const body = (await auth(http().get('/banks/code-band')).expect(200)).body as BandStatus;

    expect(body.key).toBe('bank');
    // ١٠٠ (1100–1199) + ٣٩٩ (1601–1999) — والنطاقُ الثاني هو حكمُ ق-٢٩٥.
    expect(body.capacity).toBe(499);
    expect(body.warnThreshold).toBe(10);
    expect(body.remaining).toBeGreaterThanOrEqual(0);
    expect(body.warn).toBe(body.remaining <= body.warnThreshold);
  }, 20000);

  it('🔴 وشاشةُ الأدراج تُعلن سقفَها — فالعلّةُ عامّةٌ لا بنكية', async () => {
    const body = (await auth(http().get('/cash-drawers/code-band')).expect(200)).body as BandStatus;

    expect(body.key).toBe('drawer');
    // ٩٠ (1010–1099) + ١٠٠ (1500–1599) — والنطاقُ الثاني حكمُ ق-٤٨٢ بعد أن
    // نفد الأولُ فعلاً في منشأة العرض عند `1099`.
    expect(body.capacity).toBe(190);
    expect(body.warnThreshold).toBe(10);
    expect(body.warn).toBe(body.remaining <= body.warnThreshold);
  }, 20000);

  it('والرمزُ المُعلَن هو الذي يصدر فعلاً — لا رقمٌ يُعرض ورقمٌ يُكتب', async () => {
    const before = (await auth(http().get('/banks/code-band')).expect(200)).body as BandStatus;
    // نطاقٌ نفد لا يُنشئ بنكاً — والدعوى هنا على التطابق لا على الإنشاء.
    if (before.next === null) throw new Error('نطاقُ البنوك نفد في هذه القاعدة — والتوكيد يحتاج خانةً واحدة');

    const bank = (
      await auth(http().post('/banks'))
        .send({ name: `بنكُ السقف ${Date.now()}`, openingBalance: 0, openingDate: '2026-01-01' })
        .expect(201)
    ).body as { id: string; accountId: string };

    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const created = accounts.find((a) => a.id === bank.accountId);
    if (!created) throw new Error('حسابُ البنك غير موجودٍ في الدليل');
    expect(created.code).toBe(before.next);

    const after = (await auth(http().get('/banks/code-band')).expect(200)).body as BandStatus;
    expect(after.remaining).toBe(before.remaining - 1);

    await auth(http().delete(`/banks/${bank.id}`));
  }, 20000);

  it('⚠️ وحذفُ البنك لا يُرجع رمزَه — وهي العلّةُ التي أنشأت هذا السقف', async () => {
    const before = (await auth(http().get('/banks/code-band')).expect(200)).body as BandStatus;
    if (before.next === null) throw new Error('نطاقُ البنوك نفد في هذه القاعدة');

    const bank = (
      await auth(http().post('/banks'))
        .send({ name: `بنكٌ يُحذف ${Date.now()}`, openingBalance: 0, openingDate: '2026-01-01' })
        .expect(201)
    ).body as { id: string };
    await auth(http().delete(`/banks/${bank.id}`)).expect(204);

    // **الرمزُ لا يعود**: الحذفُ ناعمٌ ولا يمسّ الحساب، و`MAX+1` لا ينزل.
    const after = (await auth(http().get('/banks/code-band')).expect(200)).body as BandStatus;
    expect(after.remaining).toBe(before.remaining - 1);
  }, 20000);
});
