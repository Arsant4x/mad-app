import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { totp } from '../src/common/mfa/totp.util';
import { IsolatedCompany, ISOLATED_PASSWORD, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (`ق-١٢٨٥`) — ثلاثةُ أضعاف المقيس، وجُلُّه في `beforeAll`.
jest.setTimeout(120000);

/**
 * **المصادقةُ المتعدّدة (TOTP)** (`ق-١٣١٨` · ⑨A1 — باب `⑨ الصلاحيات`، مُسح).
 *
 * «اختراقُ حسابٍ بكلمةٍ واحدة **يقع مرّةً ولا يُردّ** … **وبياناتٌ سُرّبت لا تعود**»
 * (`docs/domain-scan/09` · A1).
 *
 * **والدورةُ تُقاس كلُّها**: تسجيلٌ لا يُفعَّل بلا تأكيد · ودخولٌ يُردّ بلا رمز ·
 * **ورمزٌ لا يُستعمل مرّتين** · ورمزُ استردادٍ يعمل مرّةً · وإلغاءٌ برمزٍ حيّ.
 */
describe('المصادقةُ المتعدّدة (e2e)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let secret: string;
  let recoveryCodes: string[];
  // The session the changes are made from; turning the factor on or off ends the access token, and a refresh renews it.
  let session: { token: string; cookie: string };

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${session.token}`);
  const login = (body: Record<string, unknown>) => http().post('/auth/login').send({ username: co.username, password: ISOLATED_PASSWORD, ...body });
  const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='))!.split(';')[0];
  const renew = async () => {
    const res = await http().post('/auth/refresh').set('Cookie', session.cookie).expect(200);
    session = { token: res.body.accessToken as string, cookie: cookieOf(res) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    co = await registerIsolatedCompany(app, 'mfa');
    const signedIn = await login({}).expect(200);
    session = { token: signedIn.body.accessToken as string, cookie: cookieOf(signedIn) };
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('① يبدأ غيرَ مسجَّل — ولا يُطالَب برمزٍ ولا يُحبس', async () => {
    const status = await auth(http().get('/auth/mfa')).expect(200);
    expect(status.body.enrolled).toBe(false);
    await login({}).expect(200);
  });

  it('⭐ ② والبدءُ لا يُفعّل شيئاً — سرٌّ يُعرض، والدخولُ ما زال بلا رمز', async () => {
    const begun = await auth(http().post('/auth/mfa/begin')).expect(201);
    secret = begun.body.secret as string;
    expect(begun.body.otpauth).toContain('otpauth://totp/');
    // 🔴 **فمن ولّد سرّاً ولم يُكمل لا يُحبس خارج حسابه.**
    await login({}).expect(200);
    expect((await auth(http().get('/auth/mfa')).expect(200)).body.enrolled).toBe(false);
  });

  it('③ ورمزٌ خاطئ لا يُكمل التسجيل', async () => {
    await auth(http().post('/auth/mfa/confirm')).send({ code: '000000', currentPassword: ISOLATED_PASSWORD }).expect(401);
    expect((await auth(http().get('/auth/mfa')).expect(200)).body.enrolled).toBe(false);
  });

  it('⭐ ④ والتأكيدُ برمزٍ صحيح يُفعّلها ويُسلّم رموزَ الاسترداد مرّةً', async () => {
    const confirmed = await auth(http().post('/auth/mfa/confirm')).send({ code: totp(secret), currentPassword: ISOLATED_PASSWORD }).expect(201);
    recoveryCodes = confirmed.body.recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(8);
    await renew();
    const status = await auth(http().get('/auth/mfa')).expect(200);
    expect(status.body.enrolled).toBe(true);
    expect(status.body.recoveryCodesLeft).toBe(8);
  });

  it('🔴 ⑤ والدخولُ بلا رمزٍ يُردّ — حاملاً ما يقوله للشاشة', async () => {
    const res = await login({}).expect(401);
    expect(res.body.mfaRequired).toBe(true);
    expect(String(res.body.message)).toContain('رمز المصادقة');
  });

  it('🔴 ⑥ وبكلمةٍ خاطئة يُردّ بلا إفصاحٍ عن التسجيل — فلا يصير المسارُ مِعداداً', async () => {
    const res = await http().post('/auth/login').send({ username: co.username, password: 'WrongPass123!', code: totp(secret) }).expect(401);
    expect(res.body.mfaRequired).toBeUndefined();
  });

  it('⭐ ⑦ ويدخل برمزٍ صحيح — 🔴 ولا يُقبل الرمزُ نفسُه مرّتين', async () => {
    // ⚠️ **ورمزُ التأكيد نفسُه مستهلَك**: خطوتُه خُتمت عند التفعيل — **وهذا مقصود**، فمن
    //    التقط رمزَ التسجيل من فوق الكتف لا يدخل به. فيُؤخذ رمزُ الخطوة التالية.
    const code = totp(secret, Date.now() + 30_000);
    await login({ code }).expect(200);
    // **الخوارزميةُ لا تعرف إعادةَ الاستعمال — والمُخزِّن يعرف.**
    await login({ code }).expect(401);
  });

  it('⭐ ⑧ ورمزُ الاسترداد يعمل مرّةً ثم لا يعمل — فمن فقد هاتفَه يدخل', async () => {
    const [first] = recoveryCodes;
    await login({ code: first }).expect(200);
    await login({ code: first }).expect(401);
    expect((await auth(http().get('/auth/mfa')).expect(200)).body.recoveryCodesLeft).toBe(7);
  });

  it('⑨ والإلغاءُ برمزٍ حيّ وحدَه — ثم يعود الدخولُ بلا رمز', async () => {
    await auth(http().post('/auth/mfa/disable')).send({ code: '000000', currentPassword: ISOLATED_PASSWORD }).expect(401);
    /**
     * ⚠️ **وبرمز استرداد لا برمز التطبيق — لسببٍ مقيس**: خطوةُ التطبيق الحالية وما بعدها
     * استُهلكتا في ⑦، **والنافذةُ خطوةٌ واحدة** فما بعدهما خارجَها. وهذا **سلوكٌ صحيح لا
     * عائق**: من استعمل رمزاً ينتظر الذي يليه (RFC 6238 §5.2) — والاختبارُ لا يزيّف ساعة.
     * **ورمزُ الاسترداد اعتمادٌ حيٌّ كذلك**، وهو المسارُ الواقعيّ لمن فقد هاتفه.
     */
    await auth(http().post('/auth/mfa/disable')).send({ code: recoveryCodes[1], currentPassword: ISOLATED_PASSWORD }).expect(201);
    await renew();
    expect((await auth(http().get('/auth/mfa')).expect(200)).body.enrolled).toBe(false);
    await login({}).expect(200);
  });
});
