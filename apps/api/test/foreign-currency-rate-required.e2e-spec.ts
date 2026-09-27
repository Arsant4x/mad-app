import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { purgeInvoicesForTest } from './purge-invoices';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): لم تُقَس بعدُ على هذا الجهاز (المحطةُ لم تُشغَّل في هذا البناء) — فالسقفُ واسعٌ معلَن.
jest.setTimeout(300000);

/**
 * 🔴 `ق-١٤٨٩` (فائتُ القياس M1) — **عملةٌ أجنبيةٌ بلا سعرٍ صريح لا تُسعَّر بـ١ بصمت**.
 *
 * كان `resolveCurrency` يعطي `exchangeRate ?? 1`، و`resolveCurrencyWithin` يمرّر العملةَ الصريحةَ نفسَها «عملةَ أساس» فلا
 * يُسأل أبداً أهي أجنبية. ففاتورةٌ بمئة دولار بلا سعرٍ أساسُها مئة، ثم سندٌ بسعره الحقيقيّ يُخصَّص عليها فيصنع «فرقاً» على
 * `5600` ليس فرقاً. والإتمامُ في الصيانة كان يكتب `dto.exchangeRate ?? 1` والعملةَ `'SAR'` حرفاً.
 *
 * ⚖️ **ما يُثبته الملفّ**: ① الأجنبيةُ بلا سعرٍ `400` بالمفتاح ولا صفَّ ولا قيد · ② وبسعرها تُحوَّل كما كانت · ③ وعملةُ الأساس
 * صريحةً بلا سعرٍ `1` كما كانت · ④⑤ والصيانةُ على المحلِّل نفسِه · ⑥ وبلا عملةٍ تُوسَم الصيانةُ بعملة المنشأة لا بالريال ·
 * ⑦ و`null` صريحاً كالغياب — لا بابٌ ثانٍ للثقب · ⑧ وعملةُ الأساس بأحرفٍ صغيرة ليست أجنبية (`isBaseCurrency` بلا حالة الأحرف).
 * (أُضيف ⑦⑧ في المراجعة العدائية: السلوكان مدّعيان في المحلِّل وبلا اختبار.)
 */
