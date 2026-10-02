import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';
import { RaceResult, RaceTable, raceHarness } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): لم تُقَس بعد. سبعةُ مساراتٍ لكلٍّ ضابطٌ وسباقٌ قد ينتظر حتى عشرين ثانيةً في أسوأ حاله.
//    سقفٌ معلَن يُضبط بثلاثة أضعاف المقيس بعد أوّل تشغيلٍ في السير.
jest.setTimeout(240000);

/**
 * **أثرٌ يقع مرّةً واحدة، الجزءُ الثاني** (توجيه ٢٧٤ الكتلة ٥ · مسحُ نظائر البندين 18 و27 من مراجعة 3.3).
 *
 * الجزءُ الأوّل (`once-only-cash-out.e2e-spec.ts`) أصلح الردَّ والتأمين. ومسحُ النظائر قرأ سبعةَ مساراتٍ أخرى على العلّة
 * نفسِها: قراءةٌ بلا قفلٍ ثم فحصُ حالٍ ثم كتابةٌ، فطلبان متزامنان يقرآن الحالَ نفسَه قبل أن يلتزم أحدُهما:
 *   اعتمادُ الشطب (`write-offs.service` `pendingOrThrow`) · إقفالُ المناوبة (`pos.service` `closeShift`) · إنشاءُ تسوية الشبكة
 *   (`network-settlements.service` يطالب بالسندات بلا عدّ) وإلغاؤها · إنشاءُ الإيداع النقديّ (`cash-deposits.service` يقيس
 *   رصيدَ الدرج بلا قفل) وإلغاؤه · إلغاءُ العقد (`contracts.service` `cancel`، وفيه ردُّ المقبوض نقداً).
 *
 * ── لا رقمَ مكتوبٌ بيد: الضابطُ يقيس الأثرَ الواحد ──────────────────────────
 *
 * لكلِّ مسار: مستندٌ توأمٌ يُنفَّذ عليه الفعلُ مرّةً فيُقاس أثرُه (عددُ القيود والحركات والسندات)، ثم يُعاد فيُرفض برسالته.
 * ثم مستندٌ ثانٍ يُنفَّذ عليه الفعلُ مرّتين تحت السباق. والحكم: **أثرُ السباق يساوي أثرَ المرّة الواحدة**، **وردُّ الخاسر
 * يساوي ردَّ الإعادة المتتابعة** حالاً ونصّاً. فلا يُفترض شكلُ الأثر ولا رقمُ الرفض.
 *
 * ── والتداخلُ مفروض (`forced-race.ts`) ──────────────────────────────────────
 *
 * القافلُ يقفل صفّاً يكتبه الطلبان **بعد** فحصهما على الشيفرة القائمة: صفُّ المستند نفسِه حيث تكون كتابةُ الحالة في آخر
 * الفعل، وصفُّ السند في إنشاء التسوية (المطالبةُ آخرُ ما تكتب)، وصفُّ حساب الدرج في إنشاء الإيداع (القيدُ بعد قياس الرصيد).
 * واثنان واقفان خلفه شرطُ صحّة القياس: قبل الإصلاح يقف الطلبان بعد فحصهما فيمرّان معاً، وبعده يقف الثاني قبل فحصه.
 *
 * والمتوقَّع على `main` اليوم: الضوابطُ تمرّ، والسباقاتُ تسقط على حكمها لا على شرط القياس. وحيث يمنع قيدٌ في القاعدة الأثرَ
 * المزدوج (عكسُ القيد فريدٌ بـ`reversalOfId`) يسقط السباقُ على ردٍّ بلا اسم لا على أثرٍ مزدوج، وهذا مقيسٌ لا مفترَض.
 */
interface Effect {
  entries: number;
  movements: number;
  payments: number;
}

interface Verdict {
  control: { first: number; againRefused: boolean };
  race: { locked: number; held: string | null; blocked: number; statuses: number[]; refusalMatchesControl: boolean; effectMatchesControl: boolean };
}

