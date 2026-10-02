import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyBaseCurrency } from '../src/common/currency/base-amount.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة: منشأةٌ معزولة وعقدٌ واحد ونحو ثلاثين طلباً — لم تُقَس بعد؛ سقفٌ معلَن يُضبط إلى ثلاثة أضعاف المقيس.
jest.setTimeout(300000);

/**
 * **عملةُ الأساس سعرُها ١ — ولا يُقبل لها سعرٌ غيرُه** (توجيه ٢٧٤ الكتلة ٥ · مراجعة 3.3 البند 1).
 *
 * كان `resolveCurrency` يقبل أيَّ سعرٍ مرسَلٍ كما هو: فاتورةٌ بالريال بسعر `3.75` يُخزَّن أساسُها ثلاثةَ أضعافٍ ونصفاً
 * ويُرحَّل الدفترُ به، وكلُّ ما يقرأ الأساسَ (الإقرار · الأعمار · التقارير) يقرأ رقماً لا وجود له. ومثلُه ما لا يمرّ به:
 * تعديلُ الشراء والحركة البنكية، وقبضُ الإيجار والتقبيلُ والمطالبةُ والوديعةُ على العقد (`dto.exchangeRate ?? سعرُ العقد`).
 * والسابقةُ في الشيفرة نفسِها: الردُّ يرفض سعراً لإشعارٍ بعملة الأساس بـ`exchange_rate_same_currency`.
 *
 * ولكلِّ رفضٍ ضابطان: السعرُ ١ (أو غيابُه) يمرّ، والعملةُ الأجنبيةُ بسعرها تمرّ ويُحسب أساسُها به — فالرفضُ للسعر على
 * عملة الأساس لا لسببٍ آخر. وعملةٌ يتبع فيها المستندُ غيرَه (تعديلٌ · وديعةٌ بعملةٍ غيرِ عملة العقد) بلا سعرٍ تُعامَل
 * كمستندٍ جديد: الأجنبيةُ تُرفض بـ`currency_rate_required` (`ق-١٤٨٩`) ولا ترث سعرَ غيرها.
 *
 * والقائمُ صفرٌ مقيساً على قاعدة التطوير في ستّة عشر جدولاً بمسبارٍ مصادَق (توجيه ٢٧٤، `b5d-legacy-rates`)، فالرفضُ لا يمسّ صفّاً.
 */
