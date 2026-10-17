import { InstallmentStatus, Prisma, RentAccrualKind } from '@mad-app/db';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { PeriodClosedException } from '../fiscal/period-lock.util';
import {
  postDeferredToOtherIncomeEntry,
  postPartySettlementEntry,
  postRentAccrualEntry,
  postRentAccrualReversalEntry,
  postRentToTenantCreditEntry,
  postTenantCreditTransferEntry,
} from './auto-posting.util';
import {
  exemptNetOf,
  pendingTaxPoints,
  rentAmountsOf,
  rentTaxTreatment,
  RentTaxTreatment,
  sharePercentOf,
  splitGrossAmount,
  taxPointsOfInstallment,
  TaxPoint,
} from './rent-tax-point.util';

/**
 * ⭐ **استحقاقُ الإيجار داخل معاملةٍ قائمة — المحرّكُ الذي يكتب صفَّ الاستحقاق وقيدَه معاً**
 * (`ق-٩١٧` · `ق-٩٢٤` · `ق-٩٢٧`).
 *
 * ## ما يفعله
 *
 * لكلِّ قسطٍ على أساس الاستحقاق (`ACCRUAL`) لعقدٍ مصنَّف: يسأل المحرّكَ النقيَّ
 * (`rent-tax-point.util`) **ما نقاطُ الضريبة التي حلّت حتى `asOf`**، يُنقص منها ما استُحقّ
 * قبلُ، ويكتب لكلِّ نقطةٍ باقية **صفّاً واحداً** في `rent_accruals` **وقيداً واحداً**
 * (`1200` ⇄ `2400`/`4200` + `2200`) — **فالصفُّ هو ما يقرؤه الإقرارُ بتاريخه، والقيدُ هو
 * ما يقرؤه الدفتر، ولا ثالثَ يُفرّقهما** (`ق-٩١٥`).
 *
 * ## بالاستحقاق لا بالنبضة (كـ`recognizeDueWithinTx`)
 *
 * يُستدعى عند إنشاء العقد وتجديده (لما حلّ)، وعند القبض (لما يلزمه)، وبكنسٍ يوميّ، وقبل
 * قراءة الإقرار — **وتشغيلٌ مكرَّر يكتب صفراً**: ما استُحقّ قبلُ يُستهلك من أوّل النقاط.
 *
 * ## حدودُه المعلَنة
 *
 * - **العقدُ غيرُ المصنَّف يُتخطّى ويُعدّ** (`ق-٩١٨`): لا معاملةَ له فلا استحقاق.
 * - **فترةٌ مقفلة تُتخطّى وتُعدّ** لا تُسقط الكنسَ كلَّه: `assertPeriodOpen` يرمي قبل أي كتابة،
 *   فالمعاملةُ تبقى صالحة ويُعدّ القسطُ «محجوباً بقفل الفترة».
 * - **صفٌّ بلا قيد** حين ينقص حسابٌ من الدليل (تخطٍّ صامت كسابقاته) — يُعدّ في الإقرار.
 */

/** ما تحتاجه دوالُّ هذا الملفّ من العقد — يُقرأ مرّةً ويُمرَّر. */
export const ACCRUAL_CONTRACT_SELECT = {
  id: true,
  no: true,
  tenant: true,
  unitId: true,
  customerId: true,
  classification: true,
  vatInclusion: true,
  lessor: true,
  exemptSharePercent: true,
  currency: true,
  exchangeRate: true,
  status: true,
} satisfies Prisma.ContractSelect;

export type AccrualContract = Prisma.ContractGetPayload<{ select: typeof ACCRUAL_CONTRACT_SELECT }>;

const ACCRUAL_INSTALLMENT_SELECT = {
  id: true,
  dueDate: true,
  amount: true,
  serviceStart: true,
  serviceEnd: true,
  status: true,
  accrualBasis: true,
  accrualCompletedAt: true,
  baseAccruedGross: true,
  baseAccruedNet: true,
  baseAccruedTax: true,
  baseRecognized: true,
  accruals: { select: { kind: true, amountGross: true, amountTax: true } },
  payments: { select: { id: true, date: true, amount: true, currency: true, exchangeRate: true } },
} satisfies Prisma.InstallmentSelect;

type AccrualInstallment = Prisma.InstallmentGetPayload<{ select: typeof ACCRUAL_INSTALLMENT_SELECT }>;

/**
 * أنواعُ الصفوف الموجبة — ما «استُحقّ»؛ العكسُ والخصمُ يُنقصان الذمّةَ ولا يُعيدان نقطةً. ونقلُ الرصيد موجبٌ على القسط (سالبُه على
 * الأصل بلا قسطٍ فلا يدخل حسابَ قسط): ضريبتُه تُحسب من ضريبة القسط فلا تُستحقّ ثانيةً عند حلوله (`ق-١٦٢٩`).
 */
const POSITIVE_KINDS: RentAccrualKind[] = ['DUE', 'PREPAYMENT', 'UNLINKED', 'TENANT_CREDIT', 'CREDIT_TRANSFER'];

export function treatmentOf(contract: AccrualContract): RentTaxTreatment | null {
  return rentTaxTreatment(contract.classification, contract.vatInclusion, contract.lessor, sharePercentOf(contract.exemptSharePercent));
}

/** إجماليُّ الدفعة بمقياس عملة العقد — والدفعةُ بعملةٍ أخرى تُترجَم عبر عملة الدفتر. */
function paymentGrossInContractCurrency(p: { amount: Prisma.Decimal; currency: string; exchangeRate: Prisma.Decimal }, contract: AccrualContract): number {
  const amount = Number(p.amount);
  if (p.currency === contract.currency) return round2(amount);
  const contractRate = Number(contract.exchangeRate) || 1;
  return round2(toBaseAmount(amount, Number(p.exchangeRate)) / contractRate);
}

