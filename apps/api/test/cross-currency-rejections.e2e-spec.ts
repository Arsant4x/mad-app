import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyBaseCurrency } from '../src/common/currency/base-amount.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة: منشأةٌ معزولة وعقدٌ واحد ونحو عشرة طلبات — لم تُقَس بعد (البحثُ جارٍ فلا محطّةَ محلّية، `ق-١٤٩٤`)؛
// سقفٌ معلَن يُضبط إلى ثلاثة أضعاف المقيس بعد أوّل تشغيلٍ في السير.
jest.setTimeout(300000);

/**
 * ⚖️ `ق-١٥٠٣`/ب — **ما لا يتوقّف على الإطار المحاسبيّ يُبنى الآن: لا يُطبَّق مقدَّمٌ بعملةٍ على فاتورةٍ بأخرى، ولا يُقبض
 * الإيجارُ بعملةٍ غير عملة عقده.**
 *
 * **العطلان المقيسان** (`measure-fx-realized-difference.md` — B4 · B5): تطبيقُ دفعةٍ مقدَّمة كان يقارن مبلغَها بإجماليّ
 * الفاتورة **بعملتين كأنهما عملةٌ واحدة** ويُدين `1200` بأساس المقدَّم لا بسعر التوريد؛ وقبضُ الإيجار كان يقبل عملةً
 * أخرى فيُحوّل المبلغَ إلى عملة العقد بقسمة سعرين ويسدّد القسطَ بمقياسٍ آخر، ولا فرقَ صرفٍ يُعرف له.
 * **والقائمُ صفرٌ على الطرفين** (`ق-١٥٠٣`/ج — P5 · P6 بضابطٍ موجب): فالرفضان لا يمسّان صفّاً.
 *
 * **ولكلّ رفضٍ ضابطُه**: الحالةُ نفسُها بالعملة الصحيحة تمرّ — فالرفضُ للعملة لا لسببٍ آخر يصادفه. والأوّلُ فوق ذلك
 * **قبل الترقيم** (`ق-١٤٩٠`): الفاتورةُ الناجحة بعده `0001`.
 *
 * منشأةٌ معزولة تُزال في الختام؛ والعملةُ `XTS` — رمزُ ISO 4217 المحجوز للاختبار — غيرُ عملة الأساس أيّاً كانت.
 */
