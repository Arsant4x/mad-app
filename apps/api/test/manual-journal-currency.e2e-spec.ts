import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyBaseCurrency } from '../src/common/currency/base-amount.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(120000);

/**
 * ⚖️ **القيدُ اليدويّ يرفض حقلَي العملة والسعر صراحةً برسالة، ورمزُ العملة يُوحَّد بأحرفٍ كبيرة** (توجيه ٢٧٥ · `ق-١٥٨٥`،
 * بحكم صاحب المشروع).
 *
 * المقيسُ في توجيه ٢٧٤: `JournalService.create` يقبل الحقلين في الـDTO (يرثهما من `CurrencyFieldsDto`) ثم لا يمرّرهما، فيُخزَّن
 * القيدُ بعملة الأساس وسعر ١ أيّاً كان المرسَل، بلا كلمةٍ للمرسِل. ورمزُ العملة يُخزَّن كما أُرسل مشذَّباً: `sar` صفٌّ و`SAR` صفّ.
 */
describe('القيدُ اليدويّ يرفض العملةَ والسعر، والرمزُ بأحرفٍ كبيرة (ق-١٥٨٥) (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  let base: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'manual-journal-currency');
    base = await inTenant((tx) => companyBaseCurrency(tx, company.companyId));
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 3.3] 🔴 ① القيدُ اليدويّ بحقل العملة أو السعر يُرفض برسالةٍ تسمّيهما، ولا يُكتب قيد؛ وبلاهما يُقبل', async () => {
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const cash = accounts.find((a) => a.code === '1000')!.id;
    const revenue = accounts.find((a) => a.code === '4100')!.id;
    const entry = (memo: string, extra: Record<string, unknown>) =>
      auth(http().post('/journal')).send({ date: today, memo, lines: [{ accountId: cash, debit: 10, credit: 0 }, { accountId: revenue, debit: 0, credit: 10 }], ...extra });
    const countOf = (memo: string) => inTenant((tx) => tx.journalEntry.count({ where: { memo } }));

    const sent = [{ currency: base }, { exchangeRate: 1 }, { currency: 'XTS', exchangeRate: 3.75 }];
    const outcomes: { status: number; namesFields: boolean; written: number }[] = [];
    for (const [i, extra] of sent.entries()) {
      const memo = `قيدٌ بعملة ${i} ${suffix}`;
      const res = await entry(memo, extra);
      const message = String(res.body.message ?? '');
      outcomes.push({ status: res.status, namesFields: message.includes('العملة') && message.includes('سعر الصرف'), written: await countOf(memo) });
    }
    expect(outcomes).toEqual(sent.map(() => ({ status: 400, namesFields: true, written: 0 })));
    await entry(`قيدٌ بلا عملة ${suffix}`, {}).expect(201);
  });

  it('🔴 ② رمزُ العملة يُخزَّن بأحرفٍ كبيرة: فاتورةٌ بعملة الأساس مكتوبةً بأحرفٍ صغيرة تُخزَّن برمزها الموحَّد', async () => {
    const lower = base.toLowerCase();
    // مجسٌّ للمجسّ: الرمزُ تغيّر فعلاً — وإلا فالحالةُ لا تختبر شيئاً.
    expect(lower).not.toBe(base);
    const customerId = await createTenantCustomer(app, company.token, `عميل الرمز ${suffix}`);
    const invoice = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today, dueDate: today, currency: lower, lines: [{ description: `بندُ الرمز ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
        .expect(201)
    ).body as { id: string };
    const stored = await inTenant((tx) => tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { currency: true } }));
    expect(stored.currency).toBe(base);
  });
});
