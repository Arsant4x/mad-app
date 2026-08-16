import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';

/**
 * حدود المعدّل — **تُفحص بسلوكها لا بوجود تصريحها**.
 *
 * ## العطل الذي يعالجه هذا الملف
 *
 * `ThrottlerModule` في `app.module.ts` يحمل:
 *
 *     skipIf: () => process.env.NODE_ENV === 'test'
 *
 * و**Jest يضبط `NODE_ENV=test` تلقائياً** — مقيسٌ لا مفترَض
 * (`ENVPROBE={"NODE_ENV":"test","skipWouldFire":true}`). فكل حدٍّ في النظام
 * **مُعطَّل في كل اختبار**: العام، والدخول، والاستعادة، والتسجيل، وحدُّ
 * `POST /company-users` الذي أُضيف تخفيفاً لتسريب أسماء المستخدمين.
 *
 * **أي أن حرّاساً أمنية شُحنت بلا أن يفحصها شيء** — وسببه بنيويّ لا سهو.
 *
 * ## ولماذا لا يُلغى `skipIf`
 *
 * سببه وجيه ومكتوب: «the e2e suite fires hundreds of requests from one IP by
 * design». فثمانون مجموعة من عنوانٍ واحد تصطدم بالسقف العام فتسقط لسببٍ لا
 * يخصّ ما تفحصه — **وإيجابيّةٌ كاذبة كهذه تُعطِّل الحارس**.
 *
 * ## فالغطاء يُتجاوَز هنا وحده (§8.18)
 *
 * يُستبدَل **مزوّد خيارات** المكتبة في هذه المجموعة فقط — بخيارات بلا
 * `skipIf`. فالمتحكّم المفحوص **هو المتحكّم الحقيقي بتصريحه الحقيقي**، ولا
 * تُمسّ شيفرة الإنتاج بحرف، ولا تتأثّر بقية الحزمة.
 *
 * ⟵ «حارسٌ لا يمكن بلوغه لا يُثبَت» — وهذا هو تجاوز الغطاء لبلوغه.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d('حدود المعدّل — مُنفَّذة لا مُصرَّحة (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // ⚠️ **التجاوز هنا لا في الإنتاج**: نفس الخيارات بلا `skipIf`.
      .overrideProvider(getOptionsToken())
      .useValue({ throttlers: [{ limit: 600, ttl: 60_000 }] })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('⓪ حارسٌ على المجسّ: التجاوز وقع فعلاً — وإلا لم يُفحص شيء', async () => {
    /**
     * ⚠️ **أول صياغةٍ لهذا الاختبار كانت تكتفي بـ`expect(token).toBeTruthy()`**
     * — أي أن اسمه يقول «التجاوز وقع» وتوكيدُه يفحص **قيام الجلسة**. وكشفه
     * الإثبات العكسي: أُزيل التجاوز فسقط ① **وبقي ⓪ أخضرَ** يشهد لما لم يفحصه
     * (§8.14: العنوان ليس التوكيد).
     *
     * فيُقرأ الآن **الخيار المحقون نفسه**: غياب `skipIf` هو التجاوز بعينه.
     */
    const options = app.get(getOptionsToken()) as { skipIf?: unknown };
    expect(options.skipIf).toBeUndefined();
    expect(token).toBeTruthy();
  }, 60000);

  it('① ⭐ الطلب السادس يُردّ بـ429 — الحدّ يُنفَّذ فعلاً', async () => {
    /**
     * الحدّ على المسار `5/دقيقة`. والحارس يسبق أنابيب التحقق في Nest، فطلبٌ
     * بجسدٍ غير صالح **يستهلك الحصّة** ولا يُنشئ مستخدماً — فيُفحص الحدّ بلا
     * أن يترك المجسّ صفوفاً خلفه.
     */
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/company-users')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      codes.push(res.status);
    }

    // الخمسة الأولى تُردّ بخطأ تحقّق (400) لا بـ429 — أي أنها **بلغت** المعالج.
    expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
    // والسادس يُردّ بـ429 بعينه، لا بأي خطأ.
    expect(codes[5]).toBe(429);
  }, 60000);

  /**
   * ⚠️ **ولا يوجد اختبارٌ ثانٍ يفحص «وجود التصريح» — وحذفُه قرار.**
   *
   * كان مخطَّطاً: توكيدٌ عبر `Reflector` أن `@Throttle` موجود بقيمته. ثم تبيّن
   * أنه **زائدٌ لا مكمّل**: لو حُذف التصريح لصار الحدّ هو السقف العام (600)،
   * فلا يظهر `429` في ستّ محاولات — **فيسقط الاختبار ① نفسه**.
   *
   * أي أن الحالة التي وُضع لها الفحصُ الرخيص **مغطّاة بالفحص السلوكي أصلاً**.
   * وكان سيُبنى فوق ذلك على `THROTTLER_LIMIT` — وهو **غير مُصدَّر** من المكتبة،
   * فاستيراده يعني التعلّق بمسارٍ داخليّ يتغيّر بلا إشعار.
   *
   * فاختبارٌ زائد على استيرادٍ هشّ **كلفةٌ بلا عائد**.
   */
});