const FX = 'XTS';
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('⚖️ لا مقدَّمَ بعملةٍ على فاتورةٍ بأخرى، ولا قبضَ إيجارٍ بغير عملة عقده (ق-١٥٠٣/ب) (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  let base: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = iso(new Date());
  /** سنةُ بادئة المستند = سنةُ تاريخه بتوقيت `UTC` (`documentYear`)، وتاريخُه `today`. */
  const Y = today.slice(0, 4);
  const now = new Date();
  const futureStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  const futureEnd = new Date(Date.UTC(futureStart.getUTCFullYear() + 1, futureStart.getUTCMonth(), 0));

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const ar = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'xccy-reject');
    base = await tenantPrisma.runInTenantContext(company.companyId, (tx) => companyBaseCurrency(tx, company.companyId));
    // مجسٌّ للمجسّ: الحالتان تفترضان أن `XTS` ليست عملةَ الأساس — وإلا صار «بعملةٍ أخرى» «بالعملة نفسِها».
    expect(base).not.toBe(FX);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('🔴 ① مقدَّمٌ بعملة XTS على فاتورةٍ بعملة الأساس يُرفض مسمّىً قبل الترقيم — وبعملته يُطبَّق والرقمُ الأوّل', async () => {
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل العملتين ${suffix}` }).expect(201)).body.id as string;
    // قبضٌ 115 XTS بسعر 3.75 كلُّه فائضٌ معلَنٌ دفعةً مقدَّمة بفئة `S` ⟵ مستندُ 386 بعملة السند: صافٍ 100 وضريبةٌ 15.
    const receipt = (
      await auth(http().post('/payments'))
        .send({ customerId, date: today, amount: 115, method: 'CASH', currency: FX, exchangeRate: 3.75, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } })
        .expect(201)
    ).body as { prepaymentInvoice: { id: string; no: string; total: string } };
    const pp = receipt.prepaymentInvoice;
    expect(pp.total).toBe('115.00');
    const ppCurrency = await inTenant<string>(async (tx) => (await tx.invoice.findUniqueOrThrow({ where: { id: pp.id }, select: { currency: true } })).currency);
    expect(ppCurrency).toBe(FX);

    const invoicesCount = () => inTenant<number>((tx) => tx.invoice.count({ where: { docType: 'INVOICE' } }));
    // الفاتورةُ بعملة الأساس: 200 + 30 = 230 ≥ 115 — فلو تُجوهلت العملةُ لمرّ فحصُ المجموع، **فالرفضُ للعملة وحدَها**.
    const refused = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `توريد ${suffix}`, quantity: 1, unitPrice: 200, taxRate: 15 }], prepaymentInvoiceIds: [pp.id] })
      .expect(400);
    expect(refused.body.message).toBe(ar(formatMessage(MSG.prepayment_currency_mismatch, { no: pp.no, prepayment: FX, invoice: base })));
    expect(await invoicesCount()).toBe(0);
    // ولا تطبيقَ بقي: المستندُ ما زال غيرَ مطبَّق.
    expect(await inTenant<number>((tx) => tx.invoicePrepayment.count({ where: { prepaymentInvoiceId: pp.id } }))).toBe(0);

    // الضابط: الفاتورةُ بعملة المقدَّم وسعرِه (100 + 15 = 115 = المقدَّم) تمرّ وتأخذ الرقمَ الأوّل — لو رُقّم المرفوضُ لكان `0002`.
    const ok = (
      await auth(http().post('/invoices'))
        .send({
          customerId,
          issueDate: today,
          dueDate: today,
          currency: FX,
          exchangeRate: 3.75,
          lines: [{ description: `توريد ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }],
          prepaymentInvoiceIds: [pp.id],
        })
        .expect(201)
    ).body as { no: string };
    expect(ok.no).toBe(`INV-${Y}-0001`);
    expect(await inTenant<number>((tx) => tx.invoicePrepayment.count({ where: { prepaymentInvoiceId: pp.id } }))).toBe(1);
  });

  it('🔴 ② قبضُ إيجارٍ بعملة XTS على عقدٍ بعملة الأساس يُرفض مسمّىً بلا أثر — وبعملة العقد (أيّاً كانت حالةُ أحرفها) يُقبض بها', async () => {
    const property = (await auth(http().post('/properties')).send({ name: `عقار العملتين ${suffix}`, ownership: 'owned' }).expect(201)).body as { id: string };
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `XCC-${suffix}`, type: 'سكني', rentMonthly: 1000 }).expect(201)).body as {
      id: string;
    };
    const customerId = await createTenantCustomer(app, company.token, `مستأجر العملتين ${suffix}`);
    const contract = (
      await auth(http().post('/contracts'))
        .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId, value: 12000, cycle: 'monthly', start: iso(futureStart), end: iso(futureEnd) })
        .expect(201)
    ).body as { id: string; currency: string; installments: { id: string }[] };
    expect(contract.currency).toBe(base);

    const payments = () => inTenant<{ currency: string; journalEntryId: string | null }[]>((tx) =>
      tx.rentPayment.findMany({ where: { contractId: contract.id }, select: { currency: true, journalEntryId: true } }),
    );
    const pay = (currency: string, exchangeRate?: number) =>
      auth(http().post(`/contracts/${contract.id}/payments`)).send({
        installmentId: contract.installments[0].id,
        date: today,
        amount: 1000,
        method: 'CASH',
        currency,
        ...(exchangeRate ? { exchangeRate } : {}),
      });

    const refused = await pay(FX, 3.75).expect(400);
    expect(refused.body.message).toBe(ar(formatMessage(MSG.rent_payment_currency_mismatch, { payment: FX, contract: base })));
    expect(await payments()).toEqual([]);

    // الضابط: عملةُ العقد بأحرفٍ صغيرة تمرّ — والمخزَّنُ عملةُ العقد بعينها لا ما أُرسل.
    await pay(base.toLowerCase()).expect(201);
    const stored = await payments();
    expect(stored).toHaveLength(1);
    expect(stored[0].currency).toBe(base);
  });
});
