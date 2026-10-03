import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (17.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(55000);

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
  // منشأةٌ معزولة (ق-٧٢٢): الحساباتُ والبنوكُ تُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
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

    company = await registerIsolatedCompany(app, 'opening-date');
    token = company.token;
  }, 30000);

  afterAll(async () => {
    for (const id of banks) await auth(http().delete(`/banks/${id}`));
    for (const id of accounts) await auth(http().delete(`/accounts/${id}`));
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('🔴 تاريخٌ يعلنه التاجر يصير تاريخَ القيد الافتتاحيّ', async () => {
    const account = await makeAccount(`حسابٌ بتاريخٍ معلَن ${suffix}`, { openingBalance: 500, openingDate: '2026-03-15' });

    const row = await rowOf(account.id);
    expect(row.openingDateDeclared).toBe(true);
    expect(row.openingDate?.slice(0, 10)).toBe('2026-03-15');

    // والقيدُ نفسُه بالتاريخ المعلَن — **يُبحث عنه بمفتاحه لا بنصّه ولا بترتيب الصفحة**.
    //
    // ⚠️ **كان المفتاحُ `memo.includes(account.code)`** — **مطابقةٌ نصّيّةٌ جزئية**
    //    (`ق-٥٠٦`): رمزُ الحساب يقع داخل مذكّرةِ قيدٍ آخر لا يخصّه، **فيُقرأ تاريخُ
    //    غيره** — وسقط في السير على قاعدةٍ جديدة (`Expected 2026-03-15 · Received
    //    2026-12-31`)، **فليس تراكماً بل عطلاً يقع على نظيف** (`ق-٥٣٣`).
    //    **والمفتاحُ القويّ هو الرابطُ نفسُه**: `openingForAccountId` على القيد.
    //
    // ⭐ **والطُّعمُ مبنيٌّ في الحالة**: قيدٌ يدويّ لاحقُ التاريخ تحمل مذكّرتُه رمزَ
    //    الحساب — **يتصدّر القائمةَ (الأحدثُ أوّلاً) فيلتقطه المفتاحُ النصّيّ ويتركه
    //    المفتاحُ القويّ**. فالكسرُ الذي وقع في السير يُعاد هنا عمداً في كلّ تشغيل.
    const decoyA = await makeAccount(`طُعمٌ أ ${suffix}`);
    const decoyB = await makeAccount(`طُعمٌ ب ${suffix}`);
    const decoy = await auth(http().post('/journal'))
      .send({
        date: '2026-12-31',
        memo: `قيدٌ يحمل الرمز ${account.code} في مذكّرته ${suffix}`,
        lines: [
          { accountId: decoyA.id, debit: 1, credit: 0 },
          { accountId: decoyB.id, debit: 0, credit: 1 },
        ],
      })
      .expect(201);

    const listed = (await auth(http().get('/journal').query({ search: account.code, pageSize: 50 })).expect(200)).body as {
      items: { id: string; date: string; memo: string; openingForAccountId: string | null }[];
    };
    // الطُّعمُ حاضرٌ في القائمة فعلاً — وإلا فالحالةُ لا تقيس ما تدّعيه (ق-٤١٨).
    expect(listed.items.some((e) => e.id === decoy.body.id)).toBe(true);
    const opening = listed.items.find((e) => e.openingForAccountId === account.id);
    if (!opening) throw new Error('لا قيدَ افتتاحيّ للحساب — وقد أُنشئ برصيد');
    expect(opening.date.slice(0, 10)).toBe('2026-03-15');

    // التنظيفُ بالعكس لا بالحذف (ق-١٢٥٣/①) — والمنشأةُ معزولةٌ تُزال بأثرها كلِّه في النهاية.
    await auth(http().post(`/journal/${decoy.body.id}/reverse`)).send({ date: '2026-12-31' }).expect(201);
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
        .send({ name: `بنكُ التاريخ ${suffix}`, kind: 'BANK_ACCOUNT', openingBalance: 900, openingDate: '2026-02-01' })
        .expect(201)
    ).body as { id: string; accountId: string };
    banks.push(bank.id);

    const row = await rowOf(bank.accountId);
    // القيدُ بتاريخ الفتح المعلَن، فالعرضُ يقرؤه مشتقّاً ويطابقه.
    expect(row.openingDate?.slice(0, 10)).toBe('2026-02-01');
  }, 20000);

  /**
   * ⚖️ **إعادةُ إعلان التاريخ لا تمسّ قيداً افتتاحيّاً في فترةٍ مقفلة** (توجيه ٢٧٥ · القاعدةُ الدائمة ٣٧ · `ق-١٥٧٩`).
   *
   * كانت تحذف القيدَ القديم بلا فحصِ فترته ثم تُرحّل الجديدَ في فترته المفتوحة، فيتغيّر رصيدُ الفترة المقفلة صامتاً،
   * وهو ما ترفضه بوّابةُ القفل في كلِّ مسارٍ غيره (وحذفُ الحساب نفسُه يفحصها). **والرفضُ المتوقَّع هو رفضُ القفل بعينه**:
   * يُقرأ نصُّه من قيدٍ يدويٍّ في الشهر المقفل نفسِه، فلا يمرّ التوكيدُ برفضٍ لسببٍ آخر. والتاريخُ الجديد في شهرٍ مفتوح،
   * فلا يأتي الرفضُ من الترحيل الجديد.
   */
  async function closePeriod(year: number, month: number): Promise<string> {
    const body = (await auth(http().get('/fiscal-years')).expect(200)).body as
      | { periods: { id: string; year: number; month: number }[] }[]
      | { items: { periods: { id: string; year: number; month: number }[] }[] };
    const years = Array.isArray(body) ? body : body.items;
    const period = years.flatMap((y) => y.periods).find((p) => p.year === year && p.month === month);
    if (!period) throw new Error(`لا فترةَ ${year}-${month} في تقويم المنشأة، وقد رُحّل فيها قيدٌ افتتاحيّ`);
    await auth(http().patch(`/fiscal-years/periods/${period.id}/close`)).expect(200);
    return period.id;
  }

  async function closedPeriodRefusal(date: string): Promise<string> {
    const a = await makeAccount(`طرفُ رفضٍ أ ${suffix}-${date}`);
    const b = await makeAccount(`طرفُ رفضٍ ب ${suffix}-${date}`);
    const refused = await auth(http().post('/journal'))
      .send({ date, memo: `قيدٌ في فترةٍ مقفلة ${suffix}`, lines: [{ accountId: a.id, debit: 1, credit: 0 }, { accountId: b.id, debit: 0, credit: 1 }] })
      .expect(409);
    return refused.body.message as string;
  }

  const reopen = (periodId: string) =>
    auth(http().patch(`/fiscal-years/periods/${periodId}/reopen`)).send({ reason: 'إعادةُ فتحٍ بعد اختبار القفل' }).expect(200);

  it('🔴 حسابٌ ساكن قيدُه الافتتاحيّ في شهرٍ مقفل: نقلُ تاريخه يُرفض برفض القفل، والقيدُ باقٍ بتاريخه', async () => {
    const account = await makeAccount(`حسابٌ في شهرٍ مقفل ${suffix}`, { openingBalance: 400, openingDate: '2026-07-15' });
    const periodId = await closePeriod(2026, 7);
    try {
      const lockMessage = await closedPeriodRefusal('2026-07-20');

      const refused = await auth(http().patch(`/accounts/${account.id}`)).send({ openingDate: '2026-08-20' }).expect(409);
      expect(refused.body.message).toBe(lockMessage);

      const row = await rowOf(account.id);
      expect(row.openingDate?.slice(0, 10)).toBe('2026-07-15');
      expect(Number(row.openingBalance)).toBe(400);
    } finally {
      await reopen(periodId);
    }
  }, 30000);

  it('🔴 وبنكٌ ساكن تاريخُ فتحه في شهرٍ مقفل: المسارُ الثاني إلى الدالّة نفسِها يُرفض كذلك', async () => {
    const bank = (
      await auth(http().post('/banks'))
        .send({ name: `بنكٌ في شهرٍ مقفل ${suffix}`, kind: 'BANK_ACCOUNT', openingBalance: 650, openingDate: '2026-09-01' })
        .expect(201)
    ).body as { id: string; accountId: string };
    banks.push(bank.id);
    const periodId = await closePeriod(2026, 9);
    try {
      const lockMessage = await closedPeriodRefusal('2026-09-10');

      const refused = await auth(http().patch(`/banks/${bank.id}`)).send({ openingDate: '2026-10-05' }).expect(409);
      expect(refused.body.message).toBe(lockMessage);

      const row = await rowOf(bank.accountId);
      expect(row.openingDate?.slice(0, 10)).toBe('2026-09-01');
    } finally {
      await reopen(periodId);
    }
  }, 30000);
});
