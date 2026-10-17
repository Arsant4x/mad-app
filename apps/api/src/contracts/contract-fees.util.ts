import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { postClaimIssueEntry, postClaimWaiverEntry } from '../journal/auto-posting.util';
import { chargeTaxOn } from '../journal/charge-tax.util';

/**
 * ⚖️ **كنسُ رسوم العقد** (السؤالان ٤٩ و٤١٣ · `ق-١٦٠٠` · `ق-١٦٠٩`/د، بحكم صاحب المشروع: «بنودٌ على العقد تُفوتر مع القسط»).
 *
 * لكلِّ بندٍ ساري: كلُّ قسطٍ حلّ بين سريانه وإنهائه (وحتى `asOf`) ولم يُطالَب عنه بعدُ تُنشأ له **مطالبةٌ خاضعة** نوعُها `FEE`
 * بتاريخ استحقاق القسط — بقيد المطالبة نفسِه (مدين `1200` بالإجمالي · دائن `4300` بالصافي و`2200` بالضريبة) فتدخل الذمّةَ
 * والإقرارَ (`rent.chargesStandard`) وتُحصَّل وتُسقَط كأيّ مطالبة. **والزوجُ (البند · القسط) فريدٌ في القاعدة**، فتشغيلٌ مكرَّر
 * لا يُطالب مرّتين.
 *
 * يُستدعى حيث يُستدعى استحقاقُ الإيجار: عند إنشاء العقد، وعند إضافة بند، وفي الكنس اليوميّ. والمحرّكُ في وحدة العقود لا في
 * الدفتر: الدفترُ نواةٌ لا تعرف العقود (اتجاهُ الاستيراد · §3).
 *
 * ⚠️ **حدودٌ معلَنة**: نقطةُ ضريبة الرسم تاريخُ استحقاق قسطه — ودفعةٌ مقدَّمةٌ عن الرسم قبل موعده لا تُقدّمها (م٢٠ يقدّمها
 * بقدرها؛ والإيجارُ وحدَه يحمل ذلك اليوم) · ولا مستندَ ضريبيّاً يصدر عن المطالبة بعدُ (`ق-٨٩٩`).
 */
export interface FeeSweepResult {
  raised: number;
  /** أقساطٌ حجبت فترةٌ مقفلةٌ مطالبةَ رسومها — تُعدّ ولا توقف الكنس. */
  blockedByPeriodLock: number;
}

export const FEE_KIND_LABEL = 'رسوم خدمة';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ends a contract's fee lines on `lastDay`; a line that only starts after it ends where it starts, so it never charges. */
export async function endFeeLinesWithinTx(tx: Prisma.TransactionClient, contractId: string, lastDay: Date): Promise<void> {
  const fees = await tx.contractFee.findMany({ where: { contractId, OR: [{ endedAt: null }, { endedAt: { gt: lastDay } }] }, select: { id: true, effectiveFrom: true } });
  for (const f of fees) await tx.contractFee.update({ where: { id: f.id }, data: { endedAt: f.effectiveFrom > lastDay ? f.effectiveFrom : lastDay } });
}

/** Waives the open fee claims raised for the given installments, each with its waiver entry dated `date`. Returns how many. */
export async function waiveFeeClaimsWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  contract: { id: string; unitId: string; customerId: string | null; no: string; tenant: string },
  installmentIds: string[],
  date: Date,
  reason: string,
): Promise<number> {
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
      date,
      baseAmount: Number(c.baseAmount),
      kindLabel: FEE_KIND_LABEL,
      treatment: c.taxTreatment,
      baseTax: Number(c.baseTax),
    });
    await tx.contractClaim.update({ where: { id: c.id }, data: { status: 'WAIVED', settledAt: date, waiveReason: reason, settlementEntryId: entry?.id ?? null } });
  }
  return claims.length;
}

export async function raiseDueFeesWithinTx(tx: Prisma.TransactionClient, companyId: string, asOf: Date, contractId?: string): Promise<FeeSweepResult> {
  const result: FeeSweepResult = { raised: 0, blockedByPeriodLock: 0 };
  // A cancelled contract is settled by its cancellation, which raises the fees of what fell due before the cancel date.
  const fees = await tx.contractFee.findMany({
    where: { ...(contractId ? { contractId } : {}), effectiveFrom: { lte: asOf }, contract: { status: { notIn: ['DRAFT', 'CANCELLED'] } } },
    include: {
      contract: { select: { id: true, no: true, tenant: true, unitId: true, customerId: true, currency: true, exchangeRate: true } },
      claims: { select: { installmentId: true } },
    },
  });

  for (const fee of fees) {
    const upTo = fee.endedAt && fee.endedAt < asOf ? fee.endedAt : asOf;
    const raisedFor = new Set(fee.claims.map((c) => c.installmentId));
    const installments = await tx.installment.findMany({
      where: { contractId: fee.contractId, status: { not: 'CANCELLED' }, dueDate: { gte: fee.effectiveFrom, lte: upTo } },
      select: { id: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    });
    for (const i of installments) {
      if (raisedFor.has(i.id)) continue;
      const amount = Number(fee.amount);
      const rate = Number(fee.contract.exchangeRate);
      const taxAmount = chargeTaxOn(amount);
      const baseAmount = toBaseAmount(amount, rate);
      const baseTax = toBaseAmount(taxAmount, rate);
      let journalEntryId: string | null;
      try {
        const entry = await postClaimIssueEntry(tx, companyId, {
          unitId: fee.contract.unitId,
          customerId: fee.contract.customerId,
          contractNo: fee.contract.no,
          tenant: fee.contract.tenant,
          date: i.dueDate,
          baseAmount,
          kindLabel: `${FEE_KIND_LABEL}: ${fee.label}`,
          treatment: 'TAXABLE_SERVICE',
          baseTax,
        });
        journalEntryId = entry?.id ?? null;
      } catch (e) {
        // قفلُ الفترة يُرمى قبل أي كتابة (`assertPeriodOpen`) — فالمعاملةُ صالحةٌ ويُعدّ القسط، كاستحقاق الإيجار.
        if (e instanceof BadRequestException) {
          result.blockedByPeriodLock += 1;
          continue;
        }
        throw e;
      }
      await tx.contractClaim.create({
        data: {
          contractId: fee.contractId,
          kind: 'FEE',
          amount,
          description: `${fee.label} — قسط ${iso(i.dueDate)}`,
          currency: fee.contract.currency,
          exchangeRate: rate,
          baseAmount,
          taxTreatment: 'TAXABLE_SERVICE',
          taxAmount,
          baseTax,
          issuedAt: i.dueDate,
          feeId: fee.id,
          installmentId: i.id,
          journalEntryId,
        } as unknown as Prisma.ContractClaimUncheckedCreateInput,
      });
      result.raised += 1;
    }
  }
  return result;
}
