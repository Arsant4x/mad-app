import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma } from '@mad-app/db';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { SUPPORTED_REGIONS } from '../src/common/region/regions';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { purgeInvoicesForTest } from './purge-invoices';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (20.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(63000);

/**
 * 🔴 `ق-١٣٦٨` — **الدولةُ صفةٌ للمنشأة**: الميلادُ يكتب الحقولَ الأربعة من سجلّ الأقاليم (ولا افتراضَ في القاعدة)، ودولةٌ لا تخدمها
 * المنصّةُ تُرفض مسمّاةً، **والمواضعُ التسعة التي كانت تسقط إلى الريال تقرأ عملةَ المنشأة**.
 *
 * والتاسعةُ تُثبَت بمنشأةٍ عملتُها **غيرُ الريال** — وإلا مرّ الإثباتُ على الريال الثابت نفسِه فلا يُثبت شيئاً. والعملةُ هنا `AED`
 * صفّاً في منشأة الاختبار وحدَها (لا إقليمٌ يُضاف إلى المنصّة — `ق-١٣٥٠`: لا يُبنى اليوم شيءٌ لدولةٍ أخرى).
 */
const OTHER_BASE = 'AED';

describe('Company region — country, time zone, locale and base currency on the company (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'region');
    token = company.token;
  });

  afterAll(async () => {
    if (invoiceIds.length) await purgeInvoicesForTest(tenantPrisma, company.companyId, invoiceIds);
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);
  const today = () => new Date().toISOString().slice(0, 10);

  it('① الميلادُ يكتب الحقولَ الأربعة من سجلّ الأقاليم — لا من افتراضٍ في القاعدة', async () => {
    const row = await prisma.company.findUniqueOrThrow({ where: { id: company.companyId }, select: { country: true, timeZone: true, locale: true, baseCurrency: true } });
    const [only] = Object.values(SUPPORTED_REGIONS);
    expect(row).toEqual({ country: only.country, timeZone: only.timeZone, locale: only.locale, baseCurrency: only.baseCurrency });
    // ولا افتراضَ في القاعدة للأربعة — صفٌّ بلا دولةٍ لا يولد سعودياً بصمت.
    const defaults = await prisma.$queryRaw<{ column_name: string; column_default: string | null; is_nullable: string }[]>`
      SELECT column_name, column_default, is_nullable FROM information_schema.columns
      WHERE table_name = 'companies' AND column_name IN ('country', 'timeZone', 'locale', 'baseCurrency') ORDER BY column_name`;
    expect(defaults).toHaveLength(4);
    expect(defaults.filter((d) => d.column_default !== null || d.is_nullable !== 'NO')).toEqual([]);
  });

  it('② دولةٌ لا تخدمها المنصّةُ تُرفض مسمّاةً — قبل أن يُكتب صفّ', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const res = await http()
      .post('/auth/register')
      .send({ orgName: `منشأة دولة ${stamp}`, username: `iso-region-zz-${stamp}`, password: 'IsoPass123!', country: 'ZZ' })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('ZZ');
    expect(await prisma.loginIdentity.count({ where: { username: `iso-region-zz-${stamp}` } })).toBe(0);
  });

  it('③ ⭐ المواضعُ التسعة تقرأ عملةَ المنشأة — لا الريال — لمستندٍ بلا عملةٍ صريحة', async () => {
    await prisma.company.update({ where: { id: company.companyId }, data: { baseCurrency: OTHER_BASE } });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const currencyOf: Record<string, string> = {};

    // ١ البنك
    const bank = await auth(http().post('/banks')).send({ name: `بنك الإقليم ${suffix}`, kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    currencyOf.bank = (await inTenant((tx) => tx.bank.findUniqueOrThrow({ where: { id: bank.body.id } }))).currency;

    // ٢ الحركةُ البنكية
    const trx = await auth(http().post('/transactions')).send({ bankId: bank.body.id, date: today(), description: `حركةُ الإقليم ${suffix}`, amount: 10 }).expect(201);
    currencyOf.transaction = (await inTenant((tx) => tx.bankTransaction.findUniqueOrThrow({ where: { id: trx.body.id } }))).currency;

    // ٣ القيدُ اليدويّ (مسارُ كلِّ ترحيل)
    const accounts = await auth(http().get('/accounts')).expect(200);
    const list = (Array.isArray(accounts.body) ? accounts.body : accounts.body.items) as { id: string; code: string }[];
    const cash = list.find((a) => a.code === '1000')!;
    const capital = list.find((a) => a.code.startsWith('3'))!;
    expect(cash && capital).toBeTruthy();
    const je = await auth(http().post('/journal'))
      .send({ date: today(), memo: `قيدُ الإقليم ${suffix}`, lines: [{ accountId: cash.id, debit: 5, credit: 0 }, { accountId: capital.id, debit: 0, credit: 5 }] })
      .expect(201);
    currencyOf.journal = (await inTenant((tx) => tx.journalEntry.findUniqueOrThrow({ where: { id: je.body.id } }))).currency;

    // ٤ الفاتورة · ٥ عرضُ السعر · ٦ سندُ القبض
    const customerId = await createTenantCustomer(app, token, `عميل الإقليم ${suffix}`);
    const inv = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: today(), dueDate: today(), lines: [{ description: `بندُ الإقليم ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    invoiceIds.push(inv.body.id);
    currencyOf.invoice = (await inTenant((tx) => tx.invoice.findUniqueOrThrow({ where: { id: inv.body.id } }))).currency;
    const quote = await auth(http().post('/quotes'))
      .send({ customerId, issueDate: today(), validUntil: today(), lines: [{ description: `عرضُ الإقليم ${suffix}`, quantity: 1, unitPrice: 50, taxRate: 15 }] })
      .expect(201);
    currencyOf.quote = (await inTenant((tx) => tx.quote.findUniqueOrThrow({ where: { id: quote.body.id } }))).currency;
    const pay = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 20, method: 'CASH', unallocated: 'ON_ACCOUNT' }).expect(201);
    currencyOf.payment = (await inTenant((tx) => tx.payment.findUniqueOrThrow({ where: { id: pay.body.id } }))).currency;

    // ٧ الشراء · ٨ سندُ الصرف
    const supplier = await auth(http().post('/suppliers')).send({ name: `مورّد الإقليم ${suffix}` }).expect(201);
    const purchase = await auth(http().post('/purchases'))
      .send({ supplierId: supplier.body.id, date: today(), category: `بندُ الإقليم ${suffix}`, subtotal: 40, exempt: true })
      .expect(201);
    currencyOf.purchase = (await inTenant((tx) => tx.purchase.findUniqueOrThrow({ where: { id: purchase.body.id } }))).currency;
    const sp = await auth(http().post('/supplier-payments'))
      .send({ supplierId: supplier.body.id, date: today(), amount: 40, method: 'CASH', allocations: [{ purchaseId: purchase.body.id, amount: 40 }] })
      .expect(201);
    currencyOf.supplierPayment = (await inTenant((tx) => tx.supplierPayment.findUniqueOrThrow({ where: { id: sp.body.id } }))).currency;

    // ٩ العقد
    const property = await auth(http().post('/properties')).send({ name: `عقارُ الإقليم ${suffix}`, ownership: 'owned' }).expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `R-${suffix}`, type: 'shop', rentMonthly: 1000 }).expect(201);
    const contract = await auth(http().post('/contracts'))
      .send({ unitId: unit.body.id, customerId, value: 12000, cycle: 'monthly', start: '2027-01-01', end: '2027-12-31', classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(201);
    currencyOf.contract = (await inTenant((tx) => tx.contract.findUniqueOrThrow({ where: { id: contract.body.id } }))).currency;

    expect(currencyOf).toEqual({
      bank: OTHER_BASE,
      transaction: OTHER_BASE,
      journal: OTHER_BASE,
      invoice: OTHER_BASE,
      quote: OTHER_BASE,
      payment: OTHER_BASE,
      purchase: OTHER_BASE,
      supplierPayment: OTHER_BASE,
      contract: OTHER_BASE,
    });
  });

  it('④ والعملةُ الصريحة تُحترم كما كانت — والقراءةُ للمنشأة حين تغيب وحدَها', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const bank = await auth(http().post('/banks')).send({ name: `بنكٌ بعملته ${suffix}`, kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01', currency: 'USD', exchangeRate: 3.75 }).expect(201);
    const row = await inTenant((tx) => tx.bank.findUniqueOrThrow({ where: { id: bank.body.id } }));
    expect(row.currency).toBe('USD');
    expect(Number(row.exchangeRate)).toBe(3.75);
  });
});
