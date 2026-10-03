import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { RETAINED_EARNINGS_CODE } from '../src/fiscal/year-closing.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * **قيدُ إقفال السنة المالية** (`ق-١٢٨٣` · د/③) — **بأرقامٍ محسوبةٍ يداً لا بمطابقة شكلَين**.
 *
 * الحالةُ كلُّها بثلاثة أرقام: إيرادٌ `1,000` · مصروفٌ `400` · **فالنتيجة `600`**.
 * ومنها يُقرأ كلُّ توكيدٍ أدناه — فلو حسب النظامُ بطريقةٍ أخرى وأعطى الشكلَ نفسَه
 * **لسقط الحارس** (`§8.30` الوجه الثاني).
 *
 * ① السنةُ لا تُقفل وفيها فترةٌ مفتوحة — رفضٌ يسمّي الفترة.
 * ② وبعد إغلاق الاثنتي عشرة: **قيدٌ واحد** يُصفّر الإيرادَ والمصروف ويُدائن `3300` بـ`600`.
 * ③ والمركزُ المالي بتاريخ النهاية: **لا سطرَ «نتيجة الفترة»** (زال بالإقفال)، و`3300` فيه `600`، ومتوازن.
 * ④ وإقفالٌ ثانٍ يُرفض مسمّىً.
 * ⑤ وإعادةُ فتح فترةٍ **تعكس القيدَ آلياً بقيدٍ مرقَّم بتاريخه** — فيعود السطرُ المؤقّت ويعود `3300` صفراً.
 *
 * ⚠️ **والسنةُ ماضيةٌ (٢٠٢٤) عمداً**: عكسٌ بتاريخ **اليوم** يقع خارجها، فلا يراه المركزُ
 * المالي بتاريخ نهايتها — **وبها وحدَها يسقط الحارسُ على ذلك الكسر**. وأوّلُ صياغةٍ
 * جعلتها السنةَ الجارية، **فمرّ كسرُ «العكسُ بتاريخ اليوم» أخضرَ** (`§8.8`: كسرٌ يمرّ
 * يعني أن سطحَ الحارس أضيقُ من القاعدة).
 * ⑥ ثم يُقفل من جديد — فالإقفالُ يُعاد توليدُه لا يُحبَس.
 */
jest.setTimeout(120000);

