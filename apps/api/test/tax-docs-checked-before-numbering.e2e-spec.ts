import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة: أربعُ منشآتٍ معزولة وسنتان ماليّتان وشراءٌ مخزنيّ ونحو عشرين مستنداً — لم تُقَس بعد (لا تشغيلَ في
// جولة البناء)، فالسقفُ سقفُ الحزمة الأمّ `posting-accounts-required` نفسُه حتى يُقاس.
jest.setTimeout(300000);

/**
 * `ق-١٤٩٠` — **المستندُ الضريبيّ يُفحص قبل ترقيمه، فالرفضُ لا يحرق رقماً من سلسلةٍ تصل الهيئة.**
 *
 * رقمُ المستند يُحجز على منفذ العدّاد ويلتزم فوراً (`common/sequence-allocator.ts`)؛ فكلُّ رفضٍ بعد سطر الترقيم يترك
 * فجوةً في `INV` · `CN` · `DN` · `PP`. **وكلُّ حالةٍ هنا بثلاث خطوات**: يُستثار الرفضُ ويُوكَّد **سببُه بنصّه** (مفتاحُ
 * الرسالة وأرقامُه) ⟵ يُزال السبب ⟵ **المستندُ التالي يأخذ الرقمَ التالي بلا فجوة**. والثالثةُ هي الحكم: الفحصُ الذي كان
 * بعد الترقيم باقٍ طبقةً ثانية ويرفض بالرسالة نفسِها — **فتوكيدُ الرفض وحده يمرّ أخضرَ والرقمُ يحترق** (وهو عينُ
 * `fiscal-period-lock.e2e-spec.ts` اليوم: `409` وحدَه).
 *
 * والأرقام: كلُّ حالةٍ في منشأةٍ وليدة، وعدّادُ كلِّ نوعٍ لكلِّ سنةٍ يبدأ من صفر (`document-sequence.util.ts` —
 * `${kind}-${year}-` بحشوٍ رباعيّ) — فأوّلُ مستندٍ ينجح `…-0001` ما لم يحترق قبله رقم.
 */
describe('المستندُ الضريبيّ يُفحص قبل ترقيمه — والرفضُ لا يترك فجوة (ق-١٤٩٠)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  /** سنةُ بادئة المستند = السنةُ بتوقيت `UTC` لتاريخه (`documentYear` — `getUTCFullYear`)، وتاريخُه `today` نفسُه — والإشعاراتُ تحمله صراحةً (`issueDate: today`) فلا تُؤرَّخ بساعة الخادم لحظةَ الطلب، وإلا افترقت السنةُ عن `Y` في تشغيلٍ يعبر منتصفَ ليلة رأس السنة. */
  const Y = today.slice(0, 4);
  const http = () => request(app.getHttpServer());
  /** النصُّ العربيّ كما يعيده المرشِّح لطلبٍ بلا `Accept-Language` (`DEFAULT_LANGUAGE = 'ar'`). */
  const ar = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);

  const as = (co: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const count = (co: IsolatedCompany, docType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PREPAYMENT') =>
    tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.invoice.count({ where: { docType } }));
  const accountId = async (co: IsolatedCompany, code: string) => {
    const row = await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.account.findFirst({ where: { code }, select: { id: true } }));
    if (!row) throw new Error(`الحسابُ ${code} غائبٌ عن دليل المنشأة الوليدة — والحالةُ تفترض وجودَه`);
    return row.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('INV-② · CN/DN-② الفترةُ المقفلة أو الغائبة تُرفض قبل ترقيم الفاتورة والإشعارَين — والتالي `0001`', async () => {
    const co = await registerIsolatedCompany(app, 'num-tax-period');
    const auth = as(co);
    try {
      const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الفترة ${suffix}` }).expect(201)).body.id as string;
      // سنةٌ بعيدة لا تصطدم بتواريخ حزمٍ أخرى — والمنشأةُ معزولةٌ أصلاً.
      const year = (await auth(http().post('/fiscal-years')).send({ name: `سنة 2093 ${suffix}`, start: '2093-01-01', end: '2093-12-31' }).expect(201)).body as {
        periods: { id: string; month: number; year: number }[];
      };
      const period = (month: number) => year.periods.find((p) => p.month === month && p.year === 2093)!.id;
      const invoiceOn = (date: string) =>
        auth(http().post('/invoices')).send({ customerId, issueDate: date, dueDate: date, lines: [{ description: `بيع ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] });

      // ① الفاتورة: مايو مقفل. `periodLabel(5, 2093)` = `05/2093` (`fiscal/period-lock.util.ts` — شهرٌ بخانتين).
      await auth(http().patch(`/fiscal-years/periods/${period(5)}/close`)).expect(200);
      const closed = await invoiceOn('2093-05-10').expect(409);
      expect(closed.body.message).toBe(ar(formatMessage(MSG.fiscal_period_closed, { period: '05/2093' })));
      expect(await count(co, 'INVOICE')).toBe(0);
      await auth(http().patch(`/fiscal-years/periods/${period(5)}/reopen`)).send({ reason: 'إعادةُ فتحٍ في الاختبار' }).expect(200);
      const invoice = (await invoiceOn('2093-05-10').expect(201)).body as { id: string; no: string };
      // البادئةُ من سنة المستند 2093 لا من اليوم، والرقمُ الأوّل — لو رُقّم المرفوضُ لكان هذا `0002`.
      expect(invoice.no).toBe('INV-2093-0001');

      // ② الفاتورة: تاريخٌ بلا فترة (السنةُ 2094 غيرُ معرَّفة والتقويمُ قائم) ⟵ `fiscal_no_period_for_date` بلا وسائط.
      const noPeriod = await invoiceOn('2094-01-10').expect(409);
      expect(noPeriod.body.message).toBe(ar(MSG.fiscal_no_period_for_date));
      await auth(http().post('/fiscal-years')).send({ name: `سنة 2094 ${suffix}`, start: '2094-01-01', end: '2094-12-31' }).expect(201);
      expect((await invoiceOn('2094-01-10').expect(201)).body.no).toBe('INV-2094-0001');

      // ③ الإشعارُ الدائن: يونيو مقفل ⟵ `06/2093`. الإشعارُ الكامل ينسخ سطرَ الأصل (خدميٌّ بلا صنف فلا رفَّ يُمسّ):
      //    الإجماليّ 100 + 15 = 115 لا يتجاوز سقفَ الأصل 115 — فالرفضُ للفترة وحدَها.
      await auth(http().patch(`/fiscal-years/periods/${period(6)}/close`)).expect(200);
      const creditRefused = await auth(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: 'تصحيح', issueDate: '2093-06-10' }).expect(409);
      expect(creditRefused.body.message).toBe(ar(formatMessage(MSG.fiscal_period_closed, { period: '06/2093' })));
      expect(await count(co, 'CREDIT_NOTE')).toBe(0);
      await auth(http().patch(`/fiscal-years/periods/${period(6)}/reopen`)).send({ reason: 'إعادةُ فتحٍ في الاختبار' }).expect(200);
      const credit = await auth(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: 'تصحيح', issueDate: '2093-06-10' }).expect(201);
      expect(credit.body.no).toBe('CN-2093-0001');

      // ④ الإشعارُ المدين: يوليو مقفل ⟵ `07/2093`. فوترةٌ إضافية 10 + 1.50 على الفاتورة (لا سقفَ للمدين على فاتورة).
      await auth(http().patch(`/fiscal-years/periods/${period(7)}/close`)).expect(200);
      const debitBody = { reason: 'فرق سعر', issueDate: '2093-07-10', lines: [{ description: `فرق ${suffix}`, quantity: 1, unitPrice: 10, taxRate: 15 }] };
      const debitRefused = await auth(http().post(`/invoices/${invoice.id}/debit-note`)).send(debitBody).expect(409);
      expect(debitRefused.body.message).toBe(ar(formatMessage(MSG.fiscal_period_closed, { period: '07/2093' })));
      expect(await count(co, 'DEBIT_NOTE')).toBe(0);
      await auth(http().patch(`/fiscal-years/periods/${period(7)}/reopen`)).send({ reason: 'إعادةُ فتحٍ في الاختبار' }).expect(200);
      expect((await auth(http().post(`/invoices/${invoice.id}/debit-note`)).send(debitBody).expect(201)).body.no).toBe('DN-2093-0001');
    } finally {
      await removeIsolatedCompany(app, co);
    }
  });

  it('INV-③ · CN/DN-① حسابُ تكلفة المبيعات والإرجاعُ فوق المبيع يُرفضان قبل الترقيم — والتالي متّصل', async () => {
    const co = await registerIsolatedCompany(app, 'num-tax-stock');
    const auth = as(co);
    try {
      const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل المخزون ${suffix}` }).expect(201)).body.id as string;
      const warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع ${suffix}` }).expect(201)).body.id as string;
      const branchId = (await auth(http().post('/branches')).send({ name: `فرع ${suffix}`, warehouseId }).expect(201)).body.id as string;
      const productId = (
        await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف ${suffix}`, price: 100, cost: 10 }).expect(201)
      ).body.id as string;
      const supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد ${suffix}` }).expect(201)).body.id as string;
      // طبقةٌ بخمس وحدات بتكلفة 10 (5 × 10 = 50) — استلامٌ ضمنيٌّ على مستودع الفرع، فالصنفُ «متعقَّب» (له حركة).
      // `TAXABLE_ONLY`: ضريبةُ المدخلات تُخصم كلُّها فلا يُرحَّل شيءٌ على `5100` هنا — فيبقى قابلاً للحذف.
      await auth(http().post('/purchases'))
        .send({ supplierId, date: today, subtotal: 50, warehouseId, branchId, inputVatUse: 'TAXABLE_ONLY', lines: [{ description: `صنف ${suffix}`, productId, quantity: 5, unitPrice: 10, taxRate: 15 }] })
        .expect(201);

      // ① INV-③ — `5100` محذوف: البيعُ من الرفّ يطلبه لقيد التكلفة. والنصُّ `5100 تكلفة المبيعات` من `DEFAULT_CHART`
      //    (`accounts/default-chart.ts` — `{ code: '5100', name: 'تكلفة المبيعات' }`) بصيغة `MissingPostingAccountsError`: `${code} ${name}`.
      await auth(http().delete(`/accounts/${await accountId(co, '5100')}`)).expect(204);
      const sale = () =>
        auth(http().post('/invoices')).send({ customerId, branchId, issueDate: today, dueDate: today, lines: [{ description: `صنف ${suffix}`, productId, quantity: 2, unitPrice: 100, taxRate: 15 }] });
      const refused = await sale().expect(409);
      expect(refused.body.message).toBe(ar(formatMessage(MSG.posting_accounts_missing, { accounts: '5100 تكلفة المبيعات' })));
      expect(await count(co, 'INVOICE')).toBe(0);
      await auth(http().post('/accounts')).send({ code: '5100', name: 'تكلفة المبيعات', type: 'expense' }).expect(201);
      const invoice = (await sale().expect(201)).body as { id: string; no: string; total: string; lines: { id: string }[] };
      // لو رُقّم المرفوضُ لكان هذا `0002` — والرفضُ نفسُه يأتي بالنصّ نفسه من `postCogsEntry` بعد الترقيم.
      expect(invoice.no).toBe(`INV-${Y}-0001`);
      // 2 × 100 = 200 · ضريبة 15% = 30 ⟵ 230 — سقفُ الإشعارات الدائنة على هذه الفاتورة.
      expect(Number(invoice.total)).toBe(230);
      const saleLineId = invoice.lines[0].id;

      // ② CN/DN-① — إشعارٌ أوّل يُعيد الوحدتين بسعرٍ رمزيّ (2 × 1 = 2 + 0.30 = 2.30 تحت السقف 230) ⟵ `CN-…-0001`.
      const returnLine = (quantity: number) => ({ description: `صنف ${suffix}`, productId, quantity, unitPrice: 1, taxRate: 15, returnsLineId: saleLineId, returnCondition: 'GOOD' });
      const first = await auth(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: 'إرجاع', issueDate: today, lines: [returnLine(2)] }).expect(201);
      expect(first.body.no).toBe(`CN-${Y}-0001`);
      // إشعارٌ ثانٍ يُعيد وحدةً: تمرّ من فحص السطر (1 ≤ 2 مُفوتَرة) وتسقط تراكمياً — بِيع 2 وأُعيد 2، فـ2 + 1 = 3 > 2.
      //    وأرقامُ الرسالة من `ReturnExceedsSoldError(sold=2, alreadyReturned=2, requested=1)`.
      const over = await auth(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: 'إرجاع زائد', issueDate: today, lines: [returnLine(1)] }).expect(400);
      expect(over.body.message).toBe(ar(formatMessage(MSG.return_exceeds_sold, { sold: 2, returned: 2, requested: 1 })));
      expect(await count(co, 'CREDIT_NOTE')).toBe(1);
      // إشعارٌ ثالثٌ بسطرٍ حرّ (خصمٌ لا مرتجع: 1 + 0.15 = 1.15 تحت المتبقّي 230 − 2.30 = 227.70) ⟵ `0002` لا `0003`.
      const third = await auth(http().post(`/invoices/${invoice.id}/credit-note`))
        .send({ reason: 'خصم لاحق', issueDate: today, lines: [{ description: `خصم ${suffix}`, quantity: 1, unitPrice: 1, taxRate: 15 }] })
        .expect(201);
      expect(third.body.no).toBe(`CN-${Y}-0002`);
    } finally {
      await removeIsolatedCompany(app, co);
    }
  });

  it('CN/DN-③ حسابُ قيد الإشعار الغائبُ يُرفض قبل ترقيمه — والإشعارُ التالي `0001`', async () => {
    const co = await registerIsolatedCompany(app, 'num-tax-note-acct');
    const auth = as(co);
    try {
      const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الإشعار ${suffix}` }).expect(201)).body.id as string;
      // فاتورةٌ خارجَ النطاق (`O` بسببٍ نصّيّ ⟵ نسبةٌ صفر): قيدُها `1200`/`4100` وحدَهما — فيبقى `2200` بلا حركةٍ قابلاً للحذف.
      const invoice = (
        await auth(http().post('/invoices'))
          .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `رسوم ${suffix}`, quantity: 1, unitPrice: 100, taxCategory: 'O', taxExemptionReason: 'رسومٌ تُحصَّل نيابةً عن جهة' }] })
          .expect(201)
      ).body as { id: string; no: string };
      expect(invoice.no).toBe(`INV-${Y}-0001`);

      // الإشعارُ الدائن بسطرٍ حرٍّ خاضع (10 + 1.50 = 11.50 تحت السقف 100) يطلب `2200` لضريبته.
      //    والنصُّ `2200 ضريبة القيمة المضافة المستحقة` من `DEFAULT_CHART` بالصيغة نفسِها.
      await auth(http().delete(`/accounts/${await accountId(co, '2200')}`)).expect(204);
      const note = () =>
        auth(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: 'تسوية', issueDate: today, lines: [{ description: `تسوية ${suffix}`, quantity: 1, unitPrice: 10, taxRate: 15 }] });
      const refused = await note().expect(409);
      expect(refused.body.message).toBe(ar(formatMessage(MSG.posting_accounts_missing, { accounts: '2200 ضريبة القيمة المضافة المستحقة' })));
      expect(await count(co, 'CREDIT_NOTE')).toBe(0);
      await auth(http().post('/accounts')).send({ code: '2200', name: 'ضريبة القيمة المضافة المستحقة', type: 'liability' }).expect(201);
      // لو رُقّم المرفوضُ لرفضه `postCreditNoteEntry` بالنصّ نفسه بعد أن أخذ `0001` — فكان هذا `0002`.
      expect((await note().expect(201)).body.no).toBe(`CN-${Y}-0001`);
    } finally {
      await removeIsolatedCompany(app, co);
    }
  });

  it('PP-① · INV-④ مستندُ الدفعة المقدَّمة وتطبيقُها يُفحصان قبل ترقيم السند والمستند والفاتورة — والتالي متّصل', async () => {
    const co = await registerIsolatedCompany(app, 'num-tax-prepay');
    const auth = as(co);
    try {
      const customerA = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل أ ${suffix}` }).expect(201)).body.id as string;
      const customerB = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل ب ${suffix}` }).expect(201)).body.id as string;
      // قبضٌ 115 كلُّه فائضٌ معلَنٌ دفعةً مقدَّمة بفئة `S` ⟵ `prepaymentDocumentAmounts(115, 15)`: الصافي `round2(115 / 1.15)` = 100،
      //    وضريبتُه 15 ⟵ إجماليّ 115 = المقبوض؛ فقيدُ المستند يطلب `1200` و`2200`، ثم `2450` بنوع `liability`.
      const receipt = () =>
        auth(http().post('/payments')).send({ customerId: customerB, date: today, amount: 115, method: 'CASH', unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } });
      const payments = () => tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.payment.count());

      // ① `2450` قائمٌ بنوعٍ آخر ⟵ `account_reserved_type_conflict` (`code: 2450` · `type: liability`) قبل رقمَي `RCV` و`PP`.
      const wrongType = (await auth(http().post('/accounts')).send({ code: '2450', name: `حساب بنوعٍ آخر ${suffix}`, type: 'asset' }).expect(201)).body.id as string;
      const typeRefused = await receipt().expect(409);
      expect(typeRefused.body.message).toBe(ar(formatMessage(MSG.account_reserved_type_conflict, { code: '2450', type: 'liability' })));
      expect({ payments: await payments(), prepayments: await count(co, 'PREPAYMENT') }).toEqual({ payments: 0, prepayments: 0 });
      await auth(http().delete(`/accounts/${wrongType}`)).expect(204);

      // ② `2200` محذوف ⟵ `posting_accounts_missing` قبل الرقمين كذلك.
      await auth(http().delete(`/accounts/${await accountId(co, '2200')}`)).expect(204);
      const accountRefused = await receipt().expect(409);
      expect(accountRefused.body.message).toBe(ar(formatMessage(MSG.posting_accounts_missing, { accounts: '2200 ضريبة القيمة المضافة المستحقة' })));
      expect({ payments: await payments(), prepayments: await count(co, 'PREPAYMENT') }).toEqual({ payments: 0, prepayments: 0 });
      await auth(http().post('/accounts')).send({ code: '2200', name: 'ضريبة القيمة المضافة المستحقة', type: 'liability' }).expect(201);

      // ③ السندُ والمستندُ الأوّلان — لو رُقّما في ① و② لكانا `0003`.
      const ok = (await receipt().expect(201)).body as { no: string; prepaymentInvoice: { id: string; no: string; total: string } };
      expect({ receipt: ok.no, prepayment: ok.prepaymentInvoice.no, total: ok.prepaymentInvoice.total }).toEqual({
        receipt: `RCV-${Y}-0001`,
        prepayment: `PP-${Y}-0001`,
        total: '115.00',
      });
      const ppId = ok.prepaymentInvoice.id;
      const ppNo = ok.prepaymentInvoice.no;

      // ④ INV-④ — تطبيقُ دفعة «ب» على فاتورة «أ» ⟵ `prepayment_other_customer` برقم المستند، قبل ترقيم الفاتورة.
      const invoiceFor = (customerId: string, unitPrice: number, prepaymentInvoiceIds?: string[]) =>
        auth(http().post('/invoices')).send({
          customerId,
          issueDate: today,
          dueDate: today,
          lines: [{ description: `توريد ${suffix}`, quantity: 1, unitPrice, taxRate: 15 }],
          ...(prepaymentInvoiceIds ? { prepaymentInvoiceIds } : {}),
        });
      const otherCustomer = await invoiceFor(customerA, 200, [ppId]).expect(400);
      expect(otherCustomer.body.message).toBe(ar(formatMessage(MSG.prepayment_other_customer, { no: ppNo })));
      expect(await count(co, 'INVOICE')).toBe(0);
      expect((await invoiceFor(customerA, 200).expect(201)).body.no).toBe(`INV-${Y}-0001`);

      // ⑤ وتطبيقُها على فاتورةٍ لـ«ب» أصغرَ منها: 10 + 1.50 = 11.50 < 115 ⟵ `prepayment_exceeds_invoice` بـ`115.00` و`11.50`.
      const exceeds = await invoiceFor(customerB, 10, [ppId]).expect(400);
      expect(exceeds.body.message).toBe(ar(formatMessage(MSG.prepayment_exceeds_invoice, { no: ppNo, applied: '115.00', total: '11.50' })));
      // الرفضان في ④ و⑤ لم يأخذا رقماً: الفاتورةُ الثانية الناجحة `0002` لا `0004`.
      expect((await invoiceFor(customerB, 10).expect(201)).body.no).toBe(`INV-${Y}-0002`);
    } finally {
      await removeIsolatedCompany(app, co);
    }
  });
});
