import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { formatMoney, round2 } from '../src/common/money/rounding';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): لم تُقَس بعد. تقديرٌ أوّل: منشأةٌ معزولةٌ وعقدٌ ونحوُ ثلاثين طلباً، وسباقان قد ينتظر
//    كلٌّ منهما حتى عشرين ثانيةً في أسوأ حاله (BLOCK_DEADLINE_MS). تُضبط بثلاثة أضعاف المقيس بعد أوّل تشغيل.
jest.setTimeout(180000);

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
/** مهلةُ معاملة القافل والواقف المعلوم: أطولُ من كلّ انتظارٍ بعدها، فلا تنقضي وهي تمسك القفل. */
const HOLD_TX_MS = 60000;
/** أقصى انتظارٍ لأن يقف الطلبان خلف القفل، ثم يُطلَق على أيّ حال ويحكم التوكيدُ على ما رُئي فعلاً. */
const BLOCK_DEADLINE_MS = 20000;
const POLL_MS = 25;
/** الطلبُ الثاني يبدأ بعد الأوّل بهذا القدر: يرتّب مَن يصل الصفَّ أوّلاً، ولا يتوقّف عليه الحكم. */
const SECOND_STARTS_AFTER_MS = 150;

/**
 * **نقدٌ يخرج مرّةً واحدة**: مراجعةُ الأمن والمحاسبة v3.3، البندان 18 (ردُّ المرتجع مرّتين) و27 (تسويةُ التأمين مرّتين).
 *
 * العلّةُ المدّعاة في الاثنين واحدة: الفحصُ قراءةٌ بلا قفل والكتابةُ بعده، فطلبان متزامنان يقرآن الحالَ نفسَها قبل أن
 * يلتزم أحدُهما ويمرّان معاً.
 *   (18) `PaymentsService.refund`: `refundableOf` مجاميعُ عادية بلا قفلٍ على الفاتورة الأصلية، ثم سندُ الردّ وقيدُه.
 *   (27) `ContractsService.settleDeposit`: `deposit.status === 'SETTLED'` قراءةٌ عادية، ثم القيدُ والخصوم، ثم الحالةُ بلا شرط.
 *
 * ── الأرقامُ بحساب اليد ──────────────────────────────────────────────────────
 *
 *   (18) فاتورةٌ بـ1000 معفاةٌ (بلا ضريبة) مسدَّدةٌ كاملاً، وإشعارٌ دائنٌ بها كلِّها.
 *        القابلُ للردّ = الإشعارات 1000 - الخصمُ من غير المسدَّد 0 (1000 - 1000 = 0 غيرُ مسدَّد) - الردودُ السابقة 0 = 1000.
 *        الردُّ الواحد: الصندوقُ دائن 1000 و1200 مدين 1000، فالمردودُ 1000 ورصيدُ حساب الصندوق ينقص 1000.
 *        وعلى العلّة: ردّان يمرّان، المردودُ 2000 والصندوقُ ينقص 2000.
 *   (27) تأمينٌ بـ5000 تحتجزه المنشأة، وخصمان: تلفٌ 300 وتنظيفٌ 200، وكلاهما إيرادٌ على 4300، فالخصمُ 500.
 *        المردودُ للمستأجر 5000 - 500 = 4500. والقيد: 2300 مدين 5000، و4300 دائن 500، و1000 دائن 4500.
 *        فالأرصدة: 2300 ينقص 5000، و4300 يزيد 500، و1000 ينقص 4500، وسطرُ مدينٍ واحدٌ على 2300، وصفّا خصم.
 *        وعلى العلّة: قيدان، 2300 ينقص 10000، و4300 يزيد 1000، و1000 ينقص 9000، وسطران، وأربعةُ صفوف خصم.
 *
 * ── والتداخلُ مفروضٌ لا متروكٌ للتوقيت (§8.8 الوجه الثالث، ونمطُ `tax-number-races-and-pos.e2e-spec.ts`) ──
 *
 * قافلٌ من اتصالٍ مستقلّ في سياق المنشأة يمسك `FOR UPDATE` صفَّ حسابٍ يكتب فيه الطلبان **بعد** فحصهما: في الردّ حسابُ
 * الصندوق الذي يدينه الردّ (أوّلُ سطرٍ في `postPartySettlementEntry`)، وفي التسوية 2300 (أوّلُ سطرٍ في
 * `postDepositSettlementEntry`). وقيدُ أسطر اليومية يشير إلى الحساب بمفتاحٍ أجنبيّ فيطلب `FOR KEY SHARE` على الصفّ نفسه،
 * فيقف الطلبُ عند إدراج القيد أو عند تحريك الرصيد، وكلاهما بعد الفحص.
 * يُطلَق الطلبُ الأوّل، ثم الثاني بعد 150 ms، **ولا يُطلَق القفلُ حتى يُرى الطلبان كلاهما واقفَين خلفه** (`pg_blocking_pids`،
 * مباشرةً أو خلف واقف) لا بعد نومٍ مقدَّر.
 *   اليوم: يقف الأوّلُ على صفّ الحساب بعد فحصه، ويفحص الثاني والأوّلُ لم يلتزم فيمرّ فحصُه ثم يقف، فيمرّان معاً.
 *   وبعد الإصلاح: يقف الثاني على قفل الفاتورة الأصلية (أو صفّ التأمين) **قبل** فحصه، فيقرأ ما التزمه الأوّل ويُردّ.
 *   وفي الحالين يقف اثنان، فـ`blocked = 2` شرطُ صحّة القياس لا حكمُه.
 *
 * ── والمسباران مُصادَقان بحالتين (ق-١٣٦) ─────────────────────────────────────
 *
 * NOWAIT من اتصالٍ ثالث يُرفض بـ`55P03` والقفلُ قائم ويُقبل بعد إطلاقه (ويرى الصفّ، فلا يُقرأ عمى العزل حرّيةً)؛ وعدُّ
 * الواقفين صفرٌ بلا واقف وواحدٌ مع واقفٍ معلوم. فأخضرُ السباق لا يأتي من قفلٍ لم يقع، ولا من صفٍّ لا يمرّ به الطلب.
 *
 * والمتوقَّع على `main` اليوم: المسباران والضابطان يمرّون، والسباقان يسقطان على توكيد الحكم لا على شرط القياس.
 */