describe('إقفالُ السنة المالية بقيدٍ واحد (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let yearId: string;
  let periodIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  interface AccountRow { id: string; code: string; name: string; type: string }
  interface SheetLine { code: string; name: string; amount: string }
  interface Sheet { asOf: string | null; equity: SheetLine[]; balanced: boolean }

  const accountByCode = async (code: string): Promise<AccountRow> => {
    const list = (await auth(http().get('/accounts')).expect(200)).body as AccountRow[];
    const row = list.find((a) => a.code === code);
    if (!row) throw new Error(`لا حساب بالرمز ${code} في الدليل`);
    return row;
  };

  const sheetAt = async (to: string): Promise<Sheet> => (await auth(http().get(`/reports/balance-sheet?to=${to}`)).expect(200)).body as Sheet;

  const periodResultLine = (sheet: Sheet) => sheet.equity.find((l) => l.name.includes('نتيجة الفترة'));
  const retainedLine = (sheet: Sheet) => sheet.equity.find((l) => l.code === RETAINED_EARNINGS_CODE);

  const closeAllPeriods = async (skip = 0) => {
    for (const id of periodIds.slice(skip)) await auth(http().patch(`/fiscal-years/periods/${id}/close`)).expect(200);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'year-closing');
    token = company.token;

    // السنةُ قبل الحركة: منذ `ق-١٥٨٤` يُنشئ ترحيلٌ في 2024 سنتَه بنفسه، فتعريفُها بعده يتقاطع معها `409`.
    const year = (await auth(http().post('/fiscal-years')).send({ name: 'سنةُ الإقفال ٢٠٢٤', start: '2024-01-01', end: '2024-12-31' }).expect(201)).body as {
      id: string;
      periods: { id: string }[];
    };
    yearId = year.id;
    periodIds = year.periods.map((p) => p.id);
    expect(periodIds).toHaveLength(12);

    // ثم الحركةُ — قبل أي فترةٍ تُقفل.
    const [receivable, sales, admin, cash] = await Promise.all([accountByCode('1200'), accountByCode('4100'), accountByCode('5300'), accountByCode('1000')]);
    await auth(http().post('/journal'))
      .send({ date: '2024-03-01', memo: 'بيعٌ للسنة', lines: [{ accountId: receivable.id, debit: 1000, credit: 0 }, { accountId: sales.id, debit: 0, credit: 1000 }] })
      .expect(201);
    await auth(http().post('/journal'))
      .send({ date: '2024-04-01', memo: 'مصروفٌ للسنة', lines: [{ accountId: admin.id, debit: 400, credit: 0 }, { accountId: cash.id, debit: 0, credit: 400 }] })
      .expect(201);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① لا إقفالَ وفيها فترةٌ مفتوحة — والرفضُ يسمّي الفترة', async () => {
    // إحدى عشرة مغلقة وواحدةٌ مفتوحة: الرفضُ يجب أن يسمّي **المفتوحة** لا أيَّ فترة.
    await closeAllPeriods(1);
    const res = await auth(http().post(`/fiscal-years/${yearId}/close`)).expect(409);
    expect(String(res.body.message)).toContain('01/2024');
  });

  it('⭐ ② قيدٌ واحد يُصفّر الإيرادَ والمصروف ويُدائن الأرباحَ المبقاة بـ٦٠٠', async () => {
    await auth(http().patch(`/fiscal-years/periods/${periodIds[0]}/close`)).expect(200);

    const res = await auth(http().post(`/fiscal-years/${yearId}/close`)).expect(201);
    const body = res.body as {
      netResult: number;
      accounts: number;
      entry: { no: string; date: string; memo: string; lines: { debit: string; credit: string; account: { code: string } }[] };
    };
    // ١٠٠٠ − ٤٠٠ = ٦٠٠ — محسوبةٌ يداً، لا مقروءةٌ من التقرير نفسِه.
    expect(body.netResult).toBe(600);
    expect(body.accounts).toBe(2);
    expect(body.entry.no).toBeTruthy();

    const entry = body.entry;
    expect(entry.date.slice(0, 10)).toBe('2024-12-31');
    expect(entry.memo).toContain('600.00');
    const side = (code: string) => {
      const l = entry.lines.find((x) => x.account.code === code);
      if (!l) throw new Error(`لا سطر للحساب ${code}`);
      return { debit: Number(l.debit), credit: Number(l.credit) };
    };
    // الإيرادُ يُصفَّر بالمدين، والمصروفُ بالدائن، والفرقُ دائنٌ للمبقاة.
    expect(side('4100')).toEqual({ debit: 1000, credit: 0 });
    expect(side('5300')).toEqual({ debit: 0, credit: 400 });
    expect(side(RETAINED_EARNINGS_CODE)).toEqual({ debit: 0, credit: 600 });
    expect(entry.lines).toHaveLength(3);
  });

  it('⭐ ③ والمركزُ المالي بتاريخ النهاية: لا سطرَ «نتيجة الفترة»، والمبقاةُ ٦٠٠، ومتوازن', async () => {
    const sheet = await sheetAt('2024-12-31');
    expect(sheet.asOf).toBe('2024-12-31');
    expect(periodResultLine(sheet)).toBeUndefined();
    expect(retainedLine(sheet)?.amount).toBe('600.00');
    expect(sheet.balanced).toBe(true);
  });

  it('④ وإقفالٌ ثانٍ يُرفض مسمّىً', async () => {
    const res = await auth(http().post(`/fiscal-years/${yearId}/close`)).expect(409);
    expect(String(res.body.message)).toContain('مقفلة');
  });

  it('⭐ ⑤ إعادةُ فتح فترةٍ تعكس الإقفال بقيدٍ مرقَّم بتاريخه — فيعود السطرُ المؤقّت', async () => {
    await auth(http().patch(`/fiscal-years/periods/${periodIds[5]}/reopen`)).send({ reason: 'إعادةُ فتحٍ في الاختبار' }).expect(200);

    const sheet = await sheetAt('2024-12-31');
    expect(periodResultLine(sheet)?.amount).toBe('600.00');
    // المبقاةُ تعود صفراً — فلا يبقى أثرُ إقفالٍ على أرقامٍ تغيّرت.
    expect(Number(retainedLine(sheet)?.amount ?? 0)).toBe(0);
    expect(sheet.balanced).toBe(true);
  });

  it('⑥ ثم يُقفل من جديد — يُعاد توليدُه لا يُحبَس', async () => {
    await auth(http().patch(`/fiscal-years/periods/${periodIds[5]}/close`)).expect(200);
    const again = await auth(http().post(`/fiscal-years/${yearId}/close`)).expect(201);
    expect((again.body as { netResult: number }).netResult).toBe(600);

    const sheet = await sheetAt('2024-12-31');
    expect(periodResultLine(sheet)).toBeUndefined();
    expect(retainedLine(sheet)?.amount).toBe('600.00');
  });
});
