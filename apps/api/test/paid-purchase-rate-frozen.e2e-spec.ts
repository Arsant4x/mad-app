import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): معلَنةٌ لا مقيسة — لم يُشغَّل `jest` في بناء هذه الحزمة؛ تُعايَر بثلاثة أضعاف المقيس بعد أوّل تشغيل.
jest.setTimeout(300000);

/**
 * **عملةُ فاتورة الشراء وسعرُ صرفها مجمَّدان ما دام عليها سدادٌ مخصَّص** (`ق-١٤٨٩`/B3).
 *
 * العطلُ الذي يُحرس: `PATCH /purchases/:id` كان يقبل سعراً أو عملةً جديدين على شراءٍ مسدَّد، فيعكس قيدَ
 * الشراء ويعيده بالسعر الجديد ولا يمسّ قيدَ السداد — فيبقى فرقُ السعرين رصيداً يتيماً في `2100`، ثم يقرأ
 * عكسُ السند السعرَ الجديد فيرحّل على `5600` فرقاً لم يُرحَّل أصلُه.
 *
 * **كلُّ رقمٍ محسوبٌ يداً** من الشيفرة المقروءة، والحسابُ في تعليقٍ فوق توكيده:
 * - الشراء (`postPurchaseEntry`): معفى بلا بنود ⟵ دائن `2100` بـ`baseTotal = round2(100 × 3.7) = 370`، سطرٌ واحد على `2100`.
 * - السداد (`postPartySettlementEntry`، `PAYABLE`): `baseSettled = baseSettledOf(100, 3.8, [{P,100}], {P: 3.7}) = 370`
 *   و`baseCash = round2(100 × 3.8) = 380` و`fxGain = settled − cash = −10` ⟵ مدين `2100` 370 · مدين `5600` 10 · دائن `1000` 380.
 * - كشفُ المورّد (`readLedger` بطرف `credit`): `closing = Σ دائن − Σ مدين` لسطور `2100` التي تحمل المورّد.
 *
 * ولكلِّ حالةٍ مورّدٌ خاصّ فيُقرأ كشفُه وحدَه، و`5600` يُقرأ فرقاً على مستوى المنشأة المعزولة.
 */
