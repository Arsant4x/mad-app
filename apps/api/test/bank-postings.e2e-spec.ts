import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

interface Account { id: string; code: string; balance: string }
interface Bank { id: string; name: string; accountId: string }
interface JournalLine { accountId: string; debit: string; credit: string }
interface JournalEntry { id: string; no: string; lines?: JournalLine[] }

/**
 * **(ب٢) — نقدُ البنك يدخل حسابَ البنك لا `1000`** (`ق-٢٧٦` · `ق-٢٧٧`).
 *
 * العطلُ قبلها: `postCustomerPaymentEntry` و`postRentPaymentEntry` يُدينان `1000`
 * **دائماً** — فدفعةٌ تُقبض على بنكٍ تُقرأ صندوقاً، **وتسويةُ الاثنين مستحيلة**.
 */
describe('Bank postings — cash lands in the bank account (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): البنكُ يُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  let bank: Bank;
  let customerId = '';
  const cleanup: { payments: string[]; banks: string[] } = { payments: [], banks: [] };

  const accounts = async (): Promise<Account[]> => (await auth(http().get('/accounts')).expect(200)).body;
  const entriesPage = async (): Promise<JournalEntry[]> =>
    ((await auth(http().get('/journal?pageSize=100')).expect(200)).body as { items: JournalEntry[] }).items;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'bank-postings');
    token = company.token;
    bank = (await auth(http().post('/banks')).send({ name: `بنك الترحيل ${suffix}`, openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body;
    cleanup.banks.push(bank.id);
    customerId = (await auth(http().post('/customers')).send({ name: `عميل الترحيل ${suffix}` }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    for (const id of cleanup.payments) await auth(http().delete(`/payments/${id}`));
    for (const id of cleanup.banks) await auth(http().delete(`/banks/${id}`));
    if (customerId) {
      await auth(http().delete(`/customers/${customerId}`));
      await auth(http().delete(`/trash/customers/${customerId}`));
    }
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('🔴 ① دفعةُ عميلٍ على بنك: القيدُ يُدين **حساب البنك** لا `1000`', async () => {
    const cashBefore = (await accounts()).find((a) => a.code === '1000');
    const amount = 750;

    const payment = (await auth(http().post('/payments'))
      // اليومُ لا تاريخٌ قديم: قائمةُ اليومية مرتَّبةٌ تنازلياً بالتاريخ وتُصفَّح
      // بمئة — فقيدٌ في يونيو **يقع خارج الصفحة الأولى** على قاعدةٍ عامرة،
      // فيُقرأ «لا قيد» وهو موجود. (والرصيدان أعلاه أثبتا الترحيل أصلاً.)
      .send({ customerId, amount, method: 'BANK', bankId: bank.id, date: new Date().toISOString().slice(0, 10) })
      .expect(201)).body as { id: string };
    cleanup.payments.push(payment.id);

    const after = await accounts();
    const bankAccount = after.find((a) => a.id === bank.accountId);
    const cashAfter = after.find((a) => a.code === '1000');

    // حسابُ البنك تحرّك بالمبلغ، و`1000` لم يتحرّك.
    expect(Number(bankAccount!.balance)).toBe(amount);
    expect(Number(cashAfter!.balance)).toBe(Number(cashBefore!.balance));

    // والقيدُ نفسه يحمل سطراً مديناً على حساب البنك.
    const entry = (await entriesPage()).find((e) => (e.lines ?? []).some((l) => l.accountId === bank.accountId));
    expect(entry).toBeTruthy();
    const line = entry!.lines!.find((l) => l.accountId === bank.accountId)!;
    expect(Number(line.debit)).toBe(amount);
  });

  it('② ودفعةٌ نقدية تبقى على `1000` — فالتبديلُ مشروطٌ بالبنك لا مطلق', async () => {
    const before = (await accounts()).find((a) => a.code === '1000');
    const amount = 120;

    const payment = (await auth(http().post('/payments'))
      .send({ customerId, amount, method: 'CASH', date: '2026-06-02' })
      .expect(201)).body as { id: string };
    cleanup.payments.push(payment.id);

    const cashAfter = (await accounts()).find((a) => a.code === '1000');
    expect(Number(cashAfter!.balance)).toBe(Number(before!.balance) + amount);
  });
});
