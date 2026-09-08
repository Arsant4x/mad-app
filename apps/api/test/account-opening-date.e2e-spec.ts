import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * **تاريخُ الافتتاح يُعلَن ولا يُشتقّ** (`ق-٢٩٦`).
 *
 * كان تاريخُ القيد الافتتاحيّ **أثرَ توقيتِ سكربت**: بدايةُ السنة المالية أو
 * اليوم. فصار للتاجر أن يُعلنه، **والفراغُ يعني «لم يُعلَن»** فيُشتقّ عند
 * العرض من القيد نفسه — **فلا يُكتب مشتقٌّ في خانةِ إعلان**.
 */
describe('تاريخُ الافتتاح المعلَن (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const accounts: string[] = [];
  const banks: string[] = [];
  const suffix = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  interface AccountRow {
    id: string;
    code: string;
    name: string;
    openingBalance: string;
    openingDate: string | null;
    openingDateDeclared: boolean;
  }

  const CODE_MIN = 7300;
  const CODE_MAX = 7899;
  /** `MAX+1` من الدليل لحظةَ الإنشاء لا رقمٌ ثابت (ق-١٩٨ · ق-٢٧٩). */
  async function nextFreeCode(): Promise<string> {
    const list = (await auth(http().get('/accounts')).expect(200)).body as AccountRow[];
    const inRange = list.map((a) => Number(a.code)).filter((n) => Number.isInteger(n) && n >= CODE_MIN && n <= CODE_MAX);
    const next = (inRange.length ? Math.max(...inRange) : CODE_MIN - 1) + 1;
    if (next > CODE_MAX) throw new Error(`نطاقُ رموز الاختبار ${CODE_MIN}-${CODE_MAX} امتلأ`);
    return String(next);
  }

  async function makeAccount(name: string, body: Record<string, unknown> = {}) {
    const res = await auth(http().post('/accounts'))
      .send({ code: await nextFreeCode(), name, type: 'asset', ...body })
      .expect(201);
    accounts.push(res.body.id);
    return res.body as { id: string; code: string; name: string };
  }

  const rowOf = async (id: string): Promise<AccountRow> => {
    const list = (await auth(http().get('/accounts')).expect(200)).body as AccountRow[];
    const row = list.find((a) => a.id === id);
    if (!row) throw new Error('الحسابُ غائبٌ عن الدليل — وقد أنشأه الاختبار');
    return row;
  };

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
    for (const id of banks) await auth(http().delete(`/banks/${id}`));
    for (const id of accounts) await auth(http().delete(`/accounts/${id}`));
    await app.close();
  });

  it('🔴 تاريخٌ يعلنه التاجر يصير تاريخَ القيد الافتتاحيّ', async () => {
    const account = await makeAccount(`حسابٌ بتاريخٍ معلَن ${suffix}`, { openingBalance: 500, openingDate: '2026-03-15' });

    const row = await rowOf(account.id);
    expect(row.openingDateDeclared).toBe(true);
    expect(row.openingDate?.slice(0, 10)).toBe('2026-03-15');

    // والقيدُ نفسُه بالتاريخ المعلَن — **يُبحث عنه برمزه لا بترتيب الصفحة**:
    // القائمةُ مصفَّحة، و«أوّلُ ما تجده» يربط النتيجةَ بترتيبٍ لا يملكه الاختبار.
    const listed = (await auth(http().get('/journal').query({ search: account.code, pageSize: 50 })).expect(200)).body as {
      items: { date: string; memo: string }[];
    };
    const opening = listed.items.find((e) => e.memo.includes(account.code));
    if (!opening) throw new Error('لا قيدَ افتتاحيّ للحساب — وقد أُنشئ برصيد');
    expect(opening.date.slice(0, 10)).toBe('2026-03-15');
  }, 20000);

  it('🔴 وحسابٌ بلا تاريخٍ معلَن: العمودُ فارغ، والعرضُ يشتقّه من القيد', async () => {
    const account = await makeAccount(`حسابٌ بلا إعلان ${suffix}`, { openingBalance: 300 });

    const row = await rowOf(account.id);
    // **المشتقُّ يُعرض ولا يُكتب** — فالتمييزُ باقٍ.
    expect(row.openingDateDeclared).toBe(false);
    expect(row.openingDate).not.toBeNull();
  }, 20000);

  it('🔴 والتعديلُ يُعيد ترحيلَ الافتتاحيّ ما دام الحسابُ ساكناً', async () => {
    const account = await makeAccount(`حسابٌ يُعاد تأريخه ${suffix}`, { openingBalance: 700, openingDate: '2026-04-01' });

    await auth(http().patch(`/accounts/${account.id}`)).send({ openingDate: '2026-05-20' }).expect(200);

    const row = await rowOf(account.id);
    expect(row.openingDate?.slice(0, 10)).toBe('2026-05-20');
    // والرصيدُ لم يتغيّر — أُعيد الترحيلُ لا أُضيف قيدٌ ثانٍ.
    expect(Number(row.openingBalance)).toBe(700);
  }, 20000);

  it('🔴 ويُرفض بعد أول حركة — والرسالةُ تسمّي الحركة وتدلّ على المخرج', async () => {
    const account = await makeAccount(`حسابٌ تحرّك ${suffix}`, { openingBalance: 100, openingDate: '2026-04-01' });
    const other = await makeAccount(`طرفٌ مقابل ${suffix}`);

    await auth(http().post('/journal'))
      .send({
        date: '2026-06-10',
        memo: `حركةٌ تقفل التاريخ ${suffix}`,
        lines: [
          { accountId: account.id, debit: 50, credit: 0 },
          { accountId: other.id, debit: 0, credit: 50 },
        ],
      })
      .expect(201);

    const refused = await auth(http().patch(`/accounts/${account.id}`)).send({ openingDate: '2026-05-20' }).expect(409);
    expect(refused.body.message).toContain(account.code);
    expect(refused.body.message).toContain('2026-06-10');
  }, 20000);

  it('⭐ وتاريخُ فتح البنك يصل الأستاذ — الحقلُ الميت حيّ', async () => {
    const bank = (
      await auth(http().post('/banks'))
        .send({ name: `بنكُ التاريخ ${suffix}`, openingBalance: 900, openingDate: '2026-02-01' })
        .expect(201)
    ).body as { id: string; accountId: string };
    banks.push(bank.id);

    const row = await rowOf(bank.accountId);
    // القيدُ بتاريخ الفتح المعلَن، فالعرضُ يقرؤه مشتقّاً ويطابقه.
    expect(row.openingDate?.slice(0, 10)).toBe('2026-02-01');
  }, 20000);
});
