import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (15.0 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(50000);

/**
 * ⚖️ **القيدُ المرحَّل يُعكس ولا يُحذف** (`ق-١٢٥٣`/① — التوجيه ٢٤٧).
 *
 * **العطلُ المقيس قبل الإصلاح** (المسحُ الشامل ① A1): `DELETE /journal/:id` على قيدٍ يدويّ
 * مرحَّل كان يعكس الأرصدةَ **ثم يحذف الصفَّ وسطورَه** ويحرق رقمَه في التسلسل — نقيضُ
 * «المرحَّلُ يُعكس ولا يُحذف». الحالةُ ① أدناه **سقطت على الشيفرة القديمة** (`204` والصفُّ
 * يختفي) وهي التي تقيس أنه يقع.
 *
 * ما يُقاس: ① الحذفُ يُرفض `409` بمسمّاه والأصلُ باقٍ · ② العكسُ قيدٌ جديد مرقَّمٌ بسطورٍ
 * مقلوبة يعيد الأرصدةَ ولا يمسّ الأصل، **ولا فجوةَ ترقيم** · ③ لا عكسَ لمعكوسٍ ولا لعكسيّ ·
 * ④ الآليُّ يتبع مستندَه · ⑤ العكسُ يخضع لقفل الفترات على تاريخه هو.
 */
describe('⚖️ القيدُ المرحَّل يُعكس ولا يُحذف (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let company: IsolatedCompany;
  let cashId: string;
  let revenueId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);

  const balances = async (): Promise<Record<string, number>> => {
    const rows = (await auth(http().get('/accounts')).expect(200)).body as { id: string; balance: string }[];
    return Object.fromEntries(rows.map((a) => [a.id, Number(a.balance)]));
  };
  const postEntry = (memo: string, amount: number, date = today()) =>
    auth(http().post('/journal')).send({
      date,
      memo: `${memo} ${suffix}`,
      lines: [
        { accountId: cashId, debit: amount, credit: 0 },
        { accountId: revenueId, debit: 0, credit: amount },
      ],
    });
  const seqOf = (no: string) => Number(no.split('-').pop());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    company = await registerIsolatedCompany(app, 'journal-reversal');
    token = company.token;
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    cashId = accounts.find((a) => a.code === '1000')!.id;
    revenueId = accounts.find((a) => a.code === '4100')!.id;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('① الحذفُ يُرفض بمسمّاه — والأصلُ باقٍ برقمه وسطوره', async () => {
    const entry = (await postEntry('قيدٌ يُطلب حذفُه', 300).expect(201)).body as { id: string; no: string };
    const res = await auth(http().delete(`/journal/${entry.id}`)).expect(409);
    expect(String(res.body.message)).toContain(entry.no);
    expect(String(res.body.message)).toContain('عكس');

    const page = (await auth(http().get('/journal').query({ search: entry.no, pageSize: 50 })).expect(200)).body as { items: { id: string; lines: unknown[] }[] };
    const still = page.items.find((e) => e.id === entry.id);
    expect(still).toBeTruthy();
    expect(still!.lines).toHaveLength(2);
  }, 60000);

  it('② العكسُ قيدٌ جديدٌ مرقَّمٌ بسطورٍ مقلوبة يعيد الأرصدة — والأصلُ لا يُمسّ ولا فجوةَ ترقيم', async () => {
    const before = await balances();
    const original = (await postEntry('قيدٌ يُعكس', 450).expect(201)).body as { id: string; no: string; memo: string };
    const mid = await balances();
    expect(mid[cashId] - before[cashId]).toBeCloseTo(450, 2);

    const reversal = (await auth(http().post(`/journal/${original.id}/reverse`)).send({}).expect(201)).body as {
      id: string;
      no: string;
      memo: string;
      reversalOfId: string;
      auto: boolean;
      lines: { accountId: string; debit: string; credit: string }[];
    };
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.auto).toBe(false);
    expect(reversal.memo).toContain(`عكس القيد ${original.no}`);
    // السطورُ مقلوبة: النقدُ دائنٌ والإيرادُ مدينٌ بالمبلغ نفسِه.
    const cash = reversal.lines.find((l) => l.accountId === cashId)!;
    const revenue = reversal.lines.find((l) => l.accountId === revenueId)!;
    expect(Number(cash.credit)).toBeCloseTo(450, 2);
    expect(Number(cash.debit)).toBe(0);
    expect(Number(revenue.debit)).toBeCloseTo(450, 2);
    // **ولا فجوةَ ترقيم**: العكسُ يلي الأصلَ مباشرةً، والأصلُ باقٍ.
    expect(seqOf(reversal.no)).toBe(seqOf(original.no) + 1);

    const after = await balances();
    expect(after[cashId]).toBeCloseTo(before[cashId], 2);
    expect(after[revenueId]).toBeCloseTo(before[revenueId], 2);

    const page = (await auth(http().get('/journal').query({ search: original.no, pageSize: 50 })).expect(200)).body as {
      items: { id: string; reversedBy: { no: string } | null; reversalOf: { no: string } | null }[];
    };
    const listedOriginal = page.items.find((e) => e.id === original.id);
    expect(listedOriginal?.reversedBy?.no).toBe(reversal.no);
    const listedReversal = page.items.find((e) => e.id === reversal.id);
    expect(listedReversal?.reversalOf?.no).toBe(original.no);
  }, 60000);

  it('③ لا عكسَ لمعكوسٍ سلفاً ولا لقيدٍ عكسيّ — كلٌّ برسالته', async () => {
    const original = (await postEntry('قيدٌ يُعكس مرّةً', 120).expect(201)).body as { id: string; no: string };
    const reversal = (await auth(http().post(`/journal/${original.id}/reverse`)).send({}).expect(201)).body as { id: string; no: string };

    const twice = await auth(http().post(`/journal/${original.id}/reverse`)).send({}).expect(409);
    expect(String(twice.body.message)).toContain(reversal.no);

    const ofReversal = await auth(http().post(`/journal/${reversal.id}/reverse`)).send({}).expect(409);
    expect(String(ofReversal.body.message)).toContain(reversal.no);
  }, 60000);

  it('④ الآليُّ يتبع مستندَه — لا يُعكس هنا ولا يُحذف', async () => {
    const customer = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل عكس ${suffix}` }).expect(201)).body as { id: string };
    const invoice = (await auth(http().post('/invoices'))
      .send({ customerId: customer.id, issueDate: today(), dueDate: today(), lines: [{ description: 'خدمة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201)).body as { journalEntryId: string };
    expect(invoice.journalEntryId).toBeTruthy();
    await auth(http().post(`/journal/${invoice.journalEntryId}/reverse`)).send({}).expect(409);
    await auth(http().delete(`/journal/${invoice.journalEntryId}`)).expect(409);
  }, 60000);

  it('⑤ العكسُ يخضع لقفل الفترات على تاريخه هو — فترةٌ مقفلة ترفضه، وبعد فتحها يمرّ', async () => {
    const year = Number(today().slice(0, 4));
    // سنةُ اليوم وُلدت مع المنشأة (`ق-١٥٨٤`) — تُقرأ ولا تُنشأ.
    const years = (await auth(http().get('/fiscal-years')).expect(200)).body as { start: string; periods: { id: string; month: number; year: number }[] }[];
    const fy = years.find((y) => y.start.slice(0, 10) === `${year}-01-01`)!;
    const original = (await postEntry('قيدٌ في فترةٍ ستُقفل', 75).expect(201)).body as { id: string };
    const month = Number(today().slice(5, 7));
    const period = fy.periods.find((p) => p.month === month && p.year === year)!;
    await auth(http().patch(`/fiscal-years/periods/${period.id}/close`)).expect(200);

    // التاريخُ الافتراضيُّ (اليوم) داخل الفترة المقفلة ⇒ مرفوض؛ والأصلُ لا يُمسّ.
    await auth(http().post(`/journal/${original.id}/reverse`)).send({}).expect(409);

    await auth(http().patch(`/fiscal-years/periods/${period.id}/reopen`)).send({ reason: 'إعادةُ فتحٍ في الاختبار' }).expect(200);
    await auth(http().post(`/journal/${original.id}/reverse`)).send({}).expect(201);
  }, 60000);
});