describe('Foreign currency needs an explicit exchange rate — never a silent 1 (e2e · ق-١٤٨٩)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let base: string;
  let foreign: string;
  let customerId: string;
  let propertyId: string;
  const invoiceIds: string[] = [];
  const maintenanceIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'fx-rate');
    // عملةُ الأساس تُقرأ من صفّ المنشأة (ق-١٣٦٨) لا تُفترض — والأجنبيةُ ما يخالفها.
    base = (await prisma.company.findUniqueOrThrow({ where: { id: company.companyId }, select: { baseCurrency: true } })).baseCurrency;
    foreign = base === 'USD' ? 'EUR' : 'USD';
    customerId = await createTenantCustomer(app, company.token, `عميل العملة ${suffix}`);
    propertyId = (await auth(http().post('/properties')).send({ name: `عقار العملة ${suffix}`, ownership: 'owned' }).expect(201)).body.id as string;
  });

  afterAll(async () => {
    if (invoiceIds.length) await purgeInvoicesForTest(tenantPrisma, company.companyId, invoiceIds);
    // بلاغُ الصيانة يشير إلى قيد تكلفته بـ`Restrict` — فيُزال قبل المنشأة كي لا يعلق حذفُها المتسلسل عليه.
    if (maintenanceIds.length) await inTenant((tx) => tx.maintenanceRequest.deleteMany({ where: { id: { in: maintenanceIds } } }));
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);
  const today = () => new Date().toISOString().slice(0, 10);
  const rateRequired = (currency: string, baseCurrency: string) =>
    resolveMessage(formatMessage(MSG.currency_rate_required, { currency, base: baseCurrency }), DEFAULT_LANGUAGE);
  const counts = () => inTenant(async (tx) => ({ invoices: await tx.invoice.count(), entries: await tx.journalEntry.count() }));

  // بندٌ واحد: ١ × ١٠٠ بنسبة ١٥٪ ⟵ الصافي ١٠٠ · الضريبة ١٥ · الإجمالي ١١٥ (computeTotals).
  const invoiceBody = (extra: Record<string, unknown>) => ({
    customerId,
    issueDate: today(),
    dueDate: today(),
    lines: [{ description: `بندُ العملة ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }],
    ...extra,
  });

  /** بلاغٌ قيد التنفيذ — فالإتمامُ (`IN_PROGRESS ⟵ DONE`) هو الانتقالُ الوحيد الذي يُسعَّر فيه. */
  async function maintenanceInProgress(): Promise<string> {
    const created = await auth(http().post('/maintenance')).send({ propertyId, title: `بلاغُ العملة ${suffix}`, reportedAt: today() }).expect(201);
    const id = created.body.id as string;
    maintenanceIds.push(id);
    await auth(http().post(`/maintenance/${id}/start`)).send({ startedAt: today() }).expect(201);
    return id;
  }

  it('① فاتورةٌ بعملةٍ أجنبيةٍ بلا سعر ⟵ 400 بالمفتاح المسمّى، ولا فاتورةَ ولا قيد', async () => {
    const before = await counts();
    const res = await auth(http().post('/invoices')).send(invoiceBody({ currency: foreign })).expect(400);
    // النصُّ المترجَم للمفتاح نفسِه بعملتَيه — لا مجرّدُ 400 (فرفضُ التحقّق من الـDTO 400 أيضاً ولا يُثبت شيئاً هنا).
    expect(res.body.message).toBe(rateRequired(foreign, base));
    // والرفضُ قبل أيّ كتابة: لا صفَّ فاتورة ولا قيدَ يُترك.
    expect(await counts()).toEqual(before);
  });

  it('② وبسعرها الصريح ⟵ 201 والأساسُ = الإجمالي × السعر (كما كانت)', async () => {
    const res = await auth(http().post('/invoices')).send(invoiceBody({ currency: foreign, exchangeRate: 3.75 })).expect(201);
    invoiceIds.push(res.body.id);
    const row = await inTenant((tx) => tx.invoice.findUniqueOrThrow({ where: { id: res.body.id } }));
    expect(row.currency).toBe(foreign);
    expect(Number(row.exchangeRate)).toBe(3.75);
    expect(Number(row.total)).toBe(115);
    // 115 × 3.75 = 431.25 · 100 × 3.75 = 375 · 15 × 3.75 = 56.25 (toBaseAmount = round2 للجداء — لا كسرَ يُدوَّر هنا).
    expect(Number(row.baseTotal)).toBe(431.25);
    expect(Number(row.baseSubtotal)).toBe(375);
    expect(Number(row.baseTaxTotal)).toBe(56.25);
  });

  it('③ وعملةُ الأساس صريحةً بلا سعر ⟵ 201 بسعر 1 — فالإعفاءُ لها وحدَها لا يُكسر', async () => {
    const res = await auth(http().post('/invoices')).send(invoiceBody({ currency: base })).expect(201);
    invoiceIds.push(res.body.id);
    const row = await inTenant((tx) => tx.invoice.findUniqueOrThrow({ where: { id: res.body.id } }));
    expect(row.currency).toBe(base);
    expect(Number(row.exchangeRate)).toBe(1);
    // 115 × 1 = 115.
    expect(Number(row.baseTotal)).toBe(115);
  });

  it('④ وإتمامُ الصيانة بتكلفةٍ أجنبيةٍ بلا سعر ⟵ 400 بالمفتاح نفسِه، والبلاغُ باقٍ قيد التنفيذ بلا قيد', async () => {
    const id = await maintenanceInProgress();
    const before = await counts();
    const res = await auth(http().post(`/maintenance/${id}/complete`)).send({ completedAt: today(), cost: 200, currency: foreign }).expect(400);
    expect(res.body.message).toBe(rateRequired(foreign, base));
    const row = await inTenant((tx) => tx.maintenanceRequest.findUniqueOrThrow({ where: { id } }));
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.cost).toBeNull();
    expect(row.journalEntryId).toBeNull();
    expect(await counts()).toEqual(before);
  });

  it('⑤ وبسعرها ⟵ 201 والتكلفةُ بالأساس = التكلفة × السعر، وقيدُ 5700 بها', async () => {
    const id = await maintenanceInProgress();
    const res = await auth(http().post(`/maintenance/${id}/complete`)).send({ completedAt: today(), cost: 200, currency: foreign, exchangeRate: 3.75 }).expect(201);
    expect(res.body.status).toBe('DONE');
    const row = await inTenant((tx) => tx.maintenanceRequest.findUniqueOrThrow({ where: { id } }));
    expect(row.currency).toBe(foreign);
    expect(Number(row.exchangeRate)).toBe(3.75);
    // 200 × 3.75 = 750.
    expect(Number(row.baseCost)).toBe(750);
    expect(row.journalEntryId).not.toBeNull();
    const entry = await inTenant((tx) => tx.journalEntry.findUniqueOrThrow({ where: { id: row.journalEntryId! } }));
    // postMaintenanceCostEntry: مدين 5700 / دائن 1000 بالأساس — فمجموعُ المدين 750.
    expect(Number(entry.totalDebit)).toBe(750);
  });

  it('⑥ وبلا عملةٍ تُوسَم تكلفةُ الصيانة بعملة المنشأة لا بالريال حرفاً (ق-١٣٦٨)', async () => {
    // منشأةُ الاختبار وحدَها تُنقل إلى عملةٍ غيرِ عملتها — وإلا مرّ الإثباتُ على الحرف القديم نفسِه (نمطُ company-region ③).
    const otherBase = base === 'AED' ? 'KWD' : 'AED';
    await prisma.company.update({ where: { id: company.companyId }, data: { baseCurrency: otherBase } });
    const id = await maintenanceInProgress();
    await auth(http().post(`/maintenance/${id}/complete`)).send({ completedAt: today(), cost: 100 }).expect(201);
    const row = await inTenant((tx) => tx.maintenanceRequest.findUniqueOrThrow({ where: { id } }));
    expect(row.currency).toBe(otherBase);
    expect(Number(row.exchangeRate)).toBe(1);
    // 100 × 1 = 100.
    expect(Number(row.baseCost)).toBe(100);
  });

  /** عملةُ الأساس **الحاليّة** من صفّ المنشأة — فـ⑥ قبلها ينقلها، والحكمُ على ما هي عليه لحظةَ الطلب لا على ما كانت. */
  const currentBase = async () =>
    (await prisma.company.findUniqueOrThrow({ where: { id: company.companyId }, select: { baseCurrency: true } })).baseCurrency;

  it('⑦ و`exchangeRate: null` صريحاً مع عملةٍ أجنبية ⟵ 400 بالمفتاح نفسِه — لا يُقرأ «سعراً» ولا يُعاد ١', async () => {
    // `@IsOptional` يُمرّر `null` إلى الخدمة (لا يُفحص كالغياب)، و`?? 1` القديمُ كان يجعله ١ بصمت.
    const nowBase = await currentBase();
    const other = foreign === nowBase ? (nowBase === 'USD' ? 'EUR' : 'USD') : foreign;
    const before = await counts();
    const res = await auth(http().post('/invoices')).send(invoiceBody({ currency: other, exchangeRate: null })).expect(400);
    expect(res.body.message).toBe(rateRequired(other, nowBase));
    expect(await counts()).toEqual(before);
  });

  it('⑧ وعملةُ الأساس بأحرفٍ صغيرة بلا سعر ⟵ 201 بسعر 1 — فليست «أجنبيةً» لأن حالةَ أحرفها اختلفت', async () => {
    // عرضُ سعرٍ لا فاتورة: المحلِّلُ واحد (`quotes.service` ينادي `resolveCurrencyWithin`)، ولا مستندَ ضريبيَّ يُصدَر بالرمز الصغير.
    const nowBase = await currentBase();
    const res = await auth(http().post('/quotes'))
      .send({ customerId, issueDate: today(), validUntil: today(), currency: nowBase.toLowerCase(), lines: [{ description: `عرضُ العملة ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    const row = await inTenant((tx) => tx.quote.findUniqueOrThrow({ where: { id: res.body.id } }));
    expect(Number(row.exchangeRate)).toBe(1);
    // ١ × ١٠٠ + ١٥٪ = ١١٥ (computeTotals) · × 1 = 115. (الرمزُ المخزَّن لا يُوكَّد عمداً — يُخزَّن كما أُرسل، حدٌّ معلَن لا عقد.)
    expect(Number(row.baseTotal)).toBe(115);
  });
});