const KIND_LABEL: Record<RentAccrualKind, string> = {
  DUE: 'حلّ الاستحقاق',
  PREPAYMENT: 'دفعةٌ مقدَّمة قبل الاستحقاق — بقدرها',
  UNLINKED: 'دفعةٌ بلا قسطٍ مرتبط — بقدرها',
  REVERSAL: 'عكس',
  DISCOUNT: 'خصم عند القبض',
  TENANT_CREDIT: 'رصيدٌ للمستأجر — ما زاد على أقساط العقد كلِّها',
  CREDIT_TRANSFER: 'خصمُ رصيد المستأجر من قسط التجديد',
};

export interface AccrualSweepResult {
  /** صفوفٌ كُتبت. */
  accrued: number;
  /** أقساطٌ لعقودٍ غيرِ مصنَّفة تُركت. */
  skippedUnclassified: number;
  /** أقساطٌ حالت دون استحقاقها فترةٌ مقفلة. */
  blockedByPeriodLock: number;
}

/**
 * **يكتب صفَّ استحقاقٍ وقيدَه** لنقطةٍ واحدة، ويحدّث تراكمَ القسط.
 *
 * الضريبةُ لنقطة `DUE` هي **باقي ضريبة القسط** بعد ما سبقها — فمجموعُ صفوف القسط يساوي
 * ضريبتَه بالضبط ولا يفترق بهللة تقريب؛ ونقاطُ الدفعات تُقسَم من إجماليّها (`15/115`).
 */
async function writeAccrual(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: AccrualContract,
  treatment: RentTaxTreatment,
  installment: AccrualInstallment | null,
  point: { date: Date; gross: number; kind: RentAccrualKind; paymentId?: string | null },
) {
  let amounts;
  if (point.kind === 'DUE' && installment) {
    const whole = rentAmountsOf(Number(installment.amount), treatment);
    const priorTax = installment.accruals
      .filter((a) => POSITIVE_KINDS.includes(a.kind))
      .reduce((s, a) => s + Number(a.amountTax), 0);
    const tax = round2(Math.max(0, Math.min(point.gross, whole.tax - priorTax)));
    amounts = { gross: round2(point.gross), tax, net: round2(point.gross - tax) };
  } else {
    amounts = splitGrossAmount(point.gross, treatment);
  }
  const rate = Number(contract.exchangeRate);
  const base = { gross: toBaseAmount(amounts.gross, rate), net: toBaseAmount(amounts.net, rate), tax: toBaseAmount(amounts.tax, rate) };
  // تقريبُ الأساس قد يفرّق الإجماليَّ عن الصافي + الضريبة بهللة — فالصافي يُشتقّ منهما.
  base.net = round2(base.gross - base.tax);

  const posting = await postRentAccrualEntry(tx, companyId, {
    customerId: contract.customerId,
    unitId: contract.unitId,
    contractNo: contract.no,
    tenant: contract.tenant,
    date: point.date,
    service: installment?.serviceStart && installment?.serviceEnd ? { start: installment.serviceStart, end: installment.serviceEnd } : null,
    baseGross: base.gross,
    baseNet: base.net,
    baseTax: base.tax,
    kindLabel: KIND_LABEL[point.kind],
    // ⚖️ ق-١٦٢٤: ما زاد على الأقساط كلِّها أصلُه في `2450` لا إيراد.
    tenantCredit: point.kind === 'TENANT_CREDIT',
  });

  const row = await tx.rentAccrual.create({
    data: {
      contractId: contract.id,
      installmentId: installment?.id ?? null,
      paymentId: point.paymentId ?? null,
      kind: point.kind,
      date: point.date,
      classification: treatment.classification,
      taxable: treatment.taxable,
      managed: treatment.managed,
      amountGross: amounts.gross,
      amountNet: amounts.net,
      amountTax: amounts.tax,
      currency: contract.currency,
      exchangeRate: rate,
      baseGross: base.gross,
      baseNet: base.net,
      baseTax: base.tax,
      // ⚖️ المختلط (السؤال ٤١٢): جزؤه المعفى من الصافي على الصفّ نفسِه — فالإقرارُ يقرأ الجزأين مما رُحّل.
      baseExemptNet: exemptNetOf(base.net, treatment),
      journalEntryId: posting.entry?.id ?? null,
    } as unknown as Prisma.RentAccrualUncheckedCreateInput,
  });

  if (installment) {
    await tx.installment.update({
      where: { id: installment.id },
      data: {
        baseAccruedGross: { increment: base.gross },
        baseAccruedNet: { increment: base.net },
        baseAccruedTax: { increment: base.tax },
        // ما اعتُرف به في قيد الاستحقاق نفسِه (ما مضى من الفترة حتى النقطة) — وصفرٌ حين
        // تخطّى الترحيلُ، فلا يُسجَّل اعترافٌ لم يقع (ق-٤٦٨).
        baseRecognized: { increment: posting.earned },
      },
    });
    // الكائنُ الممرَّر يُحدَّث كي تقرأ النقطةُ التالية في الحلقة نفسِها ما سبقها.
    installment.accruals.push({ kind: point.kind, amountGross: new Prisma.Decimal(amounts.gross), amountTax: new Prisma.Decimal(amounts.tax) });
  }
  return row;
}

/** مجموعُ ما استُحقّ موجباً لقسطٍ — بعملة العقد. */
function positiveAccruedGross(i: AccrualInstallment): number {
  return round2(i.accruals.filter((a) => POSITIVE_KINDS.includes(a.kind)).reduce((s, a) => s + Number(a.amountGross), 0));
}