type LockState = 'held' | 'free';

interface Holder {
  ready: Promise<{ pid: number; locked: number }>;
  release: () => void;
  finished: Promise<void>;
}

interface DepositView {
  id: string;
  status: string;
  refundAmount: string | null;
  settlementEntryId: string | null;
  deductions: { kind: string; amount: string }[];
}

interface DepositLedger {
  deposits: number;
  otherIncome: number;
  cash: number;
  settlementLines: number;
}

/** رفضُ NOWAIT بعينه: رمزُ Postgres `55P03` (`lock_not_available`) يحمله خطأُ Prisma في `meta.code` أو في نصّه، لا أيُّ خطأ. */
function lockNotAvailable(e: unknown): boolean {
  const code = (e as { meta?: { code?: unknown } } | null)?.meta?.code;
  const message = e instanceof Error ? e.message : String(e);
  return String(code ?? '') === '55P03' || message.includes('55P03');
}

describe('نقدٌ يخرج مرّةً واحدة: ردُّ المرتجع وتسويةُ التأمين تحت سباقٍ مفروض (مراجعة v3.3، البندان 18 و27)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  /** عميلُ القافل وحدَه: مجمّعُه غيرُ مجمّع التطبيق الذي يحمل الطلبين، فلا يأخذ القافلُ اتصالاً يحتاجانه. */
  let holdClient: PrismaClient;
  /** عميلُ المسابير (NOWAIT، والواقفُ المعلوم، وعدُّ الواقفين): مجمّعٌ ثالث، فالعدُّ لا ينتظر اتصالاً يحبسه القفل. */
  let probe: PrismaClient;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let customerId: string;
  let branchId: string;
  let cashBoxId: string;
  let boxAccountId: string;
  let contractId: string;
  const acc = { deposits: '', otherIncome: '', cash: '' };

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);
  const arabic = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);

  const accountIdOf = async (code: string): Promise<string> => {
    const row = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.account.findFirst({ where: { code }, select: { id: true } }));
    if (!row) throw new Error(`الحسابُ ${code} غائبٌ عن دليل المنشأة المعزولة`);
    return row.id;
  };

  const accountBalance = async (accountId: string): Promise<number> => {
    const row = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.account.findFirst({ where: { id: accountId }, select: { balance: true } }));
    if (!row) throw new Error(`الحسابُ ${accountId} لا يُقرأ في سياق المنشأة`);
    return Number(row.balance);
  };

  // ── القفلُ ومسباراه ─────────────────────────────────────────────────────────

  /**
   * قافلٌ في سياق المنشأة على عميله المستقلّ: يقفل صفَّ الحساب ويمسكه حتى يُطلَق، ويُعيد معرّفَ عمليته ليُعدّ مَن يقف
   * خلفه، وعددَ ما قفل. **فصفرٌ يعني أن العزل أعماه** (قراءةٌ بلا سياق تعود فارغةً بنجاح) لا أن القفل وقع.
   */
  function holdAccountRow(accountId: string): Holder {
    let release: () => void = () => undefined;
    const released = new Promise<void>((done) => {
      release = () => done();
    });
    let taken: (v: { pid: number; locked: number }) => void = () => undefined;
    let failed: (e: unknown) => void = () => undefined;
    const ready = new Promise<{ pid: number; locked: number }>((ok, ko) => {
      taken = ok;
      failed = ko;
    });
    const finished = holdClient.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "accounts" WHERE "id" = ${accountId} FOR UPDATE`;
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        taken({ pid, locked: rows.length });
        await released;
      },
      { timeout: HOLD_TX_MS, maxWait: HOLD_TX_MS },
    );
    void finished.catch(failed);
    return { ready, release: () => release(), finished };
  }

  /** يُطلق القافلَ وينتظر انتهاءَ معاملته في كلّ حال: فلا يبقى قفلٌ معلّقٌ بعد الاختبار ولو سقط ما قبله. */
  async function releaseHolder(holder: Holder): Promise<void> {
    holder.release();
    await Promise.allSettled([holder.finished]);
  }

  /** كم عمليةً تقف خلف القافل، مباشرةً أو خلف واقفٍ خلفه (الثاني في الطابور يقف خلف الأوّل). منسوخٌ من سباقات الترقيم. */
  async function waitersBehind(holderPid: number): Promise<number> {
    const [{ n }] = await probe.$queryRaw<{ n: number }[]>`
      WITH RECURSIVE waiting(pid) AS (
        SELECT a.pid FROM pg_stat_activity a WHERE ${holderPid}::int = ANY(pg_blocking_pids(a.pid))
        UNION
        SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid))
      )
      SELECT count(*)::int AS n FROM waiting`;
    return n;
  }

  async function waitUntilBlocked(holderPid: number, expected: number): Promise<number> {
    const deadline = Date.now() + BLOCK_DEADLINE_MS;
    let blocked = await waitersBehind(holderPid);
    while (blocked < expected && Date.now() < deadline) {
      await sleep(POLL_MS);
      blocked = await waitersBehind(holderPid);
    }
    return blocked;
  }

  /**
   * حالُ قفل الصفّ من اتصالٍ ثالث: `FOR UPDATE NOWAIT` يُرفض بـ`55P03` ما دام مقفولاً. **والحرُّ لا يُعلَن إلا وقد رُئي الصفّ**:
   * صفٌّ يحجبه العزلُ يعود فارغاً بلا رفض، فلو قُرئ ذلك حرّيةً لشهد المسبارُ بالحرّية على أيّ قفل.
   */
  async function rowLockState(accountId: string): Promise<LockState> {
    try {
      const rows = await probe.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
        return tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "accounts" WHERE "id" = ${accountId} FOR UPDATE NOWAIT`;
      });
      if (rows.length !== 1) throw new Error(`مسبارُ NOWAIT لم يرَ صفَّ الحساب ${accountId} (${rows.length} صفّ)`);
      return 'free';
    } catch (e) {
      if (lockNotAvailable(e)) return 'held';
      throw e;
    }
  }

  /**
   * يقفل صفَّ الحساب، ويتحقّق أن القفل قائمٌ لحظةَ الإطلاق، ويُطلق الطلبَ الأوّل ثم الثاني بعد `SECOND_STARTS_AFTER_MS`،
   * وينتظر أن يقف الاثنان خلف القفل، ثم يُطلقه، ويُعيد ما رُئي. (`.then` يرسل الطلبَ فوراً: `supertest` لا يرسل حتى يُنتظَر.)
   */
  async function raceBehindLock(accountId: string, fire: () => request.Test) {
    const holder = holdAccountRow(accountId);
    const inflight: Promise<request.Response>[] = [];
    let locked = 0;
    let heldWhenFired: LockState | null = null;
    let blocked = 0;
    try {
      const ready = await holder.ready;
      locked = ready.locked;
      heldWhenFired = await rowLockState(accountId);
      inflight.push(fire().then((r) => r));
      await sleep(SECOND_STARTS_AFTER_MS);
      inflight.push(fire().then((r) => r));
      blocked = await waitUntilBlocked(ready.pid, 2);
    } finally {
      // يُطلَق القفلُ في كلّ حال: عطلٌ في العدّ أو في توكيدٍ لا يحبس القافلَ حتى مهلته.
      await releaseHolder(holder);
    }
    await holder.finished;
    const responses = await Promise.all(inflight);
    return { locked, heldWhenFired, blocked, responses };
  }

  // ── الردّ (منسوخٌ من `refund-fx-difference.e2e-spec.ts` بعملة الأساس) ────────────────

  /** فاتورةٌ ببندٍ واحد معفى: إجماليُّها مبلغُها ولا ضريبةَ تُربك الحساب. */
  const makeInvoice = async (total: number) => {
    const res = await auth(http().post('/invoices'))
      .send({
        customerId,
        branchId,
        issueDate: today(),
        dueDate: today(),
        lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
    return res.body as { id: string; no: string };
  };

  /** فاتورةٌ مسدَّدةٌ كاملاً ثم إشعارٌ دائنٌ بمبلغها كلِّه: فالقابلُ للردّ مبلغُها كلُّه. */
  const paidInvoiceWithCreditNote = async (total: number) => {
    const invoice = await makeInvoice(total);
    await auth(http().post('/payments'))
      .send({ customerId, branchId, date: today(), amount: total, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: invoice.id, amount: total }] })
      .expect(201);
    const note = await auth(http().post(`/invoices/${invoice.id}/credit-note`))
      .send({
        issueDate: today(),
        reason: `إرجاع ${suffix}`,
        lines: [{ description: `إشعار ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
    return note.body as { id: string; no: string };
  };

  const refundBody = (creditNoteId: string) => ({ creditNoteId, date: today(), method: 'CASH', bankId: cashBoxId, amount: 1000 });

  /** سنداتُ الردّ على الإشعار من الدفتر لا من الردّ: عددُها ومجموعُها موجباً (تُخزَّن سالبة). */
  const refundsOf = (noteId: string) =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx) => {
      const sum = await tx.payment.aggregate({ where: { kind: 'REFUND', refundsInvoiceId: noteId }, _sum: { amount: true }, _count: { _all: true } });
      return { count: sum._count._all, total: round2(-Number(sum._sum.amount ?? 0)) };
    });

  // ── التأمين (منسوخٌ من `contract-deposits.e2e-spec.ts` و`contract-cashbox-payment.e2e-spec.ts`) ─────

  const SETTLEMENT = {
    settledAt: '2025-12-31',
    deductions: [
      { kind: 'DAMAGE', amount: 300, reason: `كسر باب المطبخ ${suffix}` },
      { kind: 'CLEANING', amount: 200, reason: `تنظيف الوحدة ${suffix}` },
    ],
  };

  const contractDeposits = async (): Promise<DepositView[]> =>
    ((await auth(http().get(`/contracts/${contractId}`)).expect(200)).body as { deposits: DepositView[] }).deposits;

  const depositView = async (depositId: string): Promise<DepositView> => {
    const found = (await contractDeposits()).find((d) => d.id === depositId);
    if (!found) throw new Error(`التأمين ${depositId} غائبٌ عن عقده`);
    return found;
  };

  /** تأمينٌ تتسلّمه المنشأة (`holder` افتراضاً `COMPANY`): يُرحَّل 1000 مدين و2300 دائن، ويُعاد معرّفُه الجديد. */
  const recordHeldDeposit = async (amount: number): Promise<string> => {
    const known = new Set((await contractDeposits()).map((d) => d.id));
    const res = await auth(http().post(`/contracts/${contractId}/deposits`)).send({ type: 'RENT', amount, receivedAt: '2025-01-05' }).expect(201);
    const fresh = (res.body.deposits as DepositView[]).filter((d) => !known.has(d.id));
    expect(fresh).toHaveLength(1);
    expect(fresh[0].status).toBe('HELD');
    return fresh[0].id;
  };

  const settle = (depositId: string) => auth(http().post(`/contracts/${contractId}/deposits/${depositId}/settle`)).send(SETTLEMENT);

  /** أرصدةُ الحسابات الثلاثة التي تمسّها التسوية، وعددُ أسطر المدين على 2300 (لا يدين 2300 إلا قيدُ تسوية). */
  const depositLedger = (): Promise<DepositLedger> =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx) => {
      const rows = await tx.account.findMany({ where: { id: { in: [acc.deposits, acc.otherIncome, acc.cash] } }, select: { id: true, balance: true } });
      const of = (id: string) => Number(rows.find((r) => r.id === id)?.balance ?? Number.NaN);
      const settlementLines = await tx.journalLine.count({ where: { accountId: acc.deposits, debit: { gt: 0 } } });
      return { deposits: of(acc.deposits), otherIncome: of(acc.otherIncome), cash: of(acc.cash), settlementLines };
    });

  const ledgerDelta = (before: DepositLedger, after: DepositLedger): DepositLedger => ({
    deposits: round2(after.deposits - before.deposits),
    otherIncome: round2(after.otherIncome - before.otherIncome),
    cash: round2(after.cash - before.cash),
    settlementLines: after.settlementLines - before.settlementLines,
  });

  /**
   * تسويةٌ واحدة بحساب اليد: 2300 ينقص 5000، و4300 يزيد 473.91 (الضررُ 300 وصافي النظافة 173.91)، و1000 ينقص 4500 (5000 - 500)،
   * وسطرٌ واحد. ⚖️ والنظافةُ خاضعةٌ من مبلغها الإجماليّ (السؤال ٤١٤ · ق-١٦٠٠): 200 × 15 ÷ 115 = 26.09 على 2200 لا على 4300.
   */
  const SETTLED_ONCE: DepositLedger = { deposits: -5000, otherIncome: 473.91, cash: -4500, settlementLines: 1 };

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

    company = await registerIsolatedCompany(app, 'once-cash-out');
    token = company.token;

    // الردّ: عميلٌ وفرعٌ وصندوقُ فرعٍ يخرج منه النقد، وحسابُ الصندوق الذي يدينه الردّ.
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الردّ مرّةً ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع الردّ ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(http().post('/banks')).send({ name: `صندوق الردّ ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: today(), branchId }).expect(201)).body.id;
    const banks = (await auth(http().get('/banks')).expect(200)).body as { id: string; accountId: string }[];
    boxAccountId = banks.find((b) => b.id === cashBoxId)?.accountId ?? '';
    expect(boxAccountId).toBeTruthy();

    // التأمين: عقارٌ ووحدةٌ وعقدٌ على المنشأة المعزولة، وحساباتُ التسوية الثلاثة من دليلها الافتراضي.
    const property = await auth(http().post('/properties')).send({ name: `عقار التأمين ${suffix}`, ownership: 'owned' }).expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `ONCE-${suffix}`, type: 'سكني', rentMonthly: 1000 }).expect(201);
    contractId = (
      await auth(http().post('/contracts'))
        .send({
          classification: 'RESIDENTIAL',
          vatInclusion: 'EXCLUSIVE',
          unitId: unit.body.id,
          customerId: await createTenantCustomer(app, token, `مستأجر التأمين ${suffix}`),
          value: 12000,
          cycle: 'monthly',
          start: '2025-01-01',
          end: '2025-12-31',
        })
        .expect(201)
    ).body.id;
    acc.deposits = await accountIdOf('2300');
    acc.otherIncome = await accountIdOf('4300');
    acc.cash = await accountIdOf('1000');
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('المسباران مُصادَقان بحالتين: NOWAIT يُرفض بـ55P03 والقافلُ يمسك ويُقبل بعد إطلاقه، وعدُّ الواقفين صفرٌ بلا واقفٍ وواحدٌ مع واقفٍ معلوم', async () => {
    const holder = holdAccountRow(boxAccountId);
    let waiter: Promise<{ id: string }[]> | null = null;
    let pid = 0;
    try {
      const ready = await holder.ready;
      pid = ready.pid;
      // القافلُ رأى الصفَّ في سياق المنشأة وأمسكه: واحدٌ لا صفرٌ صامتٌ تحت العزل.
      expect(ready.locked).toBe(1);
      // الحالةُ التي يجب ألّا تُصاب: لا أحدَ يقف خلفه بعد.
      expect(await waitersBehind(pid)).toBe(0);
      // والتي يجب أن تُصاب: NOWAIT من اتصالٍ ثالث يُرفض والقفلُ قائم.
      expect(await rowLockState(boxAccountId)).toBe('held');
      // واقفٌ معلوم: FOR UPDATE بلا NOWAIT من اتصالٍ آخر يقف خلف القافل، فيُعدّ واحداً.
      waiter = probe.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
          return tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "accounts" WHERE "id" = ${boxAccountId} FOR UPDATE`;
        },
        { timeout: HOLD_TX_MS, maxWait: HOLD_TX_MS },
      );
      expect(await waitUntilBlocked(pid, 1)).toBe(1);
    } finally {
      await releaseHolder(holder);
      if (waiter) await Promise.allSettled([waiter]);
    }
    await holder.finished;
    // الواقفُ أخذ الصفَّ بعد الإطلاق، والقفلُ زال: NOWAIT يُقبل ويرى الصفّ، ولا واقفَ خلف القافل.
    expect(await waiter).toHaveLength(1);
    expect(await rowLockState(boxAccountId)).toBe('free');
    expect(await waitersBehind(pid)).toBe(0);
  });

  it('ضابطٌ: ردٌّ واحدٌ على إشعارٍ بـ1000 يخرج بمبلغه، والثاني بعده متتابعاً يُردّ 400', async () => {
    const note = await paidInvoiceWithCreditNote(1000);
    const boxBefore = await accountBalance(boxAccountId);

    const first = await auth(http().post('/payments/refund')).send(refundBody(note.id)).expect(201);
    // السندُ مخزَّنٌ سالباً: -1000.
    expect(Number(first.body.amount)).toBe(-1000);
    // الصندوقُ دائن 1000: رصيدُ حسابه ينقص 1000.
    expect(round2((await accountBalance(boxAccountId)) - boxBefore)).toBe(-1000);

    // القابلُ للردّ بعده: 1000 - 0 - 1000 = 0، فالثاني يُردّ ولا يمسّ شيئاً.
    const again = await auth(http().post('/payments/refund')).send(refundBody(note.id));
    expect(again.status).toBe(400);
    expect(again.body.message).toBe(arabic(MSG.refund_nothing_refundable));
    expect(await refundsOf(note.id)).toEqual({ count: 1, total: 1000 });
    expect(round2((await accountBalance(boxAccountId)) - boxBefore)).toBe(-1000);
  });

  it('بند 18: ردّان متزامنان على إشعارٍ بـ1000 خلف قفلٍ مفروض: يمرّ واحدٌ ويُردّ الآخرُ 400، والمردودُ 1000 لا 2000', async () => {
    const note = await paidInvoiceWithCreditNote(1000);
    const boxBefore = await accountBalance(boxAccountId);

    const race = await raceBehindLock(boxAccountId, () => auth(http().post('/payments/refund')).send(refundBody(note.id)));
    // شرطُ القياس (يصحّ اليوم وبعد الإصلاح): القافلُ أمسك صفَّ الصندوق، وNOWAIT رُفض والطلبان يُطلقان، ووقف الاثنان خلفه.
    expect(race.locked).toBe(1);
    expect(race.heldWhenFired).toBe('held');
    expect(race.blocked).toBe(2);

    // ⭐ الحكم: ردٌّ واحدٌ بـ1000 والصندوقُ ينقص 1000. وعلى العلّة: [201, 201]، وسندان، و2000، و-2000.
    const refunds = await refundsOf(note.id);
    expect({
      statuses: race.responses.map((r) => r.status).sort((a, b) => a - b),
      refundCount: refunds.count,
      refundedTotal: refunds.total,
      boxDelta: round2((await accountBalance(boxAccountId)) - boxBefore),
    }).toEqual({ statuses: [201, 400], refundCount: 1, refundedTotal: 1000, boxDelta: -1000 });

    // والخاسرُ يُردّ بما يُردّ به الثاني المتتابع (القابلُ صفر)، أو برسالة التجاوز على قابلٍ صفر.
    const lost = race.responses.find((r) => r.status === 400);
    expect([
      arabic(MSG.refund_nothing_refundable),
      arabic(formatMessage(MSG.refund_exceeds_refundable, { refundable: formatMoney(0), amount: formatMoney(1000) })),
    ]).toContain(lost?.body.message);
  });

  it('ضابطٌ: تسويةٌ واحدةٌ لتأمينٍ بـ5000 بخصمين 300 و200 تقيّد أرقامها، والثانيةُ بعدها متتابعةً تُردّ 409', async () => {
    const depositId = await recordHeldDeposit(5000);
    const before = await depositLedger();

    const first = await settle(depositId).expect(201);
    const settled = (first.body.deposits as DepositView[]).find((d) => d.id === depositId);
    expect(settled?.status).toBe('SETTLED');
    // المردود: 5000 - (300 + 200) = 4500.
    expect(Number(settled?.refundAmount)).toBe(4500);
    expect(settled?.deductions).toHaveLength(2);
    expect(settled?.settlementEntryId).toBeTruthy();
    expect(ledgerDelta(before, await depositLedger())).toEqual(SETTLED_ONCE);

    const again = await settle(depositId);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe(arabic(MSG.deposit_already_settled));
    // الرفضُ لا يمسّ الدفترَ ولا الخصوم.
    expect(ledgerDelta(before, await depositLedger())).toEqual(SETTLED_ONCE);
    expect((await depositView(depositId)).deductions).toHaveLength(2);
  });

  it('بند 27: تسويتان متزامنتان لتأمينٍ بـ5000 خلف قفلٍ مفروض: تمرّ واحدةٌ وتُردّ الأخرى 409، وقيدُ تسويةٍ واحد وصفّا خصمٍ لا أربعة', async () => {
    const depositId = await recordHeldDeposit(5000);
    const before = await depositLedger();

    const race = await raceBehindLock(acc.deposits, () => settle(depositId));
    // شرطُ القياس: القافلُ أمسك صفَّ 2300، وNOWAIT رُفض والطلبان يُطلقان، ووقف الاثنان خلفه.
    expect(race.locked).toBe(1);
    expect(race.heldWhenFired).toBe('held');
    expect(race.blocked).toBe(2);

    // ⭐ الحكم: تسويةٌ واحدة بأرقامها. وعلى العلّة: [201, 201]، و2300 ينقص 10000، و4300 يزيد 1000، و1000 ينقص 9000،
    //    وسطران على 2300، وأربعةُ صفوف خصم.
    const view = await depositView(depositId);
    expect({
      statuses: race.responses.map((r) => r.status).sort((a, b) => a - b),
      ledger: ledgerDelta(before, await depositLedger()),
      deductions: view.deductions.length,
      status: view.status,
      refundAmount: Number(view.refundAmount),
    }).toEqual({ statuses: [201, 409], ledger: SETTLED_ONCE, deductions: 2, status: 'SETTLED', refundAmount: 4500 });

    const lost = race.responses.find((r) => r.status === 409);
    expect(lost?.body.message).toBe(arabic(MSG.deposit_already_settled));
  });
});
