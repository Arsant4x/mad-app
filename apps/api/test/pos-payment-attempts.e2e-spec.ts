import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { MockTerminalAdapter, TERMINAL_ADAPTERS } from '../src/integrations/payment-terminal.adapter';
import { PosCardVerificationsService } from '../src/pos/pos-card-verifications.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { backdateShiftOpening } from './backdate-shift';

jest.setTimeout(120000);

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const DAY_MS = 86_400_000;

/**
 * ⭐ **محاولةُ دفع البطاقة — الرفضُ والمعلّقُ والحسمُ والمراجعة** (`ق-١٤٠١` · `ق-١٣٩٧` … `ق-١٣٩٩`).
 *
 * بعد المسابير الثلاثة (`pos-payment-path.e2e-spec.ts`) — ما يقوله الموجزُ بحكم المالك:
 * ④ الرفضُ لا يترك فاتورةً ولا يستهلك رقماً · ⑤ المعلّقُ لا يخرج إلا بجواب المزوّد، و«لا أثر» جوابٌ بعد المهلة وحدَها ·
 * ⑥ نقرتان شحنٌ واحد · ⑦ الحسمُ اليدويّ بدليلٍ لصاحب المراجعة وحدَه، والمزوّدُ يُسأل أوّلاً، والقاعدةُ ترفض حسماً بلا دليل ·
 * ⑧ المناوبةُ لا تُقفل والمالُ في الطريق، وما لم يُرسل يُلغى معها · ⑨ غيرُ المتحقَّق يُرفع باسم الكاشير بعد مهلة التسوية،
 * والتسويةُ تطابقه · ⑩ بلا ربطٍ: «أكّده الكاشير» · ⑪ مزامنةٌ لبيعٍ له محاولةٌ في الطريق تُردّ · ⑫ المقسّمُ يشحن جزءَ البطاقة وحدَه.
 */
