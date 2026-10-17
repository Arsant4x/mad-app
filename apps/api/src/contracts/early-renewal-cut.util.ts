import { Prisma } from '@mad-app/db';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { deriveSettlementStatus } from '../common/settlement/settlement.util';
import { postClaimWaiverEntry, postDeferredRecognitionEntry } from '../journal/auto-posting.util';
import {
  ACCRUAL_CONTRACT_SELECT,
  AccrualContract,
  accrueForPaymentWithinTx,
  carryCollectedToTenantCreditWithinTx,
  reduceAccrualWithinTx,
  treatmentOf,
} from '../journal/rent-accrual.util';
import { dayNumber, periodDays, recognitionShareLabel } from '../journal/rent-recognition.util';
import { rentAmountsOf, RentTaxTreatment } from '../journal/rent-tax-point.util';
import { FEE_KIND_LABEL } from './contract-fees.util';

/** What the cut did to the original contract. */
export interface EarlyRenewalCut {
  /** Installments after the cut, cancelled. */
  cancelled: number;
  /** The installment that crosses the cut, shortened to its days up to the cut (zero or one). */
  shortened: number;
  /** Installments on the old collection basis with rent received after the cut, left as they were. */
  keptCollected: number;
  /** Fee claims raised for installments after the cut, waived. */
  waivedFeeClaims: number;
}

const INSTALLMENT_SELECT = {
  id: true,
  dueDate: true,
  amount: true,
  serviceStart: true,
  serviceEnd: true,
  accrualBasis: true,
  baseAccruedGross: true,
  baseRecognized: true,
  payments: {
    select: {
      id: true,
      creditFromContractId: true,
      depositId: true,
      date: true,
      amount: true,
      netAmount: true,
      method: true,
      currency: true,
      exchangeRate: true,
      bankId: true,
      notes: true,
      journalEntryId: true,
    },
    orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
  },
} satisfies Prisma.InstallmentSelect;

type CutInstallment = Prisma.InstallmentGetPayload<{ select: typeof INSTALLMENT_SELECT }>;

const WAIVE_REASON = 'أُسقطت بالتجديد المبكر: قسطُها بعد نهاية العقد';
const REVERSAL_LABEL = 'إسقاطُ ما بعد نهاية العقد بالتجديد المبكر';

interface CutContext {
  tx: Prisma.TransactionClient;
  companyId: string;
  contract: AccrualContract;
  /** Set when the contract accrues: classified and leased out by the company (an owner-leased contract never accrues). */
  treatment: RentTaxTreatment | null;
  cut: Date;
  /** The day the reversals and the credit are dated: the later of the cut and the day the renewal is recorded. */
  postingDate: Date;
}

/**
 * Ends a contract on `cut` because a renewal starts the next day, inside the renewal's transaction.
 *
 * Installments that start after the cut are cancelled whatever their status. What an accruing contract billed for
 * them is undone on `postingDate`: the unpaid part is reversed, and rent already received for them becomes the
 * tenant's credit on this contract, which the renewal then draws on. The installment that crosses the cut keeps its
 * share of days: its amount is shortened (and its service period too while nothing of it was recognized), what it
 * billed beyond the kept share is undone the same way, and the kept share is recognized up to the cut. Fee lines end
 * on the cut and fee claims raised for cancelled installments are waived.
 *
 * Left as they were, as today: rent received on an owner-leased contract (already split into the owner's share and
 * the commission) and rent received on an installment on the old collection basis.
 */
export async function cutContractForEarlyRenewalWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contractId: string,
  cut: Date,
  postingDate: Date,
): Promise<EarlyRenewalCut> {
  const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, select: ACCRUAL_CONTRACT_SELECT });
  const treatment = treatmentOf(contract);
  const ctx: CutContext = { tx, companyId, contract, treatment: treatment && !treatment.managed ? treatment : null, cut, postingDate };
  const result: EarlyRenewalCut = { cancelled: 0, shortened: 0, keptCollected: 0, waivedFeeClaims: 0 };

  const installments = await tx.installment.findMany({
    where: { contractId, status: { not: 'CANCELLED' } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    select: INSTALLMENT_SELECT,
  });
  const cancelledIds: string[] = [];
  for (const i of installments) {
    const start = i.serviceStart ?? i.dueDate;
    const crosses = dayNumber(start) <= dayNumber(cut) && i.serviceEnd !== null && dayNumber(i.serviceEnd) > dayNumber(cut);
    if (dayNumber(start) <= dayNumber(cut) && !crosses) continue;
    if (i.accrualBasis === 'LEGACY_COLLECTED' && i.payments.length > 0) {
      result.keptCollected += 1;
      continue;
    }
    if (crosses) {
      await shortenAcrossCut(ctx, i, start);
      result.shortened += 1;
    } else {
      if (ctx.treatment && i.accrualBasis === 'ACCRUAL') await releaseAccrual(ctx, ctx.treatment, i, 0);
      await tx.installment.update({ where: { id: i.id }, data: { status: 'CANCELLED' } });
      cancelledIds.push(i.id);
      result.cancelled += 1;
    }
  }

  // Fee lines stop at the cut; a line that only starts after it ends where it starts, so it never charges.
  const fees = await tx.contractFee.findMany({ where: { contractId, OR: [{ endedAt: null }, { endedAt: { gt: cut } }] }, select: { id: true, effectiveFrom: true } });
  for (const f of fees) await tx.contractFee.update({ where: { id: f.id }, data: { endedAt: f.effectiveFrom > cut ? f.effectiveFrom : cut } });
  result.waivedFeeClaims = await waiveFeeClaims(ctx, cancelledIds);

  await tx.contract.update({ where: { id: contractId }, data: { end: cut } });
  return result;
}

