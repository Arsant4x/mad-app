import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { round2 } from '../src/common/money/rounding';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { BATCH_TX_OPTIONS } from '../src/contracts/rent-recognition.service';
import { OUTPUT_VAT_ACCOUNT } from '../src/journal/auto-posting.util';
import { DEFERRED_REVENUE_ACCOUNT_CODE } from '../src/journal/deferred-revenue-account.util';
import { accrueDueWithinTx } from '../src/journal/rent-accrual.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): لم تُقَس بعد، فلا ثلاثةُ أضعافٍ لمقيس. سقفٌ معلَن من حزمتين تشبهانها
// (installment-partial-settlement 18.3 ث لسبعة اختبارات، و rent-accrual-return 53.6 ث لعشرة) مضروباً في ثلاثة
// ومرفوعاً، ويُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس. ولا مهلةَ صريحةَ على نداءٍ دونه (ق-١٢٩٣).
jest.setTimeout(180000);

/**
 * **إثباتٌ بالتشغيل لعطلين مقيسَين بالقراءة وحدَها في استحقاق ضريبة الإيجار التجاري** (مراجعة ٢٧٤).
 *
 * كلُّ توكيدٍ هنا على **السلوك الصحيح**؛ فإن كان العطلُ قائماً على `main` (`44128d1a`) سقط اختبارُه، والضوابطُ
 * الأربعة في الملف نفسِه تنجح اليوم، فلا يُنسب السقوطُ إلى تهيئةٍ مكسورة. والأرقامُ محسوبةٌ يداً (ق-٧١٥).
 *
 * ## العقدُ في كلّ حالة
 *
 * تجاريٌّ غيرُ شامل على عقارٍ مملوك (`taxable` · `rent-tax-point.util.ts:53-66`)، قيمتُه 12000 بدورةٍ شهرية من أوّل
 * الشهر القادم ⇒ اثنا عشر قسطاً بـ1000 صافياً، والإجماليُّ 1150 (الضريبةُ 150 = 15% · `rentAmountsOf` :80-89).
 * والسكنيُّ في الضابط ④ بالإجماليّ نفسِه 1000 بلا ضريبة.
 *
 * ## (أ) دفعةٌ واحدة عن ثلاثة أقساطٍ لم تحلّ تُضرَّب ضريبتُها
 *
 * دفعةٌ اليوم بـ3450 = 3 × 1150 مربوطةٌ بالقسط الأوّل، ثم الكنسُ بتاريخ اليوم التالي لحلول القسط الثالث.
 *   في الشيفرة اليوم (قراءةً):
 *     عند القبض (`rent-accrual.util.ts:298-307`): PREPAYMENT للقسط الأوّل 1150 (صافٍ 1000 · ضريبة 150)،
 *       وما فاض UNLINKED بـ2300 بلا قسط (صافٍ 2000 · ضريبة 300 = 2300 × 15 / 115).
 *     وعند الكنس (`:241-256`): القسطان الثاني والثالث لا دفعةَ عليهما ولا صفَّ لهما، فيُكتب لكلٍّ DUE بـ1150
 *       وضريبةٍ 150 (`writeAccrual` :124-130 لا يرى الصفَّ غيرَ المربوط).
 *     ⇒ الضريبةُ 150 + 300 + 150 + 150 = 750 · الصافي 5000 · ذمّةُ 1200 = 1150 + 2300 + 1150 + 1150 - 3450 = 2300.
 *   والصحيح: ثلاثةُ أشهرٍ وُرِّدت ⇒ الصافي 3000 · الضريبة 450 (في الصفوف وعلى 2200 وفي الإقرار) ·
 *     وذمّةُ 1200 صفرٌ لمستأجرٍ دفع كلَّ ما حلّ عليه · والنقدُ 3450.
 *   وقبل الكنس تصدق الأرقامُ اليوم (450 · 3000 · 1200 صفر) فيُوكَّد ذلك مجسّاً: السقوطُ من الكنس لا من القبض.
 *
 * ## (ب) إلغاءٌ بعد قبضٍ مقدَّم لقسطٍ كاملٍ لم يحلّ يُبقي ضريبتَه
 *
 * دفعةٌ اليوم بـ1150 تسدّد القسطَ الأوّل كاملاً قبل حلوله، ثم إلغاءٌ بتاريخ اليوم بإسقاط الأقساط وردّ المقبوض.
 *   في الشيفرة اليوم (قراءةً): القسطُ صار `PAID` فلا يدخل عكسَ المُسقَط (`rent-accrual.util.ts:415-416` يقصره على
 *     `DUE`/`LATE`)، والالتزامُ الباقي صافيه 1000 وحدَه يُردّ نقداً (`:476-478` ثم `contracts.service.ts:454-470`)،
 *     وصفُّ PREPAYMENT بضريبته 150 يبقى بلا عكس ⇒ 2200 = +150 · الإقرار +150 · والنقدُ +1150 - 1000 = +150.
 *   والصحيح: التوريدُ لم يقع ⇒ صفرٌ في كلّ شيء: صافي الصفوف وضريبتُها، و2200، والإقرار، و1200، و2400 + 4200،
 *     و4300، والنقدُ (يُردّ الـ1150 كلُّها).
 *
 * ## الضوابطُ (تنجح اليوم)
 *
 *   ① قبضُ قسطٍ واحدٍ كاملٍ قبل حلوله ⇒ صفُّ PREPAYMENT واحد 1150 / 1000 / 150، كالحالة ② في rent-accrual-return.
 *   ② ثم الكنسُ بعد حلول القسط الثاني ⇒ DUE للثاني وحدَه، والأوّلُ لا يُعاد ⇒ ضريبةُ شهرين 300، وذمّةُ الثاني 1150.
 *   ③ قسطٌ استُحقّ بالكنس ولم يُقبض ثم أُلغي العقد بالطلب نفسِه الذي في (ب) ⇒ يُعكس كاملاً: صفرٌ في كلّ شيء.
 *      فالفرقُ الوحيد بين ③ و(ب) أن القسطَ قُبض مقدَّماً.
 *   ④ مرآةُ (ب) على عقدٍ سكنيّ بلا ضريبة ⇒ يُردّ المقبوضُ كلُّه والدفترُ صفر؛ فما يبقى في (ب) هو الضريبةُ بعينها.
 *
 * ⏱️ **والزمنُ يُقدَّم بـ`asOf` لا بساعةٍ مزيَّفة**: الكنسُ اليوميّ نداءٌ لـ`accrueDueWithinTx` بـ`asOf = now`
 * (`rent-accrual.service.ts:31-33`)، فتمريرُه بتاريخٍ بعد حلول القسط هو ما سيفعله الكنسُ يومَها؛ وهو نمطُ
 * `installment-partial-settlement.e2e-spec.ts` ④ بعينه (`accrueDueWithinTx` مقصوراً على العقد، داخل
 * `runInTenantContext`). والدفعاتُ والإلغاءُ مؤرَّخةٌ اليوم (يومُ UTC · ق-١١٩٠) والأقساطُ من أوّل الشهر القادم،
 * فالدفعةُ تسبق الاستحقاقَ بيقين؛ والقبضُ نفسُه يستحقّ بـ`asOf = new Date()` (`contracts.service.ts:620-627`).
 * والكنسُ مقصورٌ على عقد الاختبار، والمنشأةُ معزولةٌ تُزال في الختام، فلا يمسّ اختبارٌ أرقامَ غيره.
 */