describe('Paid purchase — currency and rate frozen (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);

  const newSupplier = async (tag: string): Promise<string> =>
    (await auth(http().post('/suppliers')).send({ name: `مورّد ${tag} ${suffix}` }).expect(201)).body.id as string;

  /** شراءٌ معفى ١٠٠ دولار بسعر 3.70 — بلا بنود، فكلُّه خدميّ ولا رفَّ يُمسّ. */
  const makeUsdPurchase = async (supplierId: string): Promise<{ id: string; no: string; journalEntryId: string }> => {
    const res = await auth(http().post('/purchases'))
      .send({ supplierId, date: today(), category: `بند ${suffix}`, subtotal: 100, exempt: true, currency: 'USD', exchangeRate: 3.7 })
      .expect(201);
    expect(res.body.journalEntryId).toBeTruthy();
    return { id: res.body.id, no: res.body.no, journalEntryId: res.body.journalEntryId as string };
  };

  /** سندُ صرفٍ ١٠٠ دولار بسعر 3.80 نقداً (بلا بنك ⟵ `1000`) مخصَّصٌ كلُّه على الشراء. */
  const payUsd = async (supplierId: string, purchaseId: string): Promise<{ id: string; no: string }> => {
    const res = await auth(http().post('/supplier-payments'))
      .send({ supplierId, date: today(), amount: 100, method: 'CASH', currency: 'USD', exchangeRate: 3.8, allocations: [{ purchaseId, amount: 100 }] })
      .expect(201);
    return { id: res.body.id, no: res.body.no };
  };

  const purchaseRow = async (id: string) => {
    const rows = (await auth(http().get('/purchases')).expect(200)).body as {
      id: string;
      currency: string;
      exchangeRate: string;
      baseTotal: string;
      journalEntryId: string | null;
      status: string;
      allocated: string;
    }[];
    const row = rows.find((r) => r.id === id);
    expect(row).toBeDefined();
    return row!;
  };

  /** كشفُ المورّد على `2100` — الرصيدُ على الطرف الدائن، وعددُ السطور. */
  const statementOf = async (supplierId: string): Promise<{ closing: string; count: number }> => {
    const body = (await auth(http().get(`/reports/statement?supplierId=${supplierId}`)).expect(200)).body as { closing: string; count: number };
    return { closing: body.closing, count: body.count };
  };

  /** مجموعا `5600` في ميزان المراجعة — والحسابُ بلا سطرٍ بعدُ لا يظهر صفّاً فهو صفر. */
  const fxTotals = async (): Promise<{ debit: number; credit: number }> => {
    const body = (await auth(http().get('/reports/trial-balance')).expect(200)).body as {
      rows: { code: string; debitTotal: string; creditTotal: string }[];
      balanced: boolean;
    };
    expect(body.balanced).toBe(true);
    const row = body.rows.find((r) => r.code === '5600');
    return { debit: row ? Number(row.debitTotal) : 0, credit: row ? Number(row.creditTotal) : 0 };
  };

  const frozenMessage = (no: string, allocated: string) =>
    resolveMessage(formatMessage(MSG.purchase_rate_frozen_after_payment, { no, allocated }), DEFAULT_LANGUAGE);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'paid-purchase-rate');
    token = company.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① سعرٌ أو عملةٌ جديدان على شراءٍ مسدَّد ⟵ 409 مسمّى، ولا يُمسّ الدفتر ولا الشراء', async () => {
    const supplierId = await newSupplier('مسدَّد');
    const purchase = await makeUsdPurchase(supplierId);
    // بعد الشراء: دائن 370 ⟵ closing = 370 − 0.
    expect((await statementOf(supplierId)).closing).toBe('370.00');

    const fxBefore = await fxTotals();
    await payUsd(supplierId, purchase.id);

    // بعد السداد: دائن 370 − مدين 370 = 0، وسطران على `2100` (سطرُ الشراء + سطرُ السداد).
    const paid = await statementOf(supplierId);
    expect(paid).toEqual({ closing: '0.00', count: 2 });
    // 5600: مدينٌ بـ10 = |fxGain| = |370 − 380|، ولا دائن.
    const fxPaid = await fxTotals();
    expect(fxPaid.debit - fxBefore.debit).toBeCloseTo(10, 2);
    expect(fxPaid.credit - fxBefore.credit).toBeCloseTo(0, 2);

    // المخصَّصُ صافياً = round2(100) ⟵ formatMoney = '100.00' — والرسالةُ تحمل المفتاحَ برقم الشراء ومسدَّده.
    const expected = frozenMessage(purchase.no, '100.00');

    // السعرُ وحدَه (يُمسك حارساً على العملة وحدَها).
    const byRate = await auth(http().patch(`/purchases/${purchase.id}`)).send({ exchangeRate: 3.6 });
    expect(byRate.status).toBe(409);
    expect(byRate.body.message).toBe(expected);

    // والعملةُ وحدَها (تُمسك حارساً على السعر وحدَه) — وبلا سعرٍ لا يتغيّر `baseTotal`، فالتوكيدُ هنا الرفضُ نفسُه.
    const byCurrency = await auth(http().patch(`/purchases/${purchase.id}`)).send({ currency: 'EUR' });
    expect(byCurrency.status).toBe(409);
    expect(byCurrency.body.message).toBe(expected);

    // الدفترُ كما كان: لا عكسَ ولا إعادةَ ترحيل. ولو مرّ السعرُ 3.6 لصار: دائن (370 + 360) − مدين (370 + 370) = −10 وأربعةُ سطور.
    expect(await statementOf(supplierId)).toEqual({ closing: '0.00', count: 2 });
    const fxAfter = await fxTotals();
    expect(fxAfter.debit - fxPaid.debit).toBeCloseTo(0, 2);
    expect(fxAfter.credit - fxPaid.credit).toBeCloseTo(0, 2);

    // والشراءُ كما كان: عملتُه وسعرُه وأساسُه وقيدُه (إعادةُ الترحيل كانت ستبدّل `journalEntryId`) وحالتُه.
    const row = await purchaseRow(purchase.id);
    expect(row.currency).toBe('USD');
    expect(Number(row.exchangeRate)).toBe(3.7);
    expect(Number(row.baseTotal)).toBe(370);
    expect(row.journalEntryId).toBe(purchase.journalEntryId);
    expect({ status: row.status, allocated: row.allocated }).toEqual({ status: 'PAID', allocated: '100.00' });
  });

  it('② المخرجُ المسمّى حقيقيّ: بعد عكس السند يصير المخصَّصُ صافياً صفراً فيُعدَّل السعر ⟵ 200', async () => {
    const supplierId = await newSupplier('معكوس');
    const purchase = await makeUsdPurchase(supplierId);
    const fxBefore = await fxTotals();
    const payment = await payUsd(supplierId, purchase.id);

    // العكس: basePayable = −baseSettledOf(100, 3.8, [{P,100}], {P: 3.7}) = −370 · baseCash = round2(−100 × 3.8) = −380
    // · fxGain = −370 − (−380) = +10 ⟵ مدين `1000` 380 · دائن `2100` 370 · دائن `5600` 10.
    await auth(http().post(`/supplier-payments/${payment.id}/reverse`)).send({ reason: `تصحيح سعر ${suffix}`, date: today() }).expect(201);
    // الكشف: دائن (370 + 370) − مدين 370 = 370، والتخصيصاتُ 100 + (−100) = 0.
    expect((await statementOf(supplierId)).closing).toBe('370.00');
    const reversed = await purchaseRow(purchase.id);
    expect({ status: reversed.status, allocated: reversed.allocated }).toEqual({ status: 'DUE', allocated: '0.00' });

    // الآن يُقبل: allocatedFor = 0 وهو لا يتجاوز SETTLEMENT_EPS (0.005).
    const edited = await auth(http().patch(`/purchases/${purchase.id}`)).send({ exchangeRate: 3.6 }).expect(200);
    // baseTotal = round2(100 × 3.6) = 360، والقيدُ أُعيد ترحيلُه فتبدّل معرّفه.
    expect(Number(edited.body.exchangeRate)).toBe(3.6);
    expect(Number(edited.body.baseTotal)).toBe(360);
    expect(edited.body.journalEntryId).not.toBe(purchase.journalEntryId);

    // الكشف: عكسُ قيد الشراء مدين 370 وإعادتُه دائن 360 ⟵ دائن (370 + 370 + 360) − مدين (370 + 370) = 1100 − 740 = 360،
    // وخمسةُ سطور على `2100` (شراء · سداد · عكسُ السداد · عكسُ الشراء · إعادتُه).
    expect(await statementOf(supplierId)).toEqual({ closing: '360.00', count: 5 });
    // و5600 صافيه صفرٌ لهذه الحالة: مدين 10 عند السداد يقابله دائن 10 عند العكس.
    const fxAfter = await fxTotals();
    expect(fxAfter.debit - fxBefore.debit).toBeCloseTo(10, 2);
    expect(fxAfter.credit - fxBefore.credit).toBeCloseTo(10, 2);
  });

  it('③ الشراءُ غيرُ المسدَّد يُعدَّل سعرُه ⟵ 200، ويُعاد ترحيلُه بالسعر الجديد ولا يمسّ 5600', async () => {
    const supplierId = await newSupplier('غير مسدَّد');
    const purchase = await makeUsdPurchase(supplierId);
    const fxBefore = await fxTotals();

    // لا تخصيصَ فلا صفَّ في `allocatedByDocument` ⟵ allocatedFor = 0.
    const edited = await auth(http().patch(`/purchases/${purchase.id}`)).send({ exchangeRate: 3.6 }).expect(200);
    expect(Number(edited.body.exchangeRate)).toBe(3.6);
    expect(Number(edited.body.baseTotal)).toBe(360);
    expect(edited.body.journalEntryId).not.toBe(purchase.journalEntryId);

    // الكشف: دائن 370 (الشراء) + 360 (الإعادة) − مدين 370 (العكس) = 360، وثلاثةُ سطور.
    expect(await statementOf(supplierId)).toEqual({ closing: '360.00', count: 3 });
    const fxAfter = await fxTotals();
    expect(fxAfter.debit - fxBefore.debit).toBeCloseTo(0, 2);
    expect(fxAfter.credit - fxBefore.credit).toBeCloseTo(0, 2);
  });
});
