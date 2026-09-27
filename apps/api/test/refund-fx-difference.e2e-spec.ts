import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): معلَنةٌ هنا مرّةً واحدة — ولا مهلةَ على نداء.
jest.setTimeout(300000);

/**
 * ⚖️ **سندُ الردّ بعملةٍ أجنبية: النقدُ بسعر يومه، والذمّةُ بسعر إشعاره، والفرقُ على `5600`** (`ق-١٤٨٩` — المسار B6).
 *
 * **ما كان مكسوراً**: `POST /payments/refund` يقبل `currency` و`exchangeRate` (`RefundDto extends CurrencyFieldsDto`)
 * **ويُهملهما** — النقدُ والذمّةُ كلاهما بسعر الإشعار، ففرقُ الصرف يُطوى في قيمة حساب الصندوق بلا سطرٍ يسمّيه.
 *
 * **وما يجعل الإصلاحَ إصلاحاً لا نقلاً للعطل**: تخزينُ سعر يوم الردّ على الصفّ وحده يكسر مطابقةَ الأعمار مع `1200`
 * بقدر الفرق — لأن الأعمار تحوّل ما لم يُخصَّص بسعر الصفّ. فالحزمةُ تقرأ **الدفترَ والأعمارَ ومطابقتَهما معاً**
 * بعد الردّ وبعد عكسه.
 *
 * **المثالُ بحساب اليد** (فاتورةٌ بلا ضريبة ليصرح الحساب):
 *   فاتورة 100 USD @3.70 ⟵ `1200` مدين 370.00 (100 × 3.70)
 *   قبضٌ 100 USD @3.70 مخصَّصٌ عليها ⟵ الصندوق مدين 370.00 · `1200` دائن 370.00 · لا فرق
 *   إشعارٌ دائن بمبلغها كلِّه (بسعر فاتورته 3.70) ⟵ `1200` دائن 370.00  ⟸ رصيدُ `1200` = 370 − 370 − 370 = −370.00
 *   ردٌّ 100 USD يومَ صار السعر 3.80 ⟵ الصندوق دائن 380.00 (100 × 3.80) · `1200` مدين 370.00 (100 × 3.70)
 *                                     · `5600` مدين 10.00 (380 − 370 — خسارة)  ⟸ رصيدُ `1200` = 0.00
 */