const FX = 'XTS';
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('عملةُ الأساس سعرُها ١ ولا يُقبل لها غيرُه (مراجعة 3.3 البند 1) (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  let base: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = iso(new Date());
  const now = new Date();
  const futureStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  const futureEnd = new Date(Date.UTC(futureStart.getUTCFullYear() + 1, futureStart.getUTCMonth(), 0));

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const SAME = () => resolveMessage(MSG.exchange_rate_same_currency, DEFAULT_LANGUAGE);
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);
  /** ما يُرسَل: سعرٌ حرٌّ على عملة الأساس، مرّةً بلا عملةٍ (فهي الأساس) ومرّةً بها صريحةً وبأحرفٍ صغيرة. */
  const variants = () => [{ exchangeRate: 3.75 }, { currency: base.toLowerCase(), exchangeRate: 3.75 }];

  let customerId: string;
  let supplierId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'base-rate');
    base = await inTenant((tx) => companyBaseCurrency(tx, company.companyId));
    expect(base).not.toBe(FX);
    customerId = await createTenantCustomer(app, company.token, `عميل السعر ${suffix}`);
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورد السعر ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① الضابط: فاتورةٌ بعملة الأساس بسعر ١ أو بلا سعر تمرّ، وبعملةٍ أجنبيةٍ بسعر 3.75 أساسُها بالسعر', async () => {
    const invoice = (extra: Record<string, unknown>) =>
      auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `ضابط ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }], ...extra });
    await invoice({}).expect(201);
    await invoice({ currency: base, exchangeRate: 1 }).expect(201);
    const foreign = (await invoice({ currency: FX, exchangeRate: 3.75 }).expect(201)).body as { id: string };
    const stored = await inTenant((tx) => tx.invoice.findUniqueOrThrow({ where: { id: foreign.id }, select: { baseTotal: true } }));
    expect(String(stored.baseTotal)).toBe('431.25');
  });

  // ⚠️ والقيدُ اليدويّ ليس هنا: `JournalService.create` يقبل حقلَي العملة والسعر في الـDTO ثم لا يمرّرهما، فيُخزَّن بعملة
  // الأساس وسعر ١ أيّاً كان المرسَل. لا رقمَ خاطئاً فيه، وإسقاطُه الصامتُ بندٌ معلَنٌ في التقرير لا في هذا الإصلاح.
  it('🔴 ② مستندٌ جديد بعملة الأساس وسعرٍ غيرِ ١ يُرفض مسمّىً: الفاتورة والعرض والسند وسند الصرف والشراء والحركة والبنك والعقد', async () => {
    const purchaseId = (await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 40, exempt: true }).expect(201)).body.id as string;
    const bankId = (await auth(http().post('/banks')).send({ name: `بنك السعر ${suffix}`, kind: 'BANK_ACCOUNT', openingDate: today }).expect(201)).body.id as string;
    const property = (await auth(http().post('/properties')).send({ name: `عقار السعر ${suffix}`, ownership: 'owned' }).expect(201)).body.id as string;
    const unit = (await auth(http().post('/units')).send({ propertyId: property, unitNo: `BR-${suffix}`, type: 'سكني', rentMonthly: 1000 }).expect(201)).body.id as string;

    const routes: Record<string, (extra: Record<string, unknown>) => request.Test> = {
      invoice: (x) => auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `مرفوض ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }], ...x }),
      quote: (x) => auth(http().post('/quotes')).send({ customerId, issueDate: today, validUntil: today, lines: [{ description: `مرفوض ${suffix}`, quantity: 1, unitPrice: 50, taxRate: 15 }], ...x }),
      payment: (x) => auth(http().post('/payments')).send({ customerId, date: today, amount: 20, method: 'CASH', unallocated: 'ON_ACCOUNT', ...x }),
      supplierPayment: (x) => auth(http().post('/supplier-payments')).send({ supplierId, date: today, amount: 10, method: 'CASH', allocations: [{ purchaseId, amount: 10 }], ...x }),
      purchase: (x) => auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 40, exempt: true, ...x }),
      transaction: (x) => auth(http().post('/transactions')).send({ bankId, date: today, description: `مرفوض ${suffix}`, amount: 10, ...x }),
      bank: (x) => auth(http().post('/banks')).send({ name: `بنك مرفوض ${suffix}`, kind: 'BANK_ACCOUNT', openingDate: today, openingBalance: 100, ...x }),
      contract: (x) =>
        auth(http().post('/contracts')).send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit, customerId, value: 12000, cycle: 'monthly', start: iso(futureStart), end: iso(futureEnd), ...x }),
    };
    const seen: Record<string, { status: number; named: boolean }[]> = {};
    for (const [name, send] of Object.entries(routes)) {
      seen[name] = [];
      for (const v of variants()) {
        const res = await send(v);
        seen[name].push({ status: res.status, named: res.body.message === SAME() });
      }
    }
    const expected = Object.fromEntries(Object.keys(routes).map((name) => [name, variants().map(() => ({ status: 400, named: true }))]));
    expect(seen).toEqual(expected);
  });

  it('🔴 ③ ما يتبع العقدَ بعملة الأساس: سعرٌ غيرُ ١ يُرفض في قبض الإيجار والتقبيل والمطالبة والوديعة، وبلا سعرٍ يمرّ بالأساس نفسِه', async () => {
    const property = (await auth(http().post('/properties')).send({ name: `عقار التابع ${suffix}`, ownership: 'owned' }).expect(201)).body.id as string;
    const unit = (await auth(http().post('/units')).send({ propertyId: property, unitNo: `BF-${suffix}`, type: 'سكني', rentMonthly: 1000 }).expect(201)).body.id as string;
    const contract = (
      await auth(http().post('/contracts'))
        .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit, customerId, value: 12000, cycle: 'monthly', start: iso(futureStart), end: iso(futureEnd) })
        .expect(201)
    ).body as { id: string; currency: string; installments: { id: string }[] };
    expect(contract.currency).toBe(base);

    const routes: Record<string, (extra: Record<string, unknown>) => request.Test> = {
      rentPayment: (x) => auth(http().post(`/contracts/${contract.id}/payments`)).send({ installmentId: contract.installments[0].id, date: today, amount: 100, method: 'CASH', ...x }),
      keyMoney: (x) => auth(http().post(`/contracts/${contract.id}/key-money`)).send({ direction: 'RECEIVED', amount: 500, paidAt: today, ...x }),
      claim: (x) => auth(http().post(`/contracts/${contract.id}/claims`)).send({ kind: 'OTHER', amount: 50, description: `مطالبة ${suffix}`, issuedAt: today, ...x }),
      deposit: (x) => auth(http().post(`/contracts/${contract.id}/deposits`)).send({ type: 'RENT', amount: 300, receivedAt: today, ...x }),
    };
    const refused: Record<string, number[]> = {};
    const plain: Record<string, number> = {};
    for (const [name, send] of Object.entries(routes)) {
      refused[name] = [];
      for (const v of variants()) {
        const res = await send(v);
        refused[name].push(res.status === 400 && res.body.message === SAME() ? 400 : res.status);
      }
      plain[name] = (await send({})).status;
    }
    expect({ refused, plain }).toEqual({
      refused: { rentPayment: [400, 400], keyMoney: [400, 400], claim: [400, 400], deposit: [400, 400] },
      plain: { rentPayment: 201, keyMoney: 201, claim: 201, deposit: 201 },
    });
    // والأساسُ بالسعر ١: ما قُبل بلا سعرٍ لم يرث سعراً آخر.
    const rates = await inTenant(async (tx) => ({
      rent: (await tx.rentPayment.findMany({ where: { contractId: contract.id }, select: { exchangeRate: true } })).map((r) => String(r.exchangeRate)),
      deposits: (await tx.contractDeposit.findMany({ where: { contractId: contract.id }, select: { exchangeRate: true } })).map((r) => String(r.exchangeRate)),
    }));
    expect(rates).toEqual({ rent: ['1'], deposits: ['1'] });
  });

  it('🔴 ④ التعديلُ: سعرٌ غيرُ ١ على شراءٍ أو حركةٍ بعملة الأساس يُرفض، وتبديلُ العملة إلى أجنبيةٍ بلا سعرٍ يُرفض ولا يرث السعرَ القديم', async () => {
    const purchaseId = (await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 40, exempt: true }).expect(201)).body.id as string;
    const bankId = (await auth(http().post('/banks')).send({ name: `بنك التعديل ${suffix}`, kind: 'BANK_ACCOUNT', openingDate: today }).expect(201)).body.id as string;
    const transactionId = (await auth(http().post('/transactions')).send({ bankId, date: today, description: `حركة ${suffix}`, amount: 10 }).expect(201)).body.id as string;

    const purchaseRate = await auth(http().patch(`/purchases/${purchaseId}`)).send({ exchangeRate: 3.75 });
    const transactionRate = await auth(http().patch(`/transactions/${transactionId}`)).send({ amount: 12, exchangeRate: 3.75 });
    const purchaseForeign = await auth(http().patch(`/purchases/${purchaseId}`)).send({ currency: FX });
    const transactionForeign = await auth(http().patch(`/transactions/${transactionId}`)).send({ amount: 12, currency: FX });
    const purchaseOk = await auth(http().patch(`/purchases/${purchaseId}`)).send({ subtotal: 50 });
    expect({
      purchaseRate: [purchaseRate.status, purchaseRate.body.message === SAME()],
      transactionRate: [transactionRate.status, transactionRate.body.message === SAME()],
      purchaseForeign: purchaseForeign.status,
      transactionForeign: transactionForeign.status,
      purchaseOk: purchaseOk.status,
    }).toEqual({ purchaseRate: [400, true], transactionRate: [400, true], purchaseForeign: 400, transactionForeign: 400, purchaseOk: 200 });
    const stored = await inTenant(async (tx) => ({
      purchase: await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId }, select: { currency: true, exchangeRate: true, baseTotal: true } }),
      transaction: await tx.bankTransaction.findUniqueOrThrow({ where: { id: transactionId }, select: { currency: true, exchangeRate: true } }),
    }));
    expect({
      purchase: [stored.purchase.currency, String(stored.purchase.exchangeRate), String(stored.purchase.baseTotal)],
      transaction: [stored.transaction.currency, String(stored.transaction.exchangeRate)],
    }).toEqual({ purchase: [base, '1', '50'], transaction: [base, '1'] });
  });
});