/** نقاطُ قسطٍ الباقيةُ حتى `asOf` — من المحرّك النقيّ بعد استهلاك ما استُحقّ. */
function pendingPointsOf(i: AccrualInstallment, contract: AccrualContract, treatment: RentTaxTreatment, asOf: Date): TaxPoint[] {
  const whole = rentAmountsOf(Number(i.amount), treatment);
  const points = taxPointsOfInstallment({
    gross: whole.gross,
    dueDate: i.dueDate,
    payments: i.payments.map((p) => ({ id: p.id, date: p.date, gross: paymentGrossInContractCurrency(p, contract) })),
    asOf,
  });
  return pendingTaxPoints(points, positiveAccruedGross(i));
}

/**
 * Locks the installment row and reads it again, so two transactions that read it earlier cannot both bill the same tax
 * point. NO KEY UPDATE: rows that only reference the installment (receipts, accrual rows) are not held up by it.
 */
async function lockedInstallment(tx: Prisma.TransactionClient, id: string): Promise<AccrualInstallment> {
  await tx.$queryRaw`SELECT "id" FROM "contract_installments" WHERE "id" = ${id} FOR NO KEY UPDATE`;
  return tx.installment.findUniqueOrThrow({ where: { id }, select: ACCRUAL_INSTALLMENT_SELECT });
}

/**
 * Locks every installment of a contract in due order, the order the sweep takes them in, so a transaction that bills
 * several of them and the sweep never wait on each other.
 */