/** Shortens the installment that crosses the cut to its days up to the cut. */
async function shortenAcrossCut(ctx: CutContext, i: CutInstallment, start: Date): Promise<void> {
  const { tx, contract, cut } = ctx;
  const rate = Number(contract.exchangeRate) || 1;
  const keptDays = dayNumber(cut) - dayNumber(start) + 1;
  const amount = round2((Number(i.amount) * keptDays) / periodDays({ start, end: i.serviceEnd! }));
  // A period that fed a recognition entry is not rewritten; the kept share is recognized up to the cut instead.
  const untouched = Number(i.baseRecognized) === 0;
  await tx.installment.update({
    where: { id: i.id },
    data: { amount, baseAmount: toBaseAmount(amount, rate), ...(untouched ? { serviceEnd: cut } : {}) },
  });

  const treatment = ctx.treatment;
  if (treatment && i.accrualBasis === 'ACCRUAL') {
    await releaseAccrual(ctx, treatment, i, rentAmountsOf(amount, treatment).gross);
    if (!untouched) await recognizeUpToCut(ctx, i.id);
  }

  const paid = await tx.rentPayment.aggregate({ where: { installmentId: i.id }, _sum: { netAmount: true, discount: true } });
  const settled = round2(Number(paid._sum.netAmount ?? 0) + Number(paid._sum.discount ?? 0));
  const contractTreatment = treatmentOf(contract);
  const gross = contractTreatment ? rentAmountsOf(amount, contractTreatment).gross : amount;
  const derived = deriveSettlementStatus(settled, gross);
  if (derived === 'PAID' || derived === 'PARTIAL') await tx.installment.update({ where: { id: i.id }, data: { status: derived } });
}

/**
 * Undoes what an installment holds beyond `keepGross` (in the contract's currency). Rent received beyond it becomes
 * tenant credit: the part already billed is carried over on the posting date, and a receipt not billed yet (its tax
 * point still to be written) is billed as tenant credit on its own date, as an overpayment is. The unpaid rest of the
 * billing is reversed. With `keepGross` zero everything goes.
 */
async function releaseAccrual(ctx: CutContext, treatment: RentTaxTreatment, i: CutInstallment, keepGross: number): Promise<void> {
  const { tx, companyId, contract, postingDate } = ctx;
  const rate = Number(contract.exchangeRate) || 1;
  const billedExcess = round2(Math.max(0, Number(i.baseAccruedGross) / rate - keepGross));
  const paid = round2(i.payments.reduce((s, p) => s + Number(p.netAmount), 0));
  const receivedExcess = round2(Math.max(0, paid - keepGross));
  if (billedExcess <= 0 && receivedExcess <= 0) return;

  // Receipts are billed oldest first, and the moved pieces come newest first: the newest are the ones not billed yet.
  let notBilled = round2(Math.max(0, receivedExcess - billedExcess));
  const carried = round2(receivedExcess - notBilled);
  for (const piece of await movePaymentsToCredit(ctx, i, receivedExcess)) {
    const fresh = await tx.rentPayment.findUniqueOrThrow({ where: { id: piece.paymentId }, select: { date: true } });
    const asNew = round2(Math.min(notBilled, piece.amount));
    if (asNew > 0) {
      await accrueForPaymentWithinTx(tx, companyId, contract, treatment, { id: piece.paymentId, date: fresh.date, grossInContractCurrency: asNew, installmentId: null }, postingDate);
      notBilled = round2(notBilled - asNew);
    }
    const asCarried = round2(piece.amount - asNew);
    if (asCarried > 0) {
      const counters = await tx.installment.findUniqueOrThrow({ where: { id: i.id }, select: { id: true, baseAccruedNet: true, baseRecognized: true } });
      await carryCollectedToTenantCreditWithinTx(tx, companyId, contract, treatment, counters, { date: postingDate, gross: asCarried, paymentId: piece.paymentId });
    }
  }

  const unpaid = round2(billedExcess - carried);
  if (unpaid <= 0) return;
  const fresh = await tx.installment.findUniqueOrThrow({
    where: { id: i.id },
    select: { id: true, baseAccruedGross: true, baseAccruedNet: true, baseAccruedTax: true, baseRecognized: true },
  });
  // The whole remainder when the installment goes, so no cent of its accrual or tax is left behind.
  const gross = keepGross === 0 ? Number(fresh.baseAccruedGross) / rate : unpaid;
  await reduceAccrualWithinTx(tx, companyId, contract, treatment, fresh, { date: postingDate, gross, kind: 'REVERSAL', reasonLabel: REVERSAL_LABEL });
}