describe('[SPEC 27.1] محاولةُ دفع البطاقة — الرفضُ والمعلّقُ والحسمُ والمراجعة (ق-١٣٩٧ … ق-١٤٠١)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let productId: string;
  let declineProductId: string;
  let connectionId: string;
  let ownerShiftId: string;
  let cashierToken: string;
  let cashierUserId: string;
  let cashierTemplateId: string;
  const mock = TERMINAL_ADAPTERS.MOCK as MockTerminalAdapter;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const asCashier = (r: request.Test) => r.set('Authorization', `Bearer ${cashierToken}`);

  const tenant = () => app.get(TenantPrismaService);
  const invoiceBySale = (clientSaleId: string) =>
    tenant().runInTenantContext(co.companyId, (tx) => tx.invoice.findFirst({ where: { clientSaleId }, include: { posPayments: true } }));

  const ringing = (extra: Record<string, unknown> = {}) => ({
    clientSaleId: randomUUID(),
    ringAt: new Date().toISOString(),
    ringOffsetMin: 180,
    lines: [{ productId, quantity: 1 }],
    paymentMethod: 'CARD',
    ...extra,
  });
  const createAttempt = async (sale: Record<string, unknown>, as = auth) => {
    const res = await as(http().post('/pos/payment-attempts')).send(sale);
    expect(res.status).toBe(201);
    return res.body as { id: string; status: string; clientSaleId: string; cardAmount: string };
  };
  const charge = (id: string, as = auth) => as(http().post(`/pos/payment-attempts/${id}/charge`));
  const seq = (no: string) => Number(no.split('-').pop());

  afterEach(() => {
    jest.restoreAllMocks();
    mock.chargeDeadlineMs = 90_000;
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    co = await registerIsolatedCompany(app, 'attempts');
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `محاولة ${Date.now()}`, price: 100 }).expect(201)).body.id;
    // 7.94 × 1.15 = 9.131 ⟸ 9.13 — هللاتُه 13: رفضٌ تجريبيٌّ حتميّ (`MockTerminalAdapter`).
    declineProductId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `رفض ${Date.now()}`, price: 7.94 }).expect(201)).body.id;
    ownerShiftId = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body.id;
    connectionId = (await auth(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: 'attempts-262' } }).expect(201)).body.id;

    // كاشيرٌ بالاطّلاع والتسجيل وحدَهما — لا مراجعة.
    const stamp = Date.now();
    cashierTemplateId = (
      await auth(http().post('/templates')).send({ name: `كاشيرُ المحاولات ${stamp}`, isAllScreens: false, allowedScreens: ['pos'], screenActions: { pos: ['view', 'record'] } }).expect(201)
    ).body.id;
    cashierUserId = (
      await auth(http().post('/company-users')).send({ name: 'كاشير المحاولات', username: `attempts-cashier-${stamp}`, password: 'CashierPass123!', permissionTemplateId: cashierTemplateId }).expect(201)
    ).body.id;
    cashierToken = (await http().post('/auth/login').send({ username: `attempts-cashier-${stamp}`, password: 'CashierPass123!' })).body.accessToken;
    expect(typeof cashierToken).toBe('string');
  }, 120000);

  afterAll(async () => {
    jest.restoreAllMocks();
    mock.chargeDeadlineMs = 90_000;
    await auth(http().delete(`/company-users/${cashierUserId}`));
    await auth(http().delete(`/templates/${cashierTemplateId}`));
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('[SPEC 27.1] ④ رفضُ المزوّد لا يترك فاتورةً ولا يستهلك رقماً — والبيعُ التالي يأخذ الرقمَ التالي بلا فجوة', async () => {
    const first = await createAttempt(ringing());
    const firstDone = await charge(first.id).expect(201);
    expect(firstDone.body.status).toBe('COMPLETED');

    const declined = await createAttempt(ringing({ lines: [{ productId: declineProductId, quantity: 1 }] }));
    const res = await charge(declined.id).expect(201);
    expect(res.body.status).toBe('DECLINED');
    expect(String(res.body.declineReason)).toContain('رفض');
    expect(await invoiceBySale(declined.clientSaleId)).toBeNull();

    const next = await createAttempt(ringing());
    const nextDone = await charge(next.id).expect(201);
    expect(seq(nextDone.body.sale.no)).toBe(seq(firstDone.body.sale.no) + 1);
  });

  it('[SPEC 27.1] ⑤ المعلّقُ لا يخرج إلا بجواب المزوّد — والحسمُ بلا شحنٍ ثانٍ (ق-١٣٩٨ · ق-١٣٩٩)', async () => {
    mock.chargeDeadlineMs = 300;
    const calls: string[] = [];
    jest.spyOn(mock, 'charge').mockImplementation(async (_c, r) => {
      calls.push(r.reference);
      // المزوّدُ وافق — والجوابُ تأخّر بعد المهلة.
      mock.remember(r.reference, { state: 'APPROVED', providerRef: `MOCK-${r.reference}`, approvalCode: 'A55555' });
      await sleep(1500);
      return { approved: true, providerRef: `MOCK-${r.reference}`, approvalCode: 'A55555' };
    });
    const attempt = await createAttempt(ringing());
    const charged = await charge(attempt.id).expect(201);
    expect(charged.body.status).toBe('UNKNOWN');
    expect(String(charged.body.detail)).toContain('ثانية');
    expect(await invoiceBySale(attempt.clientSaleId)).toBeNull();

    const resolved = await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve`)).expect(201);
    expect(resolved.body).toMatchObject({ status: 'COMPLETED', resolution: 'PROVIDER_STATUS', providerRef: `MOCK-${attempt.id}` });
    expect(resolved.body.sale.status).toBe('PAID');
    expect(calls).toEqual([attempt.id]);
    const invoice = await invoiceBySale(attempt.clientSaleId);
    expect(invoice?.posPayments.find((p) => p.method === 'CARD')).toMatchObject({ verification: 'PROVIDER_APPROVED', providerRef: `MOCK-${attempt.id}`, attemptId: attempt.id });
  });

  /**
   * ⚖️ **المعلّقُ لا يحبس المناوبةَ أبداً** (`ق-١٤١٨` · التوجيه ٢٦٣ §٥ بنصّ المالك: «تُقفل وهو فيها مسمّىً، وينتقل إلى قائمة
   * المطابقة بالتسوية»). كاشيرٌ يفتح مناوبتَه، ومحاولتُه معلّقة (المزوّدُ وافق وتأخّر جوابُه) ⟸ المالكُ يقفلها `201` **ويُسمّيها
   * الردّ** · وتظهر في قائمة المطابقة · **ولا بيعَ ولا رفضَ بالتخمين** · ثم يحسمها جوابُ المزوّد ⟸ البيعُ يكتمل على المناوبة
   * المقفلة، وتخرج من القائمة.
   */
  it('[SPEC 27.1] ⑤ج ⚖️ المعلّقُ لا يحبس المناوبة: تُقفل وهو مسمّىً فيها، وينتقل إلى قائمة المطابقة حتى يُحسم (ق-١٤١٨)', async () => {
    const cashierShift = (await asCashier(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body.id as string;
    mock.chargeDeadlineMs = 300;
    jest.spyOn(mock, 'charge').mockImplementation(async (_c, r) => {
      mock.remember(r.reference, { state: 'APPROVED', providerRef: `MOCK-${r.reference}`, approvalCode: 'A77777' });
      await sleep(1500);
      return { approved: true, providerRef: `MOCK-${r.reference}`, approvalCode: 'A77777' };
    });
    const attempt = await createAttempt(ringing(), asCashier);
    expect((await charge(attempt.id, asCashier).expect(201)).body.status).toBe('UNKNOWN');

    // المالكُ يقفل مناوبةَ الكاشير — والمعلّقُ فيها لا يحبسها، بل يُسمّى.
    const closed = await auth(http().post(`/pos/shifts/${cashierShift}/close`)).send({ declaredClosing: 0 }).expect(201);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.pendingAttempts).toEqual([expect.objectContaining({ id: attempt.id, status: 'UNKNOWN', cardAmount: attempt.cardAmount })]);
    // ولا يُخمَّن: لا بيعَ ولا رفض — المحاولةُ بحالها.
    expect(await invoiceBySale(attempt.clientSaleId)).toBeNull();
    expect((await auth(http().get(`/pos/payment-attempts/${attempt.id}`)).expect(200)).body.status).toBe('UNKNOWN');

    // وينتقل إلى قائمة المطابقة بالتسوية.
    const listed = await auth(http().get('/pos/card-verifications')).expect(200);
    expect((listed.body.unresolvedAttempts as { attemptId: string }[]).find((a) => a.attemptId === attempt.id)).toMatchObject({ status: 'UNKNOWN', amount: attempt.cardAmount });

    // جوابُ المزوّد يحسمه ⟸ البيعُ يكتمل على المناوبة المقفلة، ويخرج من القائمة.
    const resolved = await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve`)).expect(201);
    expect(resolved.body.status).toBe('COMPLETED');
    expect((await invoiceBySale(attempt.clientSaleId))?.posShiftId).toBe(cashierShift);
    const after = await auth(http().get('/pos/card-verifications')).expect(200);
    expect((after.body.unresolvedAttempts as { attemptId: string }[]).some((a) => a.attemptId === attempt.id)).toBe(false);
  });

  it('[SPEC 27.1] ⑤ب «لا أثر لدى المزوّد» جوابٌ بعد انقضاء المهلة وحدَها — وقبلها تبقى معلّقة', async () => {
    mock.chargeDeadlineMs = 1500;
    jest.spyOn(mock, 'charge').mockRejectedValueOnce(new Error('ECONNRESET — انقطع الاتصال'));
    const attempt = await createAttempt(ringing());
    const charged = await charge(attempt.id).expect(201);
    expect(charged.body.status).toBe('UNKNOWN');

    const early = await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve`)).expect(201);
    expect(early.body.status).toBe('UNKNOWN');
    expect(String(early.body.detail)).toContain('NOT_FOUND');

    await sleep(1600);
    const late = await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve`)).expect(201);
    expect(late.body).toMatchObject({ status: 'DECLINED', resolution: 'PROVIDER_STATUS' });
    expect(String(late.body.declineReason)).toContain('لا أثر');
    expect(await invoiceBySale(attempt.clientSaleId)).toBeNull();
  });

  it('[SPEC 27.1] ⑥ نقرتان لا تشحنان مرّتين — وفاتورةٌ واحدة (التداخلُ مفروضٌ لا منتظَر — §8.8)', async () => {
    const calls: string[] = [];
    const real = MockTerminalAdapter.prototype.charge;
    jest.spyOn(mock, 'charge').mockImplementation(async (c, r) => {
      calls.push(r.reference);
      await sleep(800);
      return real.call(mock, c, r);
    });
    const attempt = await createAttempt(ringing());
    // ⚠️ **التداخلُ يُفرض**: كلا الطلبين يقرأ المحاولةَ «لم تُرسل» ثم ينتظر قبل انتقالها — فلو كان الانتقالُ غيرَ مشروطٍ
    //    بالحالة لشحن الاثنان. بلا هذا التأخير قد يتعاقبان فيمرّ الحارسُ على الكسر (حارسُ سباقٍ يشهد لنفسه).
    const integrations = app.get(IntegrationsService);
    const realGateway = integrations.activeGateway.bind(integrations);
    jest.spyOn(integrations, 'activeGateway').mockImplementation(async (tx) => {
      await sleep(400);
      return realGateway(tx);
    });
    const [a, b] = await Promise.all([charge(attempt.id), charge(attempt.id)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(calls).toEqual([attempt.id]);
    const final = await auth(http().get(`/pos/payment-attempts/${attempt.id}`)).expect(200);
    expect(final.body.status).toBe('COMPLETED');
    const invoices = await tenant().runInTenantContext(co.companyId, (tx) => tx.invoice.count({ where: { clientSaleId: attempt.clientSaleId } }));
    expect(invoices).toBe(1);
  });

  it('[SPEC 27.1] ⑦ الحسمُ اليدويّ بدليلٍ لصاحب المراجعة وحدَه — بعد أن يُسأل المزوّد فلا يُجيب، ويُسجَّل مَن حسم (ق-١٣٩٩)', async () => {
    mock.chargeDeadlineMs = 300;
    jest.spyOn(mock, 'charge').mockImplementation(() => new Promise(() => undefined));
    const status = jest.spyOn(mock, 'status').mockResolvedValue({ state: 'PENDING' });
    const attempt = await createAttempt(ringing());
    expect((await charge(attempt.id).expect(201)).body.status).toBe('UNKNOWN');

    const evidence = { deviceReference: `RRN-${Date.now()}`, approvalCode: '778899', note: 'إيصالُ الجهاز يقول: مقبولة' };
    // الكاشيرُ بلا مراجعة: الحارسُ يردّ قبل الخدمة.
    await asCashier(http().post(`/pos/payment-attempts/${attempt.id}/resolve-with-evidence`)).send(evidence).expect(403);
    // ولا حسمَ بلا رمز الموافقة — «بدليلٍ لا بقول».
    await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve-with-evidence`)).send({ deviceReference: evidence.deviceReference }).expect(400);

    const resolved = await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve-with-evidence`)).send(evidence).expect(201);
    expect(status).toHaveBeenCalled();
    expect(resolved.body).toMatchObject({
      status: 'COMPLETED',
      resolution: 'MANUAL_EVIDENCE',
      evidence: { deviceReference: evidence.deviceReference, approvalCode: evidence.approvalCode, note: evidence.note },
    });
    expect(String(resolved.body.resolvedByName)).toContain('مالك');
    const invoice = await invoiceBySale(attempt.clientSaleId);
    expect(invoice?.status).toBe('PAID');
    expect(invoice?.posPayments.find((p) => p.method === 'CARD')).toMatchObject({
      verification: 'MANUAL_EVIDENCE',
      deviceReference: evidence.deviceReference,
      approvalCode: evidence.approvalCode,
      providerRef: null,
    });
  });

  it('[SPEC 27.1] ⑦ب المزوّدُ يُسأل أوّلاً — إن أجاب فجوابُه يحسمها لا الدليلُ اليدويّ', async () => {
    mock.chargeDeadlineMs = 300;
    jest.spyOn(mock, 'charge').mockImplementation(() => new Promise(() => undefined));
    jest.spyOn(mock, 'status').mockImplementation(async (_c, reference) => ({ state: 'APPROVED', providerRef: `MOCK-${reference}`, approvalCode: 'P11111' }));
    const attempt = await createAttempt(ringing());
    expect((await charge(attempt.id).expect(201)).body.status).toBe('UNKNOWN');
    const resolved = await auth(http().post(`/pos/payment-attempts/${attempt.id}/resolve-with-evidence`)).send({ deviceReference: 'RRN-IGNORED', approvalCode: '000000' }).expect(201);
    expect(resolved.body).toMatchObject({ status: 'COMPLETED', resolution: 'PROVIDER_STATUS', approvalCode: 'P11111', evidence: null });
  });

  it('[SPEC 27.1] ⑦ج ⛔ لا «اعتبرها مقبولة» بلا دليل — القاعدةُ نفسُها ترفض حسماً يدوياً بلا مرجعٍ ورمز', async () => {
    const attempt = await createAttempt(ringing());
    let sqlstate: string | null = null;
    let constraint: string | null = null;
    await tenant()
      .runInTenantContext(co.companyId, (tx) => tx.$executeRawUnsafe(`UPDATE "pos_payment_attempts" SET "resolution" = 'MANUAL_EVIDENCE', "status" = 'APPROVED' WHERE id = $1`, attempt.id))
      .catch((e: Error) => {
        sqlstate = (String(e.message).match(/Code: `(\d{5})`/) ?? [])[1] ?? null;
        constraint = (String(e.message).match(/violates check constraint \\?"([^"\\]+)/) ?? [])[1] ?? null;
      });
    expect({ sqlstate, constraint }).toEqual({ sqlstate: '23514', constraint: 'pos_payment_attempts_manual_evidence' });
    await auth(http().post(`/pos/payment-attempts/${attempt.id}/cancel`)).expect(201);
  });

  it('[SPEC 27.1] ⑧ ما لم يُرسل يُلغى مع إقفال المناوبة — ولا يُشحن بعدها', async () => {
    const cashierShift = (await asCashier(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body.id as string;
    const attempt = await createAttempt(ringing(), asCashier);
    expect(attempt.status).toBe('CREATED');
    // المالكُ يقفل مناوبةَ كاشيرٍ (الإقفالُ مراجعة).
    await auth(http().post(`/pos/shifts/${cashierShift}/close`)).send({ declaredClosing: 0 }).expect(201);
    const after = await auth(http().get(`/pos/payment-attempts/${attempt.id}`)).expect(200);
    expect(after.body).toMatchObject({ status: 'CANCELLED', resolution: 'CANCELLED' });
    const calls = jest.spyOn(mock, 'charge');
    const retried = await charge(attempt.id, asCashier).expect(201);
    expect(retried.body.status).toBe('CANCELLED');
    expect(calls).not.toHaveBeenCalled();
  });

  it('[SPEC 27.1] ⑨ غيرُ المتحقَّق يُرفع للمراجعة باسم الكاشير بعد مهلة التسوية — والتسويةُ تطابقه (ق-١٣٩٧/٢–٣)', async () => {
    const ringAt = new Date(Date.now() - 5 * DAY_MS).toISOString();
    const reference = `RRN-5D-${Date.now()}`;
    const sale = ringing({ ringAt, cardDeviceReference: reference });
    // The sale was rung five days ago, so the shift it is synced to opened before it.
    await backdateShiftOpening(app, co.companyId, [ownerShiftId], new Date(Date.now() - 6 * DAY_MS));
    const synced = await auth(http().post('/pos/sales/sync')).send(sale).expect(201);

    // القائمةُ للمراجعة — لا للكاشير.
    await asCashier(http().get('/pos/card-verifications')).expect(403);
    const open = await auth(http().get('/pos/card-verifications')).expect(200);
    expect(open.body.settlementDays).toBe(3);
    const row = (open.body.items as { invoiceNo: string; cashierName: string }[]).find((r) => r.invoiceNo === synced.body.no);
    expect(row).toMatchObject({ verification: 'DEVICE_REFERENCE', deviceReference: reference, matched: false, overdue: true });
    const cashierName = String(row?.cashierName);
    expect(cashierName).toContain('مالك');

    const verifications = app.get(PosCardVerificationsService);
    expect(await verifications.raiseOverdue(co.companyId)).toBeGreaterThanOrEqual(1);
    expect(await verifications.raiseOverdue(co.companyId)).toBe(0);
    const notes = await tenant().runInTenantContext(co.companyId, (tx) =>
      tx.notification.findMany({ where: { kind: 'POS_CARD_UNMATCHED', linkId: synced.body.id }, select: { title: true, body: true } }),
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain(cashierName);
    expect(notes[0].body).toContain(reference);

    // التسويةُ تطالب بسند قبض الشبكة لهذه الفاتورة ⟸ مطابَق، ولم يعد مفتوحاً.
    const receipt = await tenant().runInTenantContext(co.companyId, (tx) =>
      tx.payment.findFirstOrThrow({ where: { method: 'CARD', allocations: { some: { invoiceId: synced.body.id } } }, select: { id: true } }),
    );
    const bankId = (await auth(http().post('/banks')).send({ name: `بنك التسوية ${Date.now()}`, kind: 'BANK_ACCOUNT', openingDate: '2026-01-01' }).expect(201)).body.id;
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 10 * DAY_MS).toISOString().slice(0, 10);
    const settlement = await auth(http().post('/banks/network-settlements'))
      .send({ bankId, date: today, periodFrom: from, periodTo: today, feeAmount: 1, feeVatAmount: 0.15, receiptIds: [receipt.id] })
      .expect(201);
    const matched = await auth(http().get('/pos/card-verifications?state=matched')).expect(200);
    expect((matched.body.items as { invoiceNo: string }[]).find((r) => r.invoiceNo === synced.body.no)).toMatchObject({ matched: true, overdue: false, settlementNo: settlement.body.no });
    const stillOpen = await auth(http().get('/pos/card-verifications')).expect(200);
    expect((stillOpen.body.items as { invoiceNo: string }[]).some((r) => r.invoiceNo === synced.body.no)).toBe(false);
  });

  /**
   * ⚖️ **الجهازُ المستقلُّ بلا ربط: شرطُ رقم المرجع كبيع البطاقة دون اتصال** (`ق-١٤١٩` · التوجيه ٢٦٣ §٥ بنصّ المالك: «فالحكمُ
   * واحد»). بلا رقمٍ ⟸ `400` مسمّى · وبرقمٍ ⟸ «غيرُ متحقَّق» حتى تطابقه التسوية، ويظهر في قائمة المطابقة — **لا «أكّده الكاشير»**.
   */
  it('[SPEC 27.1] ⑩ ⚖️ بلا ربطٍ فعّال — جهازٌ مستقلّ: رقمُ المرجع إلزاميّ، والبطاقةُ غيرُ متحقَّقةٍ حتى تطابقها التسوية (ق-١٤١٩)', async () => {
    await auth(http().patch(`/integrations/${connectionId}/enabled`)).send({ enabled: false }).expect(200);
    try {
      const calls = jest.spyOn(mock, 'charge');
      const bare = await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD' });
      expect(bare.status).toBe(400);
      expect(String(bare.body.message)).toContain('مرجع الجهاز');
      const reference = `RRN-STANDALONE-${Date.now()}`;
      const res = await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD', cardDeviceReference: reference }).expect(201);
      expect(calls).not.toHaveBeenCalled();
      const card = (res.body.posPayments as Record<string, unknown>[]).find((p) => p.method === 'CARD');
      expect(card).toMatchObject({ verification: 'DEVICE_REFERENCE', deviceReference: reference, providerRef: null });
      const open = await auth(http().get('/pos/card-verifications')).expect(200);
      expect((open.body.items as { invoiceNo: string }[]).find((r) => r.invoiceNo === res.body.no)).toMatchObject({ verification: 'DEVICE_REFERENCE', matched: false });
      // ولا محاولةَ بلا بوابة.
      const refused = await auth(http().post('/pos/payment-attempts')).send(ringing());
      expect(refused.status).toBe(409);
    } finally {
      await auth(http().patch(`/integrations/${connectionId}/enabled`)).send({ enabled: true }).expect(200);
    }
  });

  it('[SPEC 27.1] ⑪ مزامنةٌ لبيعٍ له محاولةٌ في الطريق تُردّ — وما لم يُرسل يُلغى ويُسجَّل البيعُ مزامَناً', async () => {
    const unsent = await createAttempt(ringing());
    const synced = await auth(http().post('/pos/sales/sync')).send({ ...ringing({ cardDeviceReference: 'RRN-UNSENT' }), clientSaleId: unsent.clientSaleId }).expect(201);
    expect(synced.body.clientSaleId).toBe(unsent.clientSaleId);
    expect((await auth(http().get(`/pos/payment-attempts/${unsent.id}`)).expect(200)).body.status).toBe('CANCELLED');

    mock.chargeDeadlineMs = 300;
    jest.spyOn(mock, 'charge').mockImplementation(() => new Promise(() => undefined));
    const inFlight = await createAttempt(ringing());
    expect((await charge(inFlight.id).expect(201)).body.status).toBe('UNKNOWN');
    const refused = await auth(http().post('/pos/sales/sync')).send({ ...ringing({ cardDeviceReference: 'RRN-DOUBLE' }), clientSaleId: inFlight.clientSaleId });
    expect(refused.status).toBe(409);
    expect(String(refused.body.message)).toContain('لم تُحسم');
    expect(await invoiceBySale(inFlight.clientSaleId)).toBeNull();
  });

  it('[SPEC 27.1] ⑫ المقسّمُ يشحن جزءَ البطاقة وحدَه — والنقدُ لا يُسجَّل إلا مع الإتمام', async () => {
    const amounts: number[] = [];
    const real = MockTerminalAdapter.prototype.charge;
    jest.spyOn(mock, 'charge').mockImplementation(async (c, r) => {
      amounts.push(r.amount);
      return real.call(mock, c, r);
    });
    const attempt = await createAttempt(ringing({ paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: 15 }, { method: 'CARD', amount: 100 }] }));
    expect(attempt.cardAmount).toBe('100.00');
    const done = await charge(attempt.id).expect(201);
    expect(done.body.status).toBe('COMPLETED');
    expect(amounts).toEqual([100]);
    const invoice = await invoiceBySale(attempt.clientSaleId);
    const rows = invoice!.posPayments.map((p) => ({ method: p.method, amount: Number(p.amount), verification: p.verification })).sort((x, y) => x.method.localeCompare(y.method));
    expect(rows).toEqual([
      { method: 'CARD', amount: 100, verification: 'PROVIDER_APPROVED' },
      { method: 'CASH', amount: 15, verification: null },
    ]);
  });
});