export async function lockContractInstallmentsWithinTx(tx: Prisma.TransactionClient, contractId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "contract_installments" WHERE "contractId" = ${contractId} ORDER BY "dueDate", "id" FOR NO KEY UPDATE`;
}

/**
 * يكتب النقاطَ الباقيةَ لقسطٍ واحد؛ يعيد عددَ ما كُتب، أو `null` إن حجبته فترةٌ مقفلة.
 * The installment is read under its lock (`lockedInstallment`).
 *
 * **ويختم القسطَ حين لا نقطةَ بعده**: كُتب باقيه عند الاستحقاق، أو غطّت المقدَّماتُ إجماليَّه —
 * فلا يعود الكنسُ يفحصه (`accrualCompletedAt`).
 */
async function accrueInstallment(tx: Prisma.TransactionClient, companyId: string, contract: AccrualContract, treatment: RentTaxTreatment, i: AccrualInstallment, asOf: Date): Promise<number | null> {
  let written = 0;
  let dueWritten = false;
  for (const point of pendingPointsOf(i, contract, treatment, asOf)) {
    try {
      await writeAccrual(tx, companyId, contract, treatment, i, { date: point.date, gross: point.gross, kind: point.kind, paymentId: point.paymentId ?? null });
      written += 1;
      if (point.kind === 'DUE') dueWritten = true;
    } catch (e) {
      // The period lock throws before anything is written, so the transaction stays usable and the instalment is counted.
      if (e instanceof PeriodClosedException) return null;
      throw e;
    }
  }
  const whole = rentAmountsOf(Number(i.amount), treatment);
  if (!i.accrualCompletedAt && (dueWritten || positiveAccruedGross(i) >= round2(whole.gross - 0.005))) {
    await tx.installment.update({ where: { id: i.id }, data: { accrualCompletedAt: new Date() } });
  }
  return written;
}

/**
 * **الكنس**: كلُّ قسطٍ على أساس الاستحقاق حلّ (`dueDate ≤ asOf`) أو قُبضت عليه دفعةٌ، ولم
 * يُستحقّ كلُّه بعد — لمنشأةٍ أو لعقدٍ واحد. الشرطُ الانتقائيّ على التراكم المخزَّن
 * (`baseAccruedGross`) لا على مسحٍ، والحسمُ في JS بالمحرّك.
 */
export async function accrueDueWithinTx(tx: Prisma.TransactionClient, companyId: string, asOf: Date, contractId?: string): Promise<AccrualSweepResult> {
  const result: AccrualSweepResult = { accrued: 0, skippedUnclassified: 0, blockedByPeriodLock: 0 };

  // استعلامٌ واحد: ما لم يُختم (`accrualCompletedAt IS NULL`) وحلّ استحقاقُه أو قُبضت عليه دفعة —
  // لا مسحاً على كل قسط، ولا استعلاماً لكلِّ عقد.
  // ⚖️ وعقدٌ مؤجّرُه المالك خارجُه بالتصميم (السؤال ٥٧٧): إيجارُه أمانةٌ للمالك لا ذمّةٌ ولا إيرادٌ للمنشأة.
  // A cancelled contract is settled by its cancellation, which bills what fell due before the cancel date.
  const installments = await tx.installment.findMany({
    where: {
      accrualBasis: 'ACCRUAL',
      accrualCompletedAt: null,
      status: { not: 'CANCELLED' },
      contract: { status: { notIn: ['DRAFT', 'CANCELLED'] }, lessor: { not: 'OWNER' }, ...(contractId ? { id: contractId } : {}) },
      OR: [{ dueDate: { lte: asOf } }, { payments: { some: {} } }],
    },
    select: { id: true, contract: { select: ACCRUAL_CONTRACT_SELECT } },
    // The lock order of lockContractInstallmentsWithinTx.
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  });

  const treatments = new Map<string, RentTaxTreatment | null>();
  for (const { contract, id } of installments) {
    if (!treatments.has(contract.id)) treatments.set(contract.id, treatmentOf(contract));
    const treatment = treatments.get(contract.id)!;
    if (!treatment) {
      // عقدٌ غيرُ مصنَّف لا يحمل استحقاقاً أصلاً — فكلُّ قسطٍ حلّ له يُعدّ متروكاً.
      result.skippedUnclassified += 1;
      continue;
    }
    // Read again under the lock: a receipt or a cancellation may have billed or closed it since the query above.
    const i = await lockedInstallment(tx, id);
    if (i.accrualCompletedAt || i.status === 'CANCELLED' || i.accrualBasis !== 'ACCRUAL') continue;
    const written = await accrueInstallment(tx, companyId, contract, treatment, i, asOf);
    if (written === null) result.blockedByPeriodLock += 1;
    else result.accrued += written;
  }
  return result;
}

/**
 * **عند القبض** (`ق-٩٢٧/٥`): بعد إنشاء صفّ الدفعة — يُستحقّ ما يلزم القسطَ حتى اليوم
 * (نقطتُه المقدَّمة بقدر الدفعة، أو باقيه إن حلّ)، **وما فاض عن القسط دفعةٌ بلا قسطٍ
 * بقدرها** (م٢٠/٢)؛ والدفعةُ بلا قسطٍ أصلاً تُستحقّ كلُّها بتاريخها.
 *
 * ⚖️ **والجزءُ بلا قسطٍ رصيدٌ للمستأجر لا إيراد** (توجيه ٢٧٧ · `ق-١٦٢٤`): القبضُ يُقسَم على الأقساط المفتوحة كلِّها قبل هذه الدالّة
 * (`spreadRentPayment`)، فما وصلها بلا قسطٍ هو ما زاد على أقساط العقد كلِّها؛ نوعُه `TENANT_CREDIT` وأصلُه في `2450`. و`UNLINKED`
 * (اعترافٌ فوريّ) لما قبل الحكم وحدَه.
 *
 * يعيد `false` إن حجبت فترةٌ مقفلة الاستحقاقَ — فالمستدعي يرفض القبضَ برسالته لا يُسجّله
 * بلا ذمّة.
 */
export async function accrueForPaymentWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: AccrualContract,
  treatment: RentTaxTreatment,
  payment: { id: string; date: Date; grossInContractCurrency: number; installmentId: string | null },
  asOf: Date,
): Promise<boolean> {
  if (!payment.installmentId) {
    await writeAccrual(tx, companyId, contract, treatment, null, { date: payment.date, gross: payment.grossInContractCurrency, kind: 'TENANT_CREDIT', paymentId: payment.id });
    return true;
  }

  const i = await lockedInstallment(tx, payment.installmentId);
  if (i.accrualBasis !== 'ACCRUAL') return true;

  const written = await accrueInstallment(tx, companyId, contract, treatment, i, asOf);
  if (written === null) return false;

  // ما فاض عن إجماليّ القسط من هذه الدفعة — رصيدٌ للمستأجر بقدره (`ق-١٦٢٤`).
  const whole = rentAmountsOf(Number(i.amount), treatment);
  const paidSoFar = round2(i.payments.reduce((s, p) => s + paymentGrossInContractCurrency(p, contract), 0));
  const excess = round2(Math.min(payment.grossInContractCurrency, Math.max(0, paidSoFar - whole.gross)));
  if (excess > 0) {
    await writeAccrual(tx, companyId, contract, treatment, null, { date: payment.date, gross: excess, kind: 'TENANT_CREDIT', paymentId: payment.id });
  }
  return true;
}

/**
 * ⚖️ **رصيدُ المستأجر في العقد الأصل** (`ق-١٦٢٤` · `ق-١٦٢٩`): ما زاد من قبضه على أقساط العقد كلِّها (`TENANT_CREDIT`) ناقصاً ما نُقل منه
 * إلى تجديده (`CREDIT_TRANSFER` السالب) — بعملة العقد، من صفوف الاستحقاق نفسِها لا من عمودٍ ثانٍ يفترق عنها.
 */
export async function tenantCreditOfWithinTx(tx: Prisma.TransactionClient, contractId: string): Promise<number> {
  const agg = await tx.rentAccrual.aggregate({ where: { contractId, kind: { in: ['TENANT_CREDIT', 'CREDIT_TRANSFER'] }, installmentId: null }, _sum: { amountGross: true } });
  return round2(Number(agg._sum.amountGross ?? 0));
}

/**
 * ⚖️ **نقلُ رصيد المستأجر إلى قسطٍ في التجديد** (توجيه ٢٧٨ · `ق-١٦٢٩`): صفّان بتاريخٍ واحد — سالبٌ على العقد الأصل بلا قسط، وموجبٌ على
 * القسط — يتعادلان في الإقرار (الضريبةُ استُحقّت يومَ القبض، م٢٠)، والموجبُ يحمل ضريبتَه فتُطرح من ضريبة القسط عند حلوله؛ وقيدٌ واحد
 * ينقل الصافيَ من `2450` إلى إيراد القسط (`postTenantCreditTransferEntry`)، وتراكمُ القسط يتبعه كما يتبع قيدَ الاستحقاق.
 * والمعاملةُ الضريبية واحدةٌ في العقدين بالشرط (المستدعي يتحقّق)، فتُقسم الضريبةُ بها.
 */
export async function transferTenantCreditWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  source: AccrualContract,
  target: AccrualContract,
  treatment: RentTaxTreatment,
  installment: { id: string; serviceStart: Date | null; serviceEnd: Date | null },
  transfer: { date: Date; gross: number; paymentId: string },
): Promise<void> {
  const amounts = splitGrossAmount(transfer.gross, treatment);
  const rate = Number(target.exchangeRate);
  const base = { gross: toBaseAmount(amounts.gross, rate), net: 0, tax: toBaseAmount(amounts.tax, rate) };
  base.net = round2(base.gross - base.tax);
  const exempt = exemptNetOf(base.net, treatment);

  const posting = await postTenantCreditTransferEntry(tx, companyId, {
    customerId: target.customerId,
    unitId: target.unitId,
    contractNo: target.no,
    sourceContractNo: source.no,
    tenant: target.tenant,
    date: transfer.date,
    service: installment.serviceStart && installment.serviceEnd ? { start: installment.serviceStart, end: installment.serviceEnd } : null,
    baseNet: base.net,
  });

  const row = (contractId: string, installmentId: string | null, sign: 1 | -1) =>
    ({
      contractId,
      installmentId,
      paymentId: transfer.paymentId,
      kind: 'CREDIT_TRANSFER',
      date: transfer.date,
      classification: treatment.classification,
      taxable: treatment.taxable,
      managed: treatment.managed,
      amountGross: sign * amounts.gross,
      amountNet: sign * amounts.net,
      amountTax: sign * amounts.tax,
      currency: target.currency,
      exchangeRate: rate,
      baseGross: sign * base.gross,
      baseNet: sign * base.net,
      baseTax: sign * base.tax,
      baseExemptNet: exempt === null ? null : sign * exempt,
      journalEntryId: posting.entry?.id ?? null,
    }) as unknown as Prisma.RentAccrualUncheckedCreateInput;
  await tx.rentAccrual.create({ data: row(source.id, null, -1) });
  await tx.rentAccrual.create({ data: row(target.id, installment.id, 1) });

  await tx.installment.update({
    where: { id: installment.id },
    data: {
      baseAccruedGross: { increment: base.gross },
      baseAccruedNet: { increment: base.net },
      baseAccruedTax: { increment: base.tax },
      baseRecognized: { increment: posting.earned },
    },
  });
}

/**
 * **تعديلُ مقابلٍ يُنقص الاستحقاق** — للخصم عند القبض ولعكس ما أُسقط عند الإلغاء:
 * صفٌّ سالب وقيدٌ يُنقص `1200` والضريبةَ والصافي (من `2400` ما لم يُعترَف به، ومن `4200`
 * ما اعتُرف)، وتراكمُ القسط يتبعه — **والعدّادُ `baseRecognized` يُنقص بما خرج من `4200`**
 * فيبقى دون الأساس.
 */
export async function reduceAccrualWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: AccrualContract,
  treatment: RentTaxTreatment,
  installment: { id: string; baseAccruedGross: Prisma.Decimal; baseAccruedNet: Prisma.Decimal; baseAccruedTax: Prisma.Decimal; baseRecognized: Prisma.Decimal } | null,
  reduction: { date: Date; gross: number; kind: 'DISCOUNT' | 'REVERSAL'; paymentId?: string | null; reasonLabel: string },
) {
  const gross = round2(reduction.gross);
  if (gross <= 0) return null;

  // القسمةُ بنسبة ما استُحقّ للقسط (أو 15/115 لما لا قسطَ له) — فخصمُ عقدٍ شاملٍ يُنقص
  // ضريبتَه بنسبتها لا بنسبة القسط الكامل.
  let amounts;
  if (installment && Number(installment.baseAccruedGross) > 0) {
    const ratio = Number(installment.baseAccruedTax) / Number(installment.baseAccruedGross);
    const tax = round2(gross * ratio);
    amounts = { gross, tax, net: round2(gross - tax) };
  } else {
    amounts = splitGrossAmount(gross, treatment);
  }
  const rate = Number(contract.exchangeRate);
  const base = { gross: toBaseAmount(amounts.gross, rate), tax: toBaseAmount(amounts.tax, rate), net: 0 };
  base.net = round2(base.gross - base.tax);

  // من الالتزام أوّلاً، ثم من الإيراد المعترَف به.
  const unrecognized = installment ? round2(Math.max(0, Number(installment.baseAccruedNet) - Number(installment.baseRecognized))) : 0;
  const fromDeferred = installment ? round2(Math.min(base.net, unrecognized)) : 0;
  const fromRevenue = round2(base.net - fromDeferred);

  const entry = await postRentAccrualReversalEntry(tx, companyId, {
    customerId: contract.customerId,
    unitId: contract.unitId,
    contractNo: contract.no,
    tenant: contract.tenant,
    date: reduction.date,
    baseGross: base.gross,
    baseNetFromDeferred: fromDeferred,
    baseNetFromRevenue: fromRevenue,
    baseTax: base.tax,
    reasonLabel: reduction.reasonLabel,
  });

  const row = await tx.rentAccrual.create({
    data: {
      contractId: contract.id,
      installmentId: installment?.id ?? null,
      paymentId: reduction.paymentId ?? null,
      kind: reduction.kind,
      date: reduction.date,
      classification: treatment.classification,
      taxable: treatment.taxable,
      managed: treatment.managed,
      amountGross: -amounts.gross,
      amountNet: -amounts.net,
      amountTax: -amounts.tax,
      currency: contract.currency,
      exchangeRate: rate,
      baseGross: -base.gross,
      baseNet: -base.net,
      baseTax: -base.tax,
      baseExemptNet: ((e) => (e === null ? null : -e))(exemptNetOf(base.net, treatment)),
      journalEntryId: entry?.id ?? null,
    } as unknown as Prisma.RentAccrualUncheckedCreateInput,
  });

  if (installment) {
    await tx.installment.update({
      where: { id: installment.id },
      data: {
        baseAccruedGross: { decrement: base.gross },
        baseAccruedNet: { decrement: base.net },
        baseAccruedTax: { decrement: base.tax },
        baseRecognized: { decrement: fromRevenue },
      },
    });
  }
  return row;
}

/**
 * Rent received on an installment for days the contract no longer serves becomes the tenant's credit on the
 * contract: a negative row on the installment and a `TENANT_CREDIT` row without one, the same amounts and the same
 * date, so they cancel in the VAT return (the tax point was the day of receipt and the tax stays with the credit).
 * One entry moves the net from 2400 (and from 4200 for what was already recognized) to 2450. The renewal then
 * draws on that credit through the existing tenant credit path.
 */
export async function carryCollectedToTenantCreditWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: AccrualContract,
  treatment: RentTaxTreatment,
  installment: { id: string; baseAccruedNet: Prisma.Decimal; baseRecognized: Prisma.Decimal },
  carried: { date: Date; gross: number; paymentId: string },
): Promise<void> {
  const amounts = splitGrossAmount(carried.gross, treatment);
  if (amounts.gross <= 0) return;
  const rate = Number(contract.exchangeRate);
  const base = { gross: toBaseAmount(amounts.gross, rate), tax: toBaseAmount(amounts.tax, rate), net: 0 };
  base.net = round2(base.gross - base.tax);
  const unrecognized = round2(Math.max(0, Number(installment.baseAccruedNet) - Number(installment.baseRecognized)));
  const fromDeferred = round2(Math.min(base.net, unrecognized));
  const fromRevenue = round2(base.net - fromDeferred);
  const exempt = exemptNetOf(base.net, treatment);

  const entry = await postRentToTenantCreditEntry(tx, companyId, {
    customerId: contract.customerId,
    unitId: contract.unitId,
    contractNo: contract.no,
    tenant: contract.tenant,
    date: carried.date,
    baseNetFromDeferred: fromDeferred,
    baseNetFromRevenue: fromRevenue,
  });

  const row = (installmentId: string | null, kind: RentAccrualKind, sign: 1 | -1) =>
    ({
      contractId: contract.id,
      installmentId,
      paymentId: carried.paymentId,
      kind,
      date: carried.date,
      classification: treatment.classification,
      taxable: treatment.taxable,
      managed: treatment.managed,
      amountGross: sign * amounts.gross,
      amountNet: sign * amounts.net,
      amountTax: sign * amounts.tax,
      currency: contract.currency,
      exchangeRate: rate,
      baseGross: sign * base.gross,
      baseNet: sign * base.net,
      baseTax: sign * base.tax,
      baseExemptNet: exempt === null ? null : sign * exempt,
      journalEntryId: entry?.id ?? null,
    }) as unknown as Prisma.RentAccrualUncheckedCreateInput;
  await tx.rentAccrual.create({ data: row(installment.id, 'REVERSAL', -1) });
  await tx.rentAccrual.create({ data: row(null, 'TENANT_CREDIT', 1) });

  await tx.installment.update({
    where: { id: installment.id },
    data: {
      baseAccruedGross: { decrement: base.gross },
      baseAccruedNet: { decrement: base.net },
      baseAccruedTax: { decrement: base.tax },
      baseRecognized: { decrement: fromRevenue },
    },
  });
}

/** الخصمُ عند القبض — تعديلُ مقابلٍ يُنقص الذمّةَ والصافيَ والضريبة (`ق-٩٢٧/٦`). */
export async function discountAccrualWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: AccrualContract,
  treatment: RentTaxTreatment,
  installment: { id: string; baseAccruedGross: Prisma.Decimal; baseAccruedNet: Prisma.Decimal; baseAccruedTax: Prisma.Decimal; baseRecognized: Prisma.Decimal } | null,
  discount: { date: Date; gross: number; paymentId: string },
) {
  return reduceAccrualWithinTx(tx, companyId, contract, treatment, installment, { ...discount, kind: 'DISCOUNT', reasonLabel: 'خصم عند القبض' });
}

/** The installments a cancellation cancels: unpaid or partly paid, due on or after the cancel date. */
export const VOIDED_ON_CANCEL: InstallmentStatus[] = ['DUE', 'LATE', 'PARTIAL'];

/**
 * Reverses what a cancellation voids (a credit note's counterpart): the billed part of each installment it cancels that
 * the tenant has not paid. A partly paid installment keeps the billing of what was paid, which follows the chosen
 * destination of rent received for a period not served. Returns how many installments were reversed.
 */
export async function reverseVoidedInstallmentsWithinTx(tx: Prisma.TransactionClient, companyId: string, contract: AccrualContract, cancelDate: Date): Promise<number> {
  const treatment = treatmentOf(contract);
  if (!treatment) return 0;
  const voided = await tx.installment.findMany({
    where: { contractId: contract.id, accrualBasis: 'ACCRUAL', status: { in: VOIDED_ON_CANCEL }, dueDate: { gte: cancelDate }, baseAccruedGross: { gt: 0 } },
    select: {
      id: true,
      baseAccruedGross: true,
      baseAccruedNet: true,
      baseAccruedTax: true,
      baseRecognized: true,
      payments: { select: { netAmount: true, baseNetAmount: true, currency: true } },
    },
  });
  const rate = Number(contract.exchangeRate) || 1;
  let reversed = 0;
  for (const i of voided) {
    const paid = i.payments.reduce((s, p) => s + (p.currency === contract.currency ? Number(p.netAmount) : Number(p.baseNetAmount) / rate), 0);
    const unpaid = round2(Number(i.baseAccruedGross) / rate - paid);
    if (unpaid <= 0) continue;
    await reduceAccrualWithinTx(tx, companyId, contract, treatment, i, {
      date: cancelDate,
      gross: unpaid,
      kind: 'REVERSAL',
      reasonLabel: 'إسقاطُ قسطٍ لم يُقبض عند الإلغاء',
    });
    reversed += 1;
  }
  return reversed;
}

/**
 * What a cancellation that keeps the installments due still owes for them and the rent engine has not billed: for each
 * installment from the cancel date on, the share of its amount not billed yet, in the contract's currency. It is
 * compensation for a period the tenant does not occupy, so the cancellation records it as other income, not rent. A
 * contract that never accrues (unclassified, or leased out by the owner) is not billed here either.
 */
export async function unbilledKeptInstallmentsWithinTx(tx: Prisma.TransactionClient, contract: AccrualContract, cancelDate: Date): Promise<number> {
  const treatment = treatmentOf(contract);
  if (!treatment || contract.lessor === 'OWNER') return 0;
  const kept = await tx.installment.findMany({
    where: { contractId: contract.id, accrualBasis: 'ACCRUAL', accrualCompletedAt: null, status: { in: VOIDED_ON_CANCEL }, dueDate: { gte: cancelDate } },
    select: { amount: true, accruals: { select: { kind: true, amountGross: true } } },
  });
  let total = 0;
  for (const i of kept) {
    const amount = Number(i.amount);
    const gross = rentAmountsOf(amount, treatment).gross;
    if (gross <= 0) continue;
    const billed = i.accruals.filter((a) => POSITIVE_KINDS.includes(a.kind)).reduce((s, a) => s + Number(a.amountGross), 0);
    const unbilled = Math.max(0, gross - billed);
    total = round2(total + round2((amount * unbilled) / gross));
  }
  return total;
}

export interface UnearnedDetail {
  /** الالتزامُ الباقي كلُّه (الأساس − المعترَف به) بعملة الدفتر. */
  total: number;
  /** ما قُبض منه فعلاً — وجهتُه `refund`/`income` كما كانت (`ق-٤٧٢`). */
  collected: number;
  /** وما استُحقّ ولم يُقبض عن مدّةٍ بعد الإلغاء — يتبع الوجهةَ نفسَها (`ق-٩٢٧/٧`). */
  unpaid: number;
  perInstallment: { id: string; unpaidNet: number; baseAccruedGross: Prisma.Decimal; baseAccruedNet: Prisma.Decimal; baseAccruedTax: Prisma.Decimal; baseRecognized: Prisma.Decimal }[];
  /**
   * ⚖️ **المقبوضُ عن مدّةٍ لن تُقدَّم لكلِّ قسطٍ على أساس الاستحقاق** (توجيه ٢٧٥ · `ق-١٥٨٢`): ما يُعكس بإشعارٍ دائنٍ بضريبته
   * حين يُردّ (`refundCollectedUnearnedWithinTx`). والمقبوضُ على أساس القبض (القديم) خارجه، يبقى في `collected` وحدَه.
   */
  collectedPerInstallment: { id: string; collectedNet: number; baseAccruedGross: Prisma.Decimal; baseAccruedNet: Prisma.Decimal; baseAccruedTax: Prisma.Decimal; baseRecognized: Prisma.Decimal }[];
}

/**
 * **تفصيلُ الالتزام الباقي على عقد** — بعد الاعتراف حتى تاريخ الإلغاء وبعد عكس المُسقَط.
 *
 * لقسطٍ على أساس الاستحقاق: الأساسُ ما استُحقّ صافياً؛ والمقبوضُ يسدّد **المكتسَبَ أوّلاً**
 * ثم ما لم يُقدَّم — فالجزءُ المقبوض من الالتزام = `min(الالتزام, المقبوضُ صافياً − المعترَف)`.
 * ولقسطٍ قديم (أساسُ القبض): الالتزامُ كلُّه مقبوضٌ كما كان.
 */
export async function unearnedDetailWithinTx(tx: Prisma.TransactionClient, contractId: string): Promise<UnearnedDetail> {
  const installments = await tx.installment.findMany({
    where: { contractId },
    select: {
      id: true,
      accrualBasis: true,
      baseAccruedGross: true,
      baseAccruedNet: true,
      baseAccruedTax: true,
      baseRecognized: true,
      payments: { select: { baseNetAmount: true } },
    },
  });

  const detail: UnearnedDetail = { total: 0, collected: 0, unpaid: 0, perInstallment: [], collectedPerInstallment: [] };
  for (const i of installments) {
    const collectedCash = round2(i.payments.reduce((s, p) => s + Number(p.baseNetAmount), 0));
    const recognized = Number(i.baseRecognized);
    if (i.accrualBasis !== 'ACCRUAL') {
      const unearned = round2(Math.max(0, collectedCash - recognized));
      detail.total = round2(detail.total + unearned);
      detail.collected = round2(detail.collected + unearned);
      continue;
    }
    const accruedNet = Number(i.baseAccruedNet);
    const accruedGross = Number(i.baseAccruedGross);
    const unearned = round2(Math.max(0, accruedNet - recognized));
    if (unearned <= 0) continue;
    // المقبوضُ بمقياس الصافي: نسبةُ الصافي من الإجماليّ المستحقّ.
    const paidNet = accruedGross > 0 ? round2((collectedCash * accruedNet) / accruedGross) : 0;
    const collectedUnearned = round2(Math.min(unearned, Math.max(0, paidNet - recognized)));
    const unpaidUnearned = round2(unearned - collectedUnearned);
    detail.total = round2(detail.total + unearned);
    detail.collected = round2(detail.collected + collectedUnearned);
    detail.unpaid = round2(detail.unpaid + unpaidUnearned);
    if (collectedUnearned > 0) {
      detail.collectedPerInstallment.push({
        id: i.id,
        collectedNet: collectedUnearned,
        baseAccruedGross: i.baseAccruedGross,
        baseAccruedNet: i.baseAccruedNet,
        baseAccruedTax: i.baseAccruedTax,
        baseRecognized: i.baseRecognized,
      });
    }
    if (unpaidUnearned > 0) {
      detail.perInstallment.push({
        id: i.id,
        unpaidNet: unpaidUnearned,
        baseAccruedGross: i.baseAccruedGross,
        baseAccruedNet: i.baseAccruedNet,
        baseAccruedTax: i.baseAccruedTax,
        baseRecognized: i.baseRecognized,
      });
    }
  }
  return detail;
}

/**
 * **المستحقُّ غيرُ المقبوض عن مدّةٍ بعد الإلغاء — بالوجهة المختارة** (`ق-٩٢٧/٧`):
 * `refund` ⇒ لا يدين به المستأجر فيُعكس (ذمّةٌ وضريبةٌ وصافٍ)؛ `income` ⇒ يبقى ذمّةً عليه
 * ويتحوّل الالتزامُ دخلاً آخر — مرآةُ الوجهتَين على المقبوض.
 */
export async function settleUnpaidUnearnedWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: AccrualContract,
  detail: UnearnedDetail,
  cancelDate: Date,
  disposition: 'refund' | 'income',
): Promise<void> {
  if (detail.unpaid <= 0) return;
  const treatment = treatmentOf(contract);
  if (!treatment) return;
  const rate = Number(contract.exchangeRate) || 1;

  if (disposition === 'income') {
    await postDeferredToOtherIncomeEntry(tx, companyId, {
      customerId: contract.customerId,
      unitId: contract.unitId,
      contractNo: contract.no,
      tenant: contract.tenant,
      date: cancelDate,
      baseAmount: detail.unpaid,
    });
    return;
  }

  for (const i of detail.perInstallment) {
    const net = Number(i.baseAccruedNet);
    const grossBase = net > 0 ? round2((i.unpaidNet * Number(i.baseAccruedGross)) / net) : i.unpaidNet;
    await reduceAccrualWithinTx(tx, companyId, contract, treatment, i, {
      date: cancelDate,
      gross: grossBase / rate,
      kind: 'REVERSAL',
      reasonLabel: 'إسقاطٌ عن مدّةٍ بعد الإلغاء — لا يدين به المستأجر',
    });
  }
}

/**
 * ⚖️ **ردُّ المقبوض عن مدّةٍ لن تُقدَّم: إشعارٌ دائنٌ بضريبته، ثم النقدُ كاملاً** (توجيه ٢٧٥ · `ق-١٥٨٢`، بحكم صاحب المشروع —
 * ج-4 من مراجعة 3.3).
 *
 * كان يُردّ الصافي وحدَه (`2400` ⟵ نقد)، فتبقى ضريبةُ المقبوض على `2200` وفي الإقرار لتوريدٍ لم يقع. فلكلِّ قسطٍ على أساس
 * الاستحقاق قُبض منه شيءٌ عن مدّةٍ لن تُقدَّم: **صفُّ عكسٍ** بصافي المقبوض وضريبته (يقرؤه الإقرارُ بتاريخ الإلغاء، وقيدُه يُنقص
 * `2400` و`2200` مقابل الذمّة — `reduceAccrualWithinTx`)، **ثم يخرج النقدُ للمستأجر بالإجماليّ** مقابل الذمّة نفسِها
 * (`postPartySettlementEntry` بالعكس)، وبسعر يوم الإلغاء لعقدٍ بعملةٍ أجنبية والفرقُ على `5600`.
 *
 * يعيد ما سوّاه من المقبوض **صافياً** بعملة الدفتر — فالمستدعي يُنقصه مما يُقفل بالمسار القائم (`postDeferredSettlementEntry`)،
 * ولا يبقى له إلا المقبوضُ على أساس القبض (القديم: حدٌّ معلَن). ولعقدٍ غيرِ مصنَّف لا شيء.
 */
export async function refundCollectedUnearnedWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: AccrualContract,
  detail: UnearnedDetail,
  cancelDate: Date,
  refundDayRate: number | null,
): Promise<number> {
  const treatment = treatmentOf(contract);
  if (!treatment || detail.collectedPerInstallment.length === 0) return 0;
  const rate = Number(contract.exchangeRate) || 1;

  let settledNet = 0;
  let grossBase = 0;
  let grossInContract = 0;
  for (const i of detail.collectedPerInstallment) {
    const net = Number(i.baseAccruedNet);
    if (net <= 0) continue;
    const partGrossBase = round2((i.collectedNet * Number(i.baseAccruedGross)) / net);
    await reduceAccrualWithinTx(tx, companyId, contract, treatment, i, {
      date: cancelDate,
      gross: partGrossBase / rate,
      kind: 'REVERSAL',
      reasonLabel: 'إشعارٌ دائنٌ عند الإلغاء — ردُّ المقبوض عن مدّةٍ لن تُقدَّم',
    });
    settledNet = round2(settledNet + i.collectedNet);
    grossBase = round2(grossBase + partGrossBase);
    grossInContract = round2(grossInContract + partGrossBase / rate);
  }
  if (grossBase <= 0) return 0;

  // النقدُ يخرج بالإجماليّ مقابل الذمّة (سالبٌ في اتجاه القبض الطبيعيّ): `1200` مدينٌ و`1000` دائن.
  await postPartySettlementEntry(tx, companyId, {
    customerId: contract.customerId,
    side: 'RECEIVABLE',
    date: cancelDate,
    memo: `ردُّ المقبوض مقدَّماً عند الإلغاء — عقد ${contract.no} — ${contract.tenant}`,
    baseCash: -(refundDayRate === null ? grossBase : toBaseAmount(grossInContract, refundDayRate)),
    baseSettled: -grossBase,
    unitId: contract.unitId,
  });
  return settledNet;
}