interface E2eInstallment {
  id: string;
  dueDate: string;
  amount: string | number;
}
interface ContractBody {
  id: string;
  no: string;
  installments: E2eInstallment[];
}
interface Quarter {
  year: number;
  quarter: number;
}
interface AccrualRow {
  kind: string;
  date: Date;
  installmentId: string | null;
  paymentId: string | null;
  gross: number;
  net: number;
  tax: number;
}
interface Ledger {
  cash: number;
  receivable: number;
  outputVat: number;
  deferred: number;
  rent: number;
  otherIncome: number;
}
interface Declared {
  standard: number;
  standardVat: number;
  exempt: number;
}
interface Snapshot {
  ledger: Ledger;
  declared: Declared;
}

const DAY_MS = 86_400_000;
const MONEY_TEXT = /^-?\d+\.\d{2}$/;

// الأيامُ على هيئة `@db.Date` (UTC) كما يقرؤها الخادم (ق-١١٩٠) · لا من منطقة العملية.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const monthStart = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
const dayAfter = (dueDate: string) => new Date(Date.parse(dueDate) + DAY_MS);
const quarterOf = (d: Date): Quarter => ({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });
const quarterKey = (q: Quarter) => `${q.year}-Q${q.quarter}`;
function distinctQuarters(dates: Date[]): Quarter[] {
  const seen = new Map<string, Quarter>();
  for (const d of dates) seen.set(quarterKey(quarterOf(d)), quarterOf(d));
  return [...seen.values()];
}
const byDue = (c: ContractBody) => [...c.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

/** فرقٌ مدوَّرٌ بالهللة · و`+ 0` يردّ `-0` إلى `0`، فـ`toEqual` يقارن الأعدادَ بـ`Object.is` ولا يُسقط صفراً سالباً. */
const diff = (after: number, before: number) => round2(after - before) + 0;
const sumOf = (rows: AccrualRow[], pick: (r: AccrualRow) => number) => round2(rows.reduce((s, r) => s + pick(r), 0)) + 0;

describe('دفعةُ الإيجار المقدَّمة: الضريبةُ مرّةً واحدة، ولا تبقى بعد إلغاءٍ لم يقع فيه توريد (e2e · مراجعة ٢٧٤)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let tenantPrisma: TenantPrismaService;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  /** الدفترُ بقراءةٍ واحدة لـ`/accounts` (مصفوفةٌ بلا معامل صفحة · `paged.util.ts:103`). */
  async function ledger(): Promise<Ledger> {
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { code: string; balance: string | number }[];
    const of = (code: string) => Number(accounts.find((a) => a.code === code)?.balance ?? 0);
    return {
      cash: of('1000'),
      receivable: of('1200'),
      outputVat: of(OUTPUT_VAT_ACCOUNT),
      deferred: of(DEFERRED_REVENUE_ACCOUNT_CODE),
      rent: of('4200'),
      otherIncome: of('4300'),
    };
  }

  /** قسمُ الإيجار في الإقرار مجموعاً على الأرباع المعطاة · المالُ نصٌّ بخانتين (ق-١٢٣٥) يُثبَت شكلُه ثم يُقرأ رقماً. */
  async function declared(quarters: Quarter[]): Promise<Declared> {
    const out: Declared = { standard: 0, standardVat: 0, exempt: 0 };
    for (const q of quarters) {
      const body = (await auth(http().get('/obligations/vat-declaration')).query(q).expect(200)).body as {
        rent: { standard: string; standardVat: string; exempt: string };
      };
      expect(body.rent.standardVat).toMatch(MONEY_TEXT);
      expect(body.rent.standard).toMatch(MONEY_TEXT);
      out.standard = round2(out.standard + Number(body.rent.standard));
      out.standardVat = round2(out.standardVat + Number(body.rent.standardVat));
      out.exempt = round2(out.exempt + Number(body.rent.exempt));
    }
    return out;
  }

  async function snapshot(quarters: Quarter[]): Promise<Snapshot> {
    return { ledger: await ledger(), declared: await declared(quarters) };
  }

  /** صفوفُ `rent_accruals` للعقد · داخل سياق المنشأة (الجدولُ تحت RLS · نمطُ installment-partial-settlement). */
  async function accrualsOf(contractId: string): Promise<AccrualRow[]> {
    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.rentAccrual.findMany({
        where: { contractId },
        orderBy: { date: 'asc' },
        select: { kind: true, date: true, installmentId: true, paymentId: true, amountGross: true, amountNet: true, amountTax: true },
      }),
    );
    return rows.map((r) => ({
      kind: r.kind,
      date: r.date,
      installmentId: r.installmentId,
      paymentId: r.paymentId,
      gross: Number(r.amountGross),
      net: Number(r.amountNet),
      tax: Number(r.amountTax),
    }));
  }

  /** الأرقامُ التي يُحكم بها: الصفوفُ مجموعةً، والإقرارُ والدفترُ فروقاً عن لقطة ما قبل الفعل. */
  function totals(before: Snapshot, after: Snapshot, rows: AccrualRow[]) {
    return {
      accruedNet: sumOf(rows, (r) => r.net),
      accruedTax: sumOf(rows, (r) => r.tax),
      declaredStandard: diff(after.declared.standard, before.declared.standard),
      declaredStandardVat: diff(after.declared.standardVat, before.declared.standardVat),
      outputVat: diff(after.ledger.outputVat, before.ledger.outputVat),
      receivable: diff(after.ledger.receivable, before.ledger.receivable),
      revenueAndDeferred: diff(after.ledger.deferred + after.ledger.rent, before.ledger.deferred + before.ledger.rent),
      otherIncome: diff(after.ledger.otherIncome, before.ledger.otherIncome),
      cash: diff(after.ledger.cash, before.ledger.cash),
    };
  }

  function printRows(label: string, rows: AccrualRow[], extra = ''): void {
    // السببُ يُطبع قبل التوكيد (نمطُ zatca-stamp.e2e-spec.ts): سقوطٌ بلا صفوفه يُقاس مرّتين.
    const lines = rows.map((r) => `${r.kind} ${iso(r.date)} ${r.installmentId ? 'قسط' : 'بلا قسط'} gross=${r.gross} net=${r.net} tax=${r.tax}`);
    // eslint-disable-next-line no-console
    console.log(`[${label}] rent_accruals:\n  ${lines.join('\n  ')}${extra ? `\n  ${extra}` : ''}`);
  }

  /** عقدٌ سنويٌّ بدورةٍ شهرية من أوّل الشهر القادم: اثنا عشر قسطاً بألف · ولا استحقاقَ عند إنشائه. */
  async function makeContract(classification: 'COMMERCIAL' | 'RESIDENTIAL'): Promise<{ contract: ContractBody; due: E2eInstallment[] }> {
    const tag = `${Date.now()}-${++seq}`;
    const property = (await auth(http().post('/properties')).send({ name: `عقار الدفعة المقدَّمة ${tag}`, ownership: 'owned' }).expect(201)).body as {
      id: string;
    };
    const unit = (
      await auth(http().post('/units'))
        .send({ propertyId: property.id, unitNo: `RA-${tag}`, type: classification === 'COMMERCIAL' ? 'تجاري' : 'سكني', rentMonthly: 1000 })
        .expect(201)
    ).body as { id: string };
    const start = monthStart(1);
    const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 0));
    const contract = (
      await auth(http().post('/contracts'))
        .send({
          classification,
          vatInclusion: 'EXCLUSIVE',
          unitId: unit.id,
          customerId: await createTenantCustomer(app, token, `مستأجر الدفعة المقدَّمة ${tag}`),
          value: 12000,
          cycle: 'monthly',
          start: iso(start),
          end: iso(end),
        })
        .expect(201)
    ).body as ContractBody;

    // مجسٌّ للمجسّ: الجدولُ كما حُسب يداً، وأوّلُه بعد اليوم فلا صفَّ عند الإنشاء والدفعةُ اليوم مقدَّمةٌ بيقين.
    const due = byDue(contract);
    expect(due).toHaveLength(12);
    for (const i of due) expect(Number(i.amount)).toBe(1000);
    expect(due[0].dueDate.slice(0, 10) > iso(today)).toBe(true);
    expect(await accrualsOf(contract.id)).toEqual([]);
    return { contract, due };
  }

  async function pay(contractId: string, installmentId: string, amount: number): Promise<{ id: string }> {
    return (await auth(http().post(`/contracts/${contractId}/payments`)).send({ installmentId, date: iso(today), amount, method: 'CASH' }).expect(201))
      .body as { id: string };
  }

  /** الكنسُ اليوميّ بتاريخ `asOf` مقصوراً على العقد · بخيارات معاملة الكنس نفسِها (`rent-accrual.service.ts:32`). */
  const sweep = (contractId: string, asOf: Date) =>
    tenantPrisma.runInTenantContext(company.companyId, (tx) => accrueDueWithinTx(tx, company.companyId, asOf, contractId), BATCH_TX_OPTIONS);

  /** الطلبُ نفسُه في (ب) والضابطين ③ ④: إلغاءٌ اليوم، والأقساطُ تُسقَط، وما قُبض عن مدّةٍ لن تُقدَّم يُردّ. */
  async function cancelTodayWithRefund(contractId: string): Promise<void> {
    await auth(http().post(`/contracts/${contractId}/cancel`))
      .send({ cancelDate: iso(today), cancelReason: 'إخلاء قبل بدء المدّة', installmentDisposition: 'cancel', unearnedDisposition: 'refund' })
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'rent-advance');
    token = company.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  describe('(أ) دفعةٌ واحدة عن عدّة أقساطٍ لم تحلّ', () => {
    it('ضابط ①: قبضُ قسطٍ واحدٍ كاملٍ قبل حلوله ⇒ صفُّ PREPAYMENT واحد، صافيه 1000 وضريبتُه 150 (كالحالة ② في rent-accrual-return)', async () => {
      const { contract, due } = await makeContract('COMMERCIAL');
      const first = due[0];
      const quarters = [quarterOf(today)];
      const before = await snapshot(quarters);

      const payment = await pay(contract.id, first.id, 1150);
      const rows = await accrualsOf(contract.id);
      const after = await snapshot(quarters);

      expect(rows.map((r) => ({ kind: r.kind, installmentId: r.installmentId, paymentId: r.paymentId, gross: r.gross, net: r.net, tax: r.tax }))).toEqual([
        { kind: 'PREPAYMENT', installmentId: first.id, paymentId: payment.id, gross: 1150, net: 1000, tax: 150 },
      ]);
      expect(iso(rows[0].date)).toBe(iso(today));
      // في ربع القبض: 1150 = 1000 صافياً + 150 ضريبة · والذمّةُ استُحقّت وسُدِّدت في يومها فصفر.
      expect(totals(before, after, rows)).toEqual({
        accruedNet: 1000,
        accruedTax: 150,
        declaredStandard: 1000,
        declaredStandardVat: 150,
        outputVat: 150,
        receivable: 0,
        revenueAndDeferred: 1000,
        otherIncome: 0,
        cash: 1150,
      });
    });

    it('ضابط ②: ثم الكنسُ بعد حلول القسط الثاني يستحقّه وحدَه ولا يعيد الأوّلَ المقبوضَ مقدَّماً ⇒ ضريبةُ شهرين 300', async () => {
      const { contract, due } = await makeContract('COMMERCIAL');
      const [first, second, third] = due;
      const asOf = dayAfter(second.dueDate);
      // الكنسُ بعد حلول الثاني وقبل الثالث: شهران حلّا لا ثلاثة.
      expect(asOf.getTime()).toBeLessThan(Date.parse(third.dueDate));
      const quarters = distinctQuarters([today, new Date(first.dueDate), new Date(second.dueDate)]);
      const before = await snapshot(quarters);

      await pay(contract.id, first.id, 1150);
      const result = await sweep(contract.id, asOf);
      const rows = await accrualsOf(contract.id);
      const after = await snapshot(quarters);

      expect(result).toEqual({ accrued: 1, skippedUnclassified: 0, blockedByPeriodLock: 0 });
      expect(rows.map((r) => ({ kind: r.kind, installmentId: r.installmentId, gross: r.gross, net: r.net, tax: r.tax }))).toEqual([
        { kind: 'PREPAYMENT', installmentId: first.id, gross: 1150, net: 1000, tax: 150 },
        { kind: 'DUE', installmentId: second.id, gross: 1150, net: 1000, tax: 150 },
      ]);
      // شهران: صافٍ 2000 وضريبة 300 · والثاني حلّ ولم يُقبض فذمّتُه 1150 قائمة · والنقدُ ما قُبض للأوّل.
      expect(totals(before, after, rows)).toEqual({
        accruedNet: 2000,
        accruedTax: 300,
        declaredStandard: 2000,
        declaredStandardVat: 300,
        outputVat: 300,
        receivable: 1150,
        revenueAndDeferred: 2000,
        otherIncome: 0,
        cash: 1150,
      });
    });

    it('🔴 (أ) دفعةٌ بثلاثة أقساطٍ مقدَّماً ثم حلولُها ⇒ ضريبةُ ثلاثة أشهرٍ 450 لا أكثر، ولا ذمّةَ على من دفع كلَّ ما حلّ', async () => {
      const { contract, due } = await makeContract('COMMERCIAL');
      const [first, second, third, fourth] = due;
      const asOf = dayAfter(third.dueDate);
      // الكنسُ بعد حلول الثالث وقبل الرابع: ثلاثةُ أشهرٍ حلّت، وكلُّها مدفوعةٌ مقدَّماً.
      expect(asOf.getTime()).toBeLessThan(Date.parse(fourth.dueDate));
      const quarters = distinctQuarters([today, new Date(first.dueDate), new Date(second.dueDate), new Date(third.dueDate)]);
      const before = await snapshot(quarters);

      // 3450 = 3 × 1150، مربوطةً بالقسط الأوّل كما يسجّلها المستخدمُ من بطاقة القسط.
      await pay(contract.id, first.id, 3450);
      const paidRows = await accrualsOf(contract.id);
      const paid = await snapshot(quarters);
      // مجسٌّ: قبل الكنس تصدق الأرقام (150 + 300 = 450 · 1200 صفر) ⇒ ما يسقط بعده يسقط من الكنس لا من القبض.
      expect(totals(before, paid, paidRows)).toEqual({
        accruedNet: 3000,
        accruedTax: 450,
        declaredStandard: 3000,
        declaredStandardVat: 450,
        outputVat: 450,
        receivable: 0,
        revenueAndDeferred: 3000,
        otherIncome: 0,
        cash: 3450,
      });

      const result = await sweep(contract.id, asOf);
      // الكنسُ لم يحجبه قفلُ فترة ولا تصنيف ⇒ ما بعده حكمٌ على المحرّك لا على التهيئة.
      expect(result.blockedByPeriodLock).toBe(0);
      expect(result.skippedUnclassified).toBe(0);
      const rows = await accrualsOf(contract.id);
      const after = await snapshot(quarters);
      printRows('(أ)', rows);

      // مجسٌّ للمجسّ: كلُّ صفٍّ يقع في ربعٍ قُرئ إقرارُه، وإلا كان فرقُ الإقرار أعمى عنه.
      const read = new Set(quarters.map(quarterKey));
      for (const r of rows) expect(read.has(quarterKey(quarterOf(r.date)))).toBe(true);

      // الصحيح: 3 × 1000 صافياً و3 × 150 ضريبةً في الصفوف وعلى 2200 وفي الإقرار · و1200 صفر · والنقدُ 3450.
      // واليومُ قراءةً: 750 ضريبةً · 5000 صافياً · 1200 = 2300 (القسطان الثاني والثالث يُستحقّان ثانيةً).
      expect(totals(before, after, rows)).toEqual({
        accruedNet: 3000,
        accruedTax: 450,
        declaredStandard: 3000,
        declaredStandardVat: 450,
        outputVat: 450,
        receivable: 0,
        revenueAndDeferred: 3000,
        otherIncome: 0,
        cash: 3450,
      });
    });
  });

  describe('(ب) إلغاءُ العقد بعد قبضٍ مقدَّم لقسطٍ كامل لم يحلّ', () => {
    it('ضابط ③: قسطٌ استُحقّ بالكنس ولم يُقبض ثم أُلغي العقدُ بطلب (ب) نفسِه ⇒ يُعكس كاملاً، صفرٌ في كلّ شيء', async () => {
      const { contract, due } = await makeContract('COMMERCIAL');
      const [first, second] = due;
      const asOf = dayAfter(first.dueDate);
      expect(asOf.getTime()).toBeLessThan(Date.parse(second.dueDate));
      const quarters = distinctQuarters([today, new Date(first.dueDate)]);
      const before = await snapshot(quarters);

      expect(await sweep(contract.id, asOf)).toEqual({ accrued: 1, skippedUnclassified: 0, blockedByPeriodLock: 0 });
      // مجسٌّ: قبل الإلغاء شيءٌ يُعكس فعلاً · DUE بـ1150 وضريبةٍ 150 على 2200.
      const accrued = await accrualsOf(contract.id);
      expect(accrued.map((r) => ({ kind: r.kind, installmentId: r.installmentId, gross: r.gross, net: r.net, tax: r.tax }))).toEqual([
        { kind: 'DUE', installmentId: first.id, gross: 1150, net: 1000, tax: 150 },
      ]);
      expect(diff((await ledger()).outputVat, before.ledger.outputVat)).toBe(150);

      await cancelTodayWithRefund(contract.id);
      const rows = await accrualsOf(contract.id);
      const after = await snapshot(quarters);

      // القسطُ `DUE` يدخل عكسَ المُسقَط ⇒ REVERSAL بـ-1150 / -1000 / -150 بتاريخ الإلغاء.
      expect(rows.map((r) => r.kind).sort()).toEqual(['DUE', 'REVERSAL']);
      expect(totals(before, after, rows)).toEqual({
        accruedNet: 0,
        accruedTax: 0,
        declaredStandard: 0,
        declaredStandardVat: 0,
        outputVat: 0,
        receivable: 0,
        revenueAndDeferred: 0,
        otherIncome: 0,
        cash: 0,
      });
    });

    it('ضابط ④: مرآةُ (ب) على عقدٍ سكنيّ بلا ضريبة ⇒ يُردّ المقبوضُ كلُّه والدفترُ صفر', async () => {
      const { contract, due } = await makeContract('RESIDENTIAL');
      const first = due[0];
      const quarters = distinctQuarters([today, new Date(first.dueDate)]);
      const before = await snapshot(quarters);

      // السكنيُّ معفى: الإجماليُّ 1000 هو القسطُ نفسُه.
      await pay(contract.id, first.id, 1000);
      await cancelTodayWithRefund(contract.id);
      const rows = await accrualsOf(contract.id);
      const after = await snapshot(quarters);
      printRows('ضابط ④', rows, `صفُّ المعفى في الإقرار (فرقٌ يُطبع ولا يُوكَّد): ${diff(after.declared.exempt, before.declared.exempt)}`);

      // ⚠️ صافي الصفوف (والمعفى في الإقرار) خارجُ (ب) فيُطبع ولا يُوكَّد هنا · والموكَّدُ مسارُ الردّ والدفتر.
      expect(totals(before, after, rows)).toEqual({
        accruedNet: expect.any(Number),
        accruedTax: 0,
        declaredStandard: 0,
        declaredStandardVat: 0,
        outputVat: 0,
        receivable: 0,
        revenueAndDeferred: 0,
        otherIncome: 0,
        cash: 0,
      });
    });

    it('🔴 (ب) إلغاءٌ بعد قبض قسطٍ تجاريٍّ كامل مقدَّماً ⇒ لا ضريبةَ تبقى على توريدٍ لم يقع، والمقبوضُ يُردّ كلُّه', async () => {
      const { contract, due } = await makeContract('COMMERCIAL');
      const first = due[0];
      const quarters = distinctQuarters([today, new Date(first.dueDate)]);
      const before = await snapshot(quarters);

      await pay(contract.id, first.id, 1150);
      // مجسٌّ: نقطةُ القبض كما في الضابط ① · صفُّ PREPAYMENT بضريبة 150 هو ما يجب أن يُعكس.
      const prepaid = await accrualsOf(contract.id);
      expect(prepaid.map((r) => ({ kind: r.kind, installmentId: r.installmentId, gross: r.gross, net: r.net, tax: r.tax }))).toEqual([
        { kind: 'PREPAYMENT', installmentId: first.id, gross: 1150, net: 1000, tax: 150 },
      ]);

      await cancelTodayWithRefund(contract.id);
      const rows = await accrualsOf(contract.id);
      const after = await snapshot(quarters);
      printRows('(ب)', rows);

      // الصحيح: التوريدُ لم يقع ⇒ صفرٌ في الصفوف و2200 والإقرار والدفتر، والنقدُ يعود كما كان (1150 داخلةً وخارجة).
      // واليومُ قراءةً: ضريبةٌ 150 في الصفوف وعلى 2200 وفي الإقرار، وصافٍ 1000 في الصفوف والإقرار، والنقدُ +150.
      expect(totals(before, after, rows)).toEqual({
        accruedNet: 0,
        accruedTax: 0,
        declaredStandard: 0,
        declaredStandardVat: 0,
        outputVat: 0,
        receivable: 0,
        revenueAndDeferred: 0,
        otherIncome: 0,
        cash: 0,
      });
    });
  });
});