/** مستندٌ جديد: معرّفُه، والصفُّ الذي يُقفل له، واسمُه إن كان ردُّ الرفض يحمله (فيُستبدل قبل مقارنة الردَّين). */
interface Doc {
  id: string;
  lock: { table: RaceTable; id: string };
  label?: string;
}

const NO_ADJUSTMENT = WRITEOFF_REASONS.find((r) => r.taxPath === 'NO_ADJUSTMENT')!;

describe('أثرٌ يقع مرّةً واحدة تحت سباقٍ مفروض، الجزءُ الثاني: سبعةُ مسارات (توجيه ٢٧٤ · نظائرُ البندين 18 و27)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let holdClient: PrismaClient;
  let probe: PrismaClient;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const tag = () => `${suffix}-${++seq}`;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  /** أوّلُ الشهر بعد القادم: عقدٌ يبدأ فيه لا قسطَ له حلّ اليوم، ودفعةٌ اليوم على آخر أقساطه مقدَّمةٌ بيقين. */
  const futureStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let race: ReturnType<typeof raceHarness>;

  let branchId: string;
  let warehouseId: string;
  let productId: string;
  let customerId: string;
  let bankId: string;
  let revenueId: string;

  const effect = (): Promise<Effect> =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx: Prisma.TransactionClient) => ({
      entries: await tx.journalEntry.count(),
      movements: await tx.stockMovement.count(),
      payments: await tx.payment.count(),
    }));
  const delta = (a: Effect, b: Effect): Effect => ({ entries: b.entries - a.entries, movements: b.movements - a.movements, payments: b.payments - a.payments });
  const sameEffect = (a: Effect, b: Effect) => a.entries === b.entries && a.movements === b.movements && a.payments === b.payments;
  /** ردُّ الرفض حالاً ونصّاً، واسمُ المستند فيه مستبدَلٌ بعلامة: فردّان على مستندَين مختلفَين يُقارَنان بالرسالة لا بالاسم. */
  const refusal = (r: request.Response, doc: Doc) => {
    const text = JSON.stringify(r.body?.message ?? null);
    return { status: r.status, message: doc.label ? text.split(doc.label).join('◇') : text };
  };

  /**
   * الضابطُ ثم السباق على مسارٍ واحد. `make` يُنشئ مستنداً جديداً، و`act` الفعلُ عليه. ويُعاد معه حالُ رفض الإعادة
   * المتتابعة مقروءاً من الضابط نفسِه، فلا يُكتب رقمُ الرفض بيد.
   */
  async function verdict(make: () => Promise<Doc>, act: (id: string) => request.Test): Promise<{ verdict: Verdict; againStatus: number }> {
    const twin = await make();
    const before = await effect();
    const first = await act(twin.id);
    const once = delta(before, await effect());
    const again = await act(twin.id);

    const target = await make();
    const raceBefore = await effect();
    const result: RaceResult = await race.raceBehindLock(target.lock.table, target.lock.id, () => act(target.id));
    const raced = delta(raceBefore, await effect());
    const statuses = result.responses.map((r) => r.status).sort((x, y) => x - y);
    const loser = result.responses.find((r) => r.status >= 400);
    return {
      againStatus: again.status,
      verdict: {
        control: { first: first.status, againRefused: again.status >= 400 && again.status < 500 },
        race: {
          locked: result.locked,
          held: result.heldWhenFired,
          blocked: result.blocked,
          statuses,
          refusalMatchesControl: loser !== undefined && JSON.stringify(refusal(loser, target)) === JSON.stringify(refusal(again, twin)),
          effectMatchesControl: sameEffect(raced, once),
        },
      },
    };
  }

  /** ما يُنتظر بعد الإصلاح: الفعلُ يمرّ مرّةً، والإعادةُ تُرفض باسمها، والسباقُ مرّةٌ ورفضٌ بالردّ نفسِه وأثرِ المرّة الواحدة. */
  const expected = (okStatus: number, refusedStatus: number): Verdict => ({
    control: { first: okStatus, againRefused: true },
    race: { locked: 1, held: 'held', blocked: 2, statuses: [okStatus, refusedStatus].sort((x, y) => x - y), refusalMatchesControl: true, effectMatchesControl: true },
  });

  /** الحكمُ على مسار: المرّةُ الأولى `201`، وحالُ رفض السباق حالُ رفض الإعادة المتتابعة كما قُرئ. */
  async function judge(make: () => Promise<Doc>, act: (id: string) => request.Test): Promise<void> {
    const { verdict: v, againStatus } = await verdict(make, act);
    expect(v).toEqual(expected(201, againStatus));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'once-part2');
    race = raceHarness(() => company.companyId, holdClient, probe);

    branchId = (await auth(http().post('/branches')).send({ name: `فرع المرّة ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع المرّة ${suffix}` }).expect(201)).body.id;
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف المرّة ${suffix}`, price: 10 }).expect(201)).body.id;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل المرّة ${suffix}` }).expect(201)).body.id;
    bankId = (await auth(http().post('/banks')).send({ name: `بنك المرّة ${suffix}`, kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: today }).expect(201)).body.id;
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    revenueId = accounts.find((a) => a.code === '4100')!.id;
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  // ── المستندات ───────────────────────────────────────────────────────────────

  const writeOff = async () => {
    const id = (
      await auth(http().post('/inventory/write-offs'))
        .send({ productId, warehouseId, branchId, qty: 1, reasonCode: NO_ADJUSTMENT.code, occurredAt: today, note: `تلف ${tag()}` })
        .expect(201)
    ).body.id as string;
    return { id, lock: { table: 'inventory_write_offs' as const, id } };
  };
  const approve = (id: string) => auth(http().post(`/inventory/write-offs/${id}/approve`)).send({});

  const shift = async () => {
    const id = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201)).body.id as string;
    return { id, lock: { table: 'pos_shifts' as const, id } };
  };
  /** المعلَنُ عشرةٌ والمتوقَّعُ صفر: فرقٌ يُرحَّل قيداً فيُرى. */
  const closeShift = (id: string) => auth(http().post(`/pos/shifts/${id}/close`)).send({ declaredClosing: 10 });

  const cardReceipt = async () =>
    (
      await auth(http().post('/payments'))
        .send({ customerId, date: today, amount: 115, method: 'CARD', unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } })
        .expect(201)
    ).body.id as string;
  const receiptToSettle = async () => {
    const id = await cardReceipt();
    return { id, lock: { table: 'payments' as const, id } };
  };
  const settleReceipt = (receiptId: string) =>
    auth(http().post('/banks/network-settlements')).send({ bankId, date: today, periodFrom: today, periodTo: today, receiptIds: [receiptId], feeAmount: 0, feeVatAmount: 0 });
  const settlement = async () => {
    const receipt = await cardReceipt();
    const id = (await settleReceipt(receipt).expect(201)).body.id as string;
    return { id, lock: { table: 'network_settlements' as const, id } };
  };
  const voidSettlement = (id: string) => auth(http().post(`/banks/network-settlements/${id}/void`)).send({});

  /** درجٌ جديدٌ مموَّلٌ بمئةٍ بقيدٍ يدويّ، والقفلُ على حسابه: قيدُ الإيداع يكتبه بعد قياس الرصيد. */
  const fundedDrawer = async (): Promise<Doc> => {
    const name = `درج المرّة ${tag()}`;
    const drawer = (await auth(http().post('/cash-drawers')).send({ name }).expect(201)).body as { id: string; accountId?: string; account?: { id: string } };
    const accountId = drawer.account?.id ?? drawer.accountId!;
    await auth(http().post('/journal'))
      .send({ date: today, memo: `تمويل الدرج ${tag()}`, lines: [{ accountId, debit: 100, credit: 0 }, { accountId: revenueId, debit: 0, credit: 100 }] })
      .expect(201);
    // رسالةُ تجاوز الرصيد تسمّي الدرج، فيُستبدل اسمُه قبل مقارنة ردّ السباق بردّ الإعادة.
    return { id: drawer.id, lock: { table: 'accounts', id: accountId }, label: name };
  };
  /** سبعون من مئة: الواحدُ يمرّ والثاني يتجاوز ما بقي. */
  const deposit = (drawerId: string) => auth(http().post('/banks/cash-deposits')).send({ drawerId, bankId, amount: 70, date: today });
  const depositInTransit = async () => {
    const drawer = await fundedDrawer();
    const id = (await deposit(drawer.id).expect(201)).body.id as string;
    return { id, lock: { table: 'cash_deposits' as const, id } };
  };
  const voidDeposit = (id: string) => auth(http().post(`/banks/cash-deposits/${id}/void`)).send({});

  /** عقدٌ يبدأ بعد شهرين وقسطُه الأخير مقبوضٌ اليوم: فالإلغاءُ اليوم يردّ المقبوضَ نقداً. */
  const paidContract = async () => {
    const t = tag();
    const property = (await auth(http().post('/properties')).send({ name: `عقار المرّة ${t}`, ownership: 'owned' }).expect(201)).body.id as string;
    const unit = (await auth(http().post('/units')).send({ propertyId: property, unitNo: `OP-${t}`, type: 'سكني', rentMonthly: 1000 }).expect(201)).body.id as string;
    const end = new Date(Date.UTC(futureStart.getUTCFullYear() + 1, futureStart.getUTCMonth(), 0));
    const contract = (
      await auth(http().post('/contracts'))
        .send({
          classification: 'RESIDENTIAL',
          vatInclusion: 'EXCLUSIVE',
          unitId: unit,
          customerId: await createTenantCustomer(app, company.token, `مستأجر المرّة ${t}`),
          value: 12000,
          cycle: 'monthly',
          start: iso(futureStart),
          end: iso(end),
        })
        .expect(201)
    ).body as { id: string; installments: { id: string }[] };
    const last = contract.installments[contract.installments.length - 1];
    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ installmentId: last.id, date: today, amount: 1000, method: 'CASH' }).expect(201);
    return { id: contract.id, lock: { table: 'contracts' as const, id: contract.id } };
  };
  const cancel = (id: string) =>
    auth(http().post(`/contracts/${id}/cancel`)).send({ cancelDate: today, cancelReason: `إخلاء ${suffix}`, installmentDisposition: 'cancel', unearnedDisposition: 'refund' });

  // ── المسارات السبعة ──────────────────────────────────────────────────────────

  it('🔴 ① اعتمادُ الشطب مرّةً واحدة: لا تخرج البضاعةُ مرّتين', async () => {
    await judge(writeOff, approve);
  });

  it('🔴 ② إقفالُ المناوبة مرّةً واحدة: لا يُرحَّل فرقُ الدرج مرّتين', async () => {
    await judge(shift, closeShift);
  });

  it('🔴 ③ تسويةُ الشبكة لا تطالب بسندٍ طالبت به أخرى: لا قيدَ تسويةٍ بلا سنداته', async () => {
    await judge(receiptToSettle, settleReceipt);
  });

  it('🔴 ④ إلغاءُ تسوية الشبكة مرّةً واحدة، والخاسرُ يُردّ باسمه', async () => {
    await judge(settlement, voidSettlement);
  });

  it('🔴 ⑤ الإيداعُ النقديّ لا يتجاوز رصيدَ الدرج تحت السباق', async () => {
    await judge(fundedDrawer, deposit);
  });

  it('🔴 ⑥ إلغاءُ الإيداع مرّةً واحدة، والخاسرُ يُردّ باسمه', async () => {
    await judge(depositInTransit, voidDeposit);
  });

  it('🔴 ⑦ إلغاءُ العقد مرّةً واحدة: لا يُردّ المقبوضُ نقداً مرّتين', async () => {
    await judge(paidContract, cancel);
  });
});