/**
 * Moves `amount` of the rent received on an installment off it, newest receipt first, as receipts without an
 * installment (the shape of a tenant credit). A receipt larger than what is left is split in two.
 */
async function movePaymentsToCredit(ctx: CutContext, i: CutInstallment, amount: number): Promise<{ paymentId: string; amount: number }[]> {
  const { tx, contract } = ctx;
  const pieces: { paymentId: string; amount: number }[] = [];
  let left = round2(amount);
  for (const p of i.payments) {
    if (left <= 0) break;
    const net = Number(p.netAmount);
    if (net <= 0) continue;
    const take = round2(Math.min(left, net));
    if (take >= net) {
      await tx.rentPayment.update({ where: { id: p.id }, data: { installmentId: null } });
      pieces.push({ paymentId: p.id, amount: take });
    } else {
      const baseTake = toBaseAmount(take, Number(p.exchangeRate));
      await tx.rentPayment.update({
        where: { id: p.id },
        data: { amount: { decrement: take }, netAmount: { decrement: take }, baseAmount: { decrement: baseTake }, baseNetAmount: { decrement: baseTake } },
      });
      const moved = await tx.rentPayment.create({
        data: {
          contractId: contract.id,
          installmentId: null,
          creditFromContractId: p.creditFromContractId,
          depositId: p.depositId,
          date: p.date,
          amount: take,
          discount: 0,
          netAmount: take,
          method: p.method,
          currency: p.currency,
          exchangeRate: p.exchangeRate,
          baseAmount: baseTake,
          baseDiscount: 0,
          baseNetAmount: baseTake,
          bankId: p.bankId,
          notes: p.notes,
          journalEntryId: p.journalEntryId,
        } as unknown as Prisma.RentPaymentUncheckedCreateInput,
      });
      pieces.push({ paymentId: moved.id, amount: take });
    }
    left = round2(left - take);
  }
  return pieces;
}

/** Recognizes what is left of the kept share of a crossing installment on the cut, the end of its service. */
async function recognizeUpToCut(ctx: CutContext, installmentId: string): Promise<void> {
  const { tx, companyId, contract, cut } = ctx;
  const i = await tx.installment.findUniqueOrThrow({ where: { id: installmentId }, select: { baseAccruedNet: true, baseRecognized: true } });
  const delta = round2(Number(i.baseAccruedNet) - Number(i.baseRecognized));
  if (delta <= 0) return;
  const entry = await postDeferredRecognitionEntry(tx, companyId, {
    unitId: contract.unitId,
    customerId: contract.customerId,
    contractNo: contract.no,
    tenant: contract.tenant,
    date: cut,
    baseAmount: delta,
    periodLabel: recognitionShareLabel(cut, cut),
  });
  if (entry) await tx.installment.update({ where: { id: installmentId }, data: { baseRecognized: i.baseAccruedNet } });
}

/** Waives the open fee claims raised for installments that the cut cancelled, dated on the posting date. */
async function waiveFeeClaims(ctx: CutContext, installmentIds: string[]): Promise<number> {
  const { tx, companyId, contract, postingDate } = ctx;
  if (installmentIds.length === 0) return 0;
  const claims = await tx.contractClaim.findMany({
    where: { contractId: contract.id, feeId: { not: null }, installmentId: { in: installmentIds }, status: 'OPEN' },
    select: { id: true, baseAmount: true, baseTax: true, taxTreatment: true },
  });
  for (const c of claims) {
    const entry = await postClaimWaiverEntry(tx, companyId, {
      unitId: contract.unitId,
      customerId: contract.customerId,
      contractNo: contract.no,
      tenant: contract.tenant,
      date: postingDate,
      baseAmount: Number(c.baseAmount),
      kindLabel: FEE_KIND_LABEL,
      treatment: c.taxTreatment,
      baseTax: Number(c.baseTax),
    });
    await tx.contractClaim.update({
      where: { id: c.id },
      data: { status: 'WAIVED', settledAt: postingDate, waiveReason: WAIVE_REASON, settlementEntryId: entry?.id ?? null },
    });
  }
  return claims.length;
}
