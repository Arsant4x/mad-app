import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * **لا يُعلَن افتتاحيٌّ فوق حركةٍ سبقته** (`ق-٢٩١`).
 *
 * القيدُ الافتتاحي يطوي ما قبله؛ فإعلانُه على حسابٍ **تحرّك قبل تاريخه** يَعُدّ
 * الرصيدَ مرّتين **والميزانُ يبقى متوازناً فلا ينبّه أحد**.
 *
 * ⚠️ **والاتجاه مقصود**: يُمنع **خلقُ** التناقض ولا يُعاقَب ما وقع قبل
 * القاعدة — فحسابٌ له افتتاحيٌّ سلفاً يبقى قابلاً للتعديل بقيد فرق.
 */
describe('لا افتتاحيَّ فوق حركةٍ سبقته (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const accounts: string[] = [];
  const suffix = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const CODE_MIN = 7300;
  const CODE_MAX = 7899;
  /** `MAX+1` من الدليل لحظةَ الإنشاء لا رقمٌ ثابت (ق-١٩٨ · ق-٢٧٩): حساباتُ هذه
   * المجموعة تكتسب أسطراً فلا تُحذف، **فرقمٌ ثابتٌ يمرّ مرّةً ويصطدم بعدها**. */
  async function nextFreeCode(): Promise<string> {
    const list = await auth(http().get('/accounts')).expect(200);
    const inRange = (list.body as { code: string }[])
      .map((a) => Number(a.code))
      .filter((n) => Number.isInteger(n) && n >= CODE_MIN && n <= CODE_MAX);
    const next = (inRange.length ? Math.max(...inRange) : CODE_MIN - 1) + 1;
    if (next > CODE_MAX) throw new Error(`نطاقُ رموز الاختبار ${CODE_MIN}-${CODE_MAX} امتلأ`);
    return String(next);
  }

  async function makeAccount(name: string, openingBalance = 0) {
    const res = await auth(http().post('/accounts'))
      .send({ code: await nextFreeCode(), name, type: 'asset', openingBalance })
      .expect(201);
    accounts.push(res.body.id);
    return res.body as { id: string; code: string; name: string };
  }

  /** قيدٌ متوازن بتاريخٍ معلوم على حسابين. */
  async function post(date: string, a: string, b: string, memo: string, expected = 201) {
    return auth(http().post('/journal'))
      .send({
        date,
        memo,
        lines: [
          { accountId: a, debit: 100, credit: 0 },
          { accountId: b, debit: 0, credit: 100 },
        ],
      })
      .expect(expected);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
  }, 30000);

  afterAll(async () => {
    for (const id of accounts) await auth(http().delete(`/accounts/${id}`));
    await app.close();
  });

  it('🔴 يرفض إعلانَ رصيدٍ افتتاحيّ لحسابٍ تحرّك قبل تاريخ الافتتاح — ويسمّي الحركة والمخرج', async () => {
    const moved = await makeAccount(`حسابٌ تحرّك ${suffix}`);
    const other = await makeAccount(`طرفٌ مقابل ${suffix}`);
    await post('1990-01-01', moved.id, other.id, `حركةٌ قديمة ${suffix}`);

    const refused = await auth(http().patch(`/accounts/${moved.id}`)).send({ openingBalance: 500 }).expect(409);

    expect(refused.body.message).toContain(moved.code);
    expect(refused.body.message).toContain('1990-01-01');
  }, 20000);

  it('ويمرّ حسابٌ لم يتحرّك قبل الافتتاح — فالمنعُ على التناقض لا على الافتتاحيّ', async () => {
    const clean = await makeAccount(`حسابٌ ساكن ${suffix}`);
    await auth(http().patch(`/accounts/${clean.id}`)).send({ openingBalance: 500 }).expect(200);
  }, 20000);

  it('🔴 وحسابٌ له افتتاحيٌّ سلفاً يُعدَّل ولو تحرّك قبله — فلا معاقبةَ على ما وقع قبل القاعدة', async () => {
    // إعلانٌ أوّل على حسابٍ نظيف، ثم حركةٌ قديمة، ثم تعديلٌ — يمرّ لأن
    // التعديلَ قيدُ فرقٍ على إعلانٍ قائم لا إعلانٌ جديد.
    const declared = await makeAccount(`حسابٌ معلَنٌ سلفاً ${suffix}`, 300);
    const other = await makeAccount(`طرفٌ مقابل ٢ ${suffix}`);
    await post('1990-01-01', declared.id, other.id, `حركةٌ بعد الإعلان ${suffix}`);

    await auth(http().patch(`/accounts/${declared.id}`)).send({ openingBalance: 800 }).expect(200);
  }, 20000);
});