describe('سندُ الردّ بعملةٍ أجنبية — فرقُ الصرف على 5600 والأعمارُ تطابق 1200 (ق-١٤٨٩ · B6)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let customerId: string;
  let branchId: string;
  let cashBoxId: string;
  let boxAccountId: string;
  /** سندُ الردّ الأجنبيّ — يعكسه الاختبارُ الثاني. */
  let refundId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);
  const arabic = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);

  /** فاتورةٌ ببندٍ واحد معفى — فإجماليُّها مبلغُها ولا ضريبةَ تُربك الحساب. */
  const makeInvoice = async (total: number, fx?: { currency: string; exchangeRate: number }) => {
    const res = await auth(http().post('/invoices'))
      .send({
        customerId,
        branchId,
        issueDate: today(),
        dueDate: today(),
        ...(fx ?? {}),
        lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
    return res.body as { id: string; no: string };
  };

  /**
   * فاتورةٌ مسدَّدةٌ كاملاً بسعرها ثم إشعارٌ دائن بمبلغها كلِّه — فالقابلُ للردّ مبلغُها كلُّه
   * (`refundableOf`: إشعارات 100 − خصمٌ من غير المسدَّد 0 − ردودٌ سابقة 0 = 100).
   * سطرُ الإشعار حرٌّ بلا `returnsLineId` — إشعارٌ محاسبيّ لا يمسّ المخزون، كما في حزمة الأعمار.
   */
  const paidInvoiceWithCreditNote = async (total: number, fx?: { currency: string; exchangeRate: number }) => {
    const invoice = await makeInvoice(total, fx);
    await auth(http().post('/payments'))
      .send({ customerId, branchId, date: today(), amount: total, method: 'CASH', bankId: cashBoxId, ...(fx ?? {}), allocations: [{ invoiceId: invoice.id, amount: total }] })
      .expect(201);
    const note = await auth(http().post(`/invoices/${invoice.id}/credit-note`))
      .send({
        issueDate: today(),
        reason: `إرجاع ${suffix}`,
        lines: [{ description: `إشعار ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
    return note.body as { id: string; no: string; currency: string; exchangeRate: string; baseTotal: string };
  };

  /** أسطرُ القيد كما في الدفتر — داخل سياق المنشأة. */
  const entryLines = async (journalEntryId: string) => {
    const entry = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: { include: { account: { select: { code: true } } } } } }),
    );
    if (!entry) throw new Error(`القيد ${journalEntryId} غير موجود`);
    return entry.lines.map((l) => ({ accountId: l.accountId, code: l.account.code, debit: Number(l.debit), credit: Number(l.credit) }));
  };

  /** مطابقةُ الأعمار مع `1200` كما يعرضها الخادم — نصوصٌ بخانتين. */
  const agingReconciliation = async () => {
    const body = (await auth(http().get('/reports/receivables-aging?reconcile=true')).expect(200)).body as {
      totals: { unapplied: string; total: string };
      reconciliation: { ledgerBalance: string; reportTotal: string; difference: string };
    };
    return body;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'refund-fx');
    token = company.token;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل ردٍّ أجنبيّ ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع الردّ ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(http().post('/banks')).send({ name: `صندوق الردّ ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: today(), branchId }).expect(201)).body.id;
    const banks = (await auth(http().get('/banks')).expect(200)).body as { id: string; accountId: string }[];
    boxAccountId = banks.find((b) => b.id === cashBoxId)!.accountId;
    expect(boxAccountId).toBeTruthy();
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('ردُّ 100 USD بسعر 3.80 على إشعارٍ بسعر 3.70: الصندوق دائن 380 · 1200 مدين 370 · 5600 مدين 10 — والأعمارُ تطابق 1200', async () => {
    const note = await paidInvoiceWithCreditNote(100, { currency: 'USD', exchangeRate: 3.7 });
    // الإشعارُ بسعر فاتورته حرفاً: 100 × 3.70 = 370.00.
    expect(note.currency).toBe('USD');
    expect(Number(note.exchangeRate)).toBe(3.7);
    expect(Number(note.baseTotal)).toBe(370);

    // ① إشعارٌ أجنبيّ بلا سعر يوم الردّ ⟵ 400 مسمّى — لا يُفترض سعرُ الإشعار.
    const noRate = await auth(http().post('/payments/refund')).send({ creditNoteId: note.id, date: today(), method: 'CASH', bankId: cashBoxId, amount: 100 });
    expect(noRate.status).toBe(400);
    expect(noRate.body.message).toBe(arabic(formatMessage(MSG.refund_rate_required, { no: note.no, currency: 'USD' })));

    // ② عملةٌ غيرُ عملة الإشعار ⟵ 400 مسمّى — لا تُحوَّل صامتةً.
    const otherCurrency = await auth(http().post('/payments/refund'))
      .send({ creditNoteId: note.id, date: today(), method: 'CASH', bankId: cashBoxId, amount: 100, currency: 'EUR', exchangeRate: 4.1 });
    expect(otherCurrency.status).toBe(400);
    expect(otherCurrency.body.message).toBe(arabic(formatMessage(MSG.refund_currency_mismatch, { currency: 'EUR', no: note.no, noteCurrency: 'USD' })));

    // ③ الردُّ بسعر يومه.
    const refund = await auth(http().post('/payments/refund'))
      .send({ creditNoteId: note.id, date: today(), method: 'CASH', bankId: cashBoxId, amount: 100, currency: 'USD', exchangeRate: 3.8 })
      .expect(201);
    refundId = refund.body.id;
    // الصفُّ يحمل سعرَ يوم الردّ (§6.7): المبلغ −100 · السعر 3.8 · الأساس −100 × 3.80 = −380.00.
    expect(Number(refund.body.amount)).toBe(-100);
    expect(Number(refund.body.exchangeRate)).toBe(3.8);
    expect(Number(refund.body.baseAmount)).toBe(-380);

    const lines = await entryLines(refund.body.journalEntryId);
    const cash = lines.filter((l) => l.accountId === boxAccountId);
    const receivable = lines.filter((l) => l.code === '1200');
    const fx = lines.filter((l) => l.code === '5600');
    // الصندوق دائن بسعر اليوم: 100 × 3.80 = 380.00.
    expect(cash).toEqual([expect.objectContaining({ debit: 0, credit: 380 })]);
    // الذمّةُ تعود بسعر الإشعار: 100 × 3.70 = 370.00 — لا 380.
    expect(receivable).toEqual([expect.objectContaining({ debit: 370, credit: 0 })]);
    // والفرقُ خسارةٌ مسمّاة: 380 − 370 = 10.00 مدين (`fxGain = cash − settled = −380 − (−370) = −10` ⟵ مدين).
    expect(fx).toEqual([expect.objectContaining({ debit: 10, credit: 0 })]);
    expect(lines).toHaveLength(3);
    // متوازن: مدين 370 + 10 = 380 = دائن 380.
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(380);
    expect(lines.reduce((s, l) => s + l.credit, 0)).toBe(380);

    // ④ الأعمارُ تطابق 1200: الفاتورة 370 − 100 × 3.70 − 370 (الإشعار) = −370.00 في شريحتها،
    //    وسندُ الردّ غيرُ مخصَّص: −(−100) × 3.70 (سعرُ إشعاره لا سعرُ صفّه) = +370.00 — المجموع 0.00.
    //    ودفترُ 1200: 370 − 370 − 370 + 370 = 0.00. ولو قُرئ سعرُ الصفّ (3.80) لصار غيرُ المخصَّص 380 والفرقُ −10.00.
    const aging = await agingReconciliation();
    expect(aging.totals.unapplied).toBe('370.00');
    expect(aging.reconciliation).toEqual(expect.objectContaining({ ledgerBalance: '0.00', reportTotal: '0.00', difference: '0.00' }));
  });

  it('عكسُ الردّ يعيد 5600 إلى الصفر و1200 إلى −370 — والأعمارُ ما زالت تطابق', async () => {
    const reversal = await auth(http().post(`/payments/${refundId}/reverse`)).send({ reason: `عكس ردٍّ ${suffix}`, date: today() }).expect(201);
    // صفُّ العكس ينسخ سعرَ الردّ: 100 × 3.80 = 380.00.
    expect(Number(reversal.body.amount)).toBe(100);
    expect(Number(reversal.body.exchangeRate)).toBe(3.8);
    expect(Number(reversal.body.baseAmount)).toBe(380);

    const lines = await entryLines(reversal.body.journalEntryId);
    // مرآةُ قيد الردّ طرفاً بطرف: الصندوق مدين 380 (100 × 3.80) · 1200 دائن 370 (100 × 3.70) · 5600 دائن 10 (380 − 370).
    expect(lines.filter((l) => l.accountId === boxAccountId)).toEqual([expect.objectContaining({ debit: 380, credit: 0 })]);
    expect(lines.filter((l) => l.code === '1200')).toEqual([expect.objectContaining({ debit: 0, credit: 370 })]);
    expect(lines.filter((l) => l.code === '5600')).toEqual([expect.objectContaining({ debit: 0, credit: 10 })]);
    expect(lines).toHaveLength(3);

    // 5600 في المنشأة كلِّها: مدين 10 (الردّ) ودائن 10 (العكس) ⟵ صافٍ صفر.
    const fxTotals = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.journalLine.aggregate({ where: { account: { code: '5600' } }, _sum: { debit: true, credit: true } }),
    );
    expect(Number(fxTotals._sum.debit)).toBe(10);
    expect(Number(fxTotals._sum.credit)).toBe(10);

    // الأعمار: الفاتورة −370.00 · الردّ +370.00 · عكسُه −100 × 3.70 (سعرُ إشعار الردّ الذي يعكسه) = −370.00 ⟵ المجموع −370.00،
    // وغيرُ المخصَّص 370 − 370 = 0.00. ودفترُ 1200: 0 − 370 = −370.00 ⟵ الفرقُ 0.00.
    const aging = await agingReconciliation();
    expect(aging.totals.unapplied).toBe('0.00');
    expect(aging.reconciliation).toEqual(expect.objectContaining({ ledgerBalance: '-370.00', reportTotal: '-370.00', difference: '0.00' }));
  });

  it('إشعارٌ بعملة الأساس: سعرٌ مرسَلٌ يخالف سعرَه يُرفض، وبلا سعرٍ يُردّ كما كان بلا سطر 5600', async () => {
    const note = await paidInvoiceWithCreditNote(100);
    // عملةُ الأساس بسعر التعادل: 100 × 1 = 100.00.
    expect(Number(note.exchangeRate)).toBe(1);

    const withRate = await auth(http().post('/payments/refund')).send({ creditNoteId: note.id, date: today(), method: 'CASH', bankId: cashBoxId, amount: 100, exchangeRate: 3.8 });
    expect(withRate.status).toBe(400);
    expect(withRate.body.message).toBe(arabic(MSG.exchange_rate_same_currency));

    const refund = await auth(http().post('/payments/refund')).send({ creditNoteId: note.id, date: today(), method: 'CASH', bankId: cashBoxId, amount: 100 }).expect(201);
    expect(Number(refund.body.exchangeRate)).toBe(1);
    expect(Number(refund.body.baseAmount)).toBe(-100);
    const lines = await entryLines(refund.body.journalEntryId);
    // الصندوق دائن 100 · 1200 مدين 100 — ولا فرق: 100 − 100 = 0 فلا سطرَ 5600.
    expect(lines.filter((l) => l.accountId === boxAccountId)).toEqual([expect.objectContaining({ debit: 0, credit: 100 })]);
    expect(lines.filter((l) => l.code === '1200')).toEqual([expect.objectContaining({ debit: 100, credit: 0 })]);
    expect(lines.filter((l) => l.code === '5600')).toEqual([]);
    expect(lines).toHaveLength(2);
  });

  /**
   * ⚖️ **الردُّ الجزئيّ** (مراجعةٌ عدائية): الحالاتُ الثلاث أعلاه تردّ الإشعارَ كلَّه، فمبلغُ الردّ = مبلغُ الإشعار — فكسرٌ
   * يُعيد الذمّةَ بأساس الإشعار كلِّه (`baseReceivable: round2(-Number(note.baseTotal))`) أو بالقابل للردّ كلِّه يمرّ عليها.
   * وهنا يُردّ بعضُه: الذمّةُ تعود **بقدر المردود** × سعر الإشعار، لا بأساس الإشعار.
   */
  it('ردٌّ جزئيّ 40 USD بسعر 3.80 على إشعارٍ 100 USD بسعر 3.70: الصندوق دائن 152 · 1200 مدين 148 · 5600 مدين 4', async () => {
    const note = await paidInvoiceWithCreditNote(100, { currency: 'USD', exchangeRate: 3.7 });
    // القابلُ للردّ 100 (إشعار 100 − خصم 0 − ردود 0)، والمردودُ 40 منه.
    const refund = await auth(http().post('/payments/refund'))
      .send({ creditNoteId: note.id, date: today(), method: 'CASH', bankId: cashBoxId, amount: 40, currency: 'USD', exchangeRate: 3.8 })
      .expect(201);
    // الصفّ: المبلغ −40 · السعر 3.8 · الأساس round2(−40 × 3.80) = −152.00.
    expect(Number(refund.body.amount)).toBe(-40);
    expect(Number(refund.body.exchangeRate)).toBe(3.8);
    expect(Number(refund.body.baseAmount)).toBe(-152);

    const lines = await entryLines(refund.body.journalEntryId);
    // الصندوق دائن بسعر اليوم: 40 × 3.80 = 152.00.
    expect(lines.filter((l) => l.accountId === boxAccountId)).toEqual([expect.objectContaining({ debit: 0, credit: 152 })]);
    // الذمّةُ تعود بقدر المردود × سعر الإشعار: 40 × 3.70 = 148.00 — لا أساسُ الإشعار كلِّه (370.00).
    expect(lines.filter((l) => l.code === '1200')).toEqual([expect.objectContaining({ debit: 148, credit: 0 })]);
    // الفرق: `fxGain = cash − settled = −152 − (−148) = −4` ⟵ `5600` مدين 4.00.
    expect(lines.filter((l) => l.code === '5600')).toEqual([expect.objectContaining({ debit: 4, credit: 0 })]);
    expect(lines).toHaveLength(3);
    // متوازن: مدين 148 + 4 = 152 = دائن 152.
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(152);
    expect(lines.reduce((s, l) => s + l.credit, 0)).toBe(152);
  });
});
