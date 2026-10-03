import { Prisma } from '@mad-app/db';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { deriveSettlementStatus } from '../common/settlement/settlement.util';
import { postOwnerRentCollectionEntry } from '../journal/auto-posting.util';
import { getOrCreateCustomerPrepaymentsAccount } from '../journal/prepayment-account.util';
import { AccrualContract, tenantCreditOfWithinTx, transferTenantCreditWithinTx, treatmentOf } from '../journal/rent-accrual.util';
import { ownerCollectionSplit, rentAmountsOf, RentTaxTreatment } from '../journal/rent-tax-point.util';

/** ما يحتاجه الخصمُ من العقد — فوق ما يحتاجه الاستحقاق: اسمُ المالك للمؤجّر المالك. */
export type CreditContract = AccrualContract & { ownerName: string | null };

/**
 * ⚖️ **المعاملةُ الضريبية في العقدين واحدة**: الرصيدُ استُحقّت ضريبتُه يومَ القبض بمعاملة الأصل (م٢٠)، فخصمُه من قسطٍ بمعاملةٍ أخرى
 * (تجاريٌّ إلى سكنيّ مثلاً) تعديلٌ في الضريبة لا نقلٌ — لا يُبنى هنا ويبقى الرصيدُ في الأصل (حدٌّ معلَن).
 */
function sameTreatment(a: RentTaxTreatment, b: RentTaxTreatment): boolean {
  return a.classification === b.classification && a.exemptShare === b.exemptShare && a.taxable === b.taxable && a.chargesVat === b.chargesVat && a.managed === b.managed && a.inclusive === b.inclusive;
}

/**
 * ⚖️ **رصيدُ مستأجر عقار التشغيل بمؤجّرٍ هو المالك** (`ق-١٦٣٠`): ما قُبض فوق أقساط العقد كلِّها بلا قسمة (لا حصّةَ ولا عمولة) ناقصاً ما نُقل
 * منه إلى تجديده — بعملة العقد. وما قُبض قبل الحكم قُسم حصّةً وعمولة (`baseCommission` عليه) فليس رصيداً.
 */
async function ownerTenantCreditOf(tx: Prisma.TransactionClient, contractId: string): Promise<number> {
  const [held, moved] = await Promise.all([
    tx.rentPayment.aggregate({ where: { contractId, installmentId: null, baseCommission: null, creditFromContractId: null }, _sum: { netAmount: true } }),
    tx.rentPayment.aggregate({ where: { creditFromContractId: contractId }, _sum: { netAmount: true } }),
  ]);
  return round2(Number(held._sum.netAmount ?? 0) - Number(moved._sum.netAmount ?? 0));
}

/**
 * **رصيدُ المستأجر الباقي في العقد** بعملته — ما تقرؤه نافذةُ التجديد لتقول هل يُخصم (`ق-١٦٣٧`). مصدرُه مصدرُ الخصم نفسُه: صفوفُ
 * الاستحقاق للمنشأة مؤجّرة، ودفعاتُ المالك غيرُ المقسومة لعقار التشغيل.
 */
export async function tenantCreditBalanceWithinTx(tx: Prisma.TransactionClient, contract: Pick<CreditContract, 'id' | 'lessor'>): Promise<number> {
  return contract.lessor === 'OWNER' ? ownerTenantCreditOf(tx, contract.id) : tenantCreditOfWithinTx(tx, contract.id);
}

export interface TenantCreditApplication {
  /** ما خُصم من الرصيد على أقساط التجديد — بعملة العقد. */
  applied: number;
  /** وما بقي رصيداً في العقد الأصل بعده. */
  remaining: number;
  /** سببُ ترك الخصم حين يُترك والرصيدُ قائم. */
  skipped: 'treatment-differs' | 'unclassified' | 'lessor-differs' | 'no-commission-rate' | null;
}

/**
 * ⚖️ **رصيدُ المستأجر يُخصم آلياً من أوّل قسطٍ في التجديد** (توجيه ٢٧٨ · `ق-١٦٢٩`، بحكم صاحب المشروع: «رصيدُ المستأجر يُخصم آلياً من أوّل
 * قسطٍ في التجديد، ويُبنى الآن. والردُّ نقداً يُبنى مع كشف حساب المستأجر.»).
 *
 * يُستدعى في معاملة التجديد بعد إنشاء أقساطه وقبل استحقاق ما حلّ منها. **والخصمُ دفعةٌ على القسط بلا نقد** يحمل صفُّها العقدَ الأصل
 * (`creditFromContractId`): فحالُ القسط وأعمارُ الذمم تقرأ المسدَّدَ منها كما تقرأ القبض، ولا بنكَ ولا حركةَ صندوق. ⚖️ **ويمضي الرصيدُ في
 * الأقساط بترتيب استحقاقها حتى ينفد** (`ق-١٦٣٧` يعدّل «من أوّل قسط»): دفعةٌ لكلِّ قسطٍ بأقلِّ الباقي وإجماليِّه، وما زاد على الأقساط كلِّها
 * يبقى رصيداً في الأصل حتى يُبنى الردّ.
 *   · **المنشأةُ مؤجّرة**: صفّا `CREDIT_TRANSFER` وقيدُ `2450` ⟵ إيرادُ القسط (`transferTenantCreditWithinTx`)، ولا ضريبةَ ثانية.
 *   · **المالكُ مؤجّر** (`ق-١٦٣٠`): الرصيدُ يقابل القسطَ الآن فيُقسم حصّةً وعمولةً وضريبتَها بنسبة العقار لحظةَ الخصم، والمدينُ `2450` لا النقد.
 */
export async function applyTenantCreditOnRenewalWithinTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  source: CreditContract,
  target: CreditContract,
  date: Date,
): Promise<TenantCreditApplication> {
  const sourceTreatment = treatmentOf(source);
  const targetTreatment = treatmentOf(target);
  const ownerSource = source.lessor === 'OWNER';
  const credit = ownerSource ? await ownerTenantCreditOf(tx, source.id) : sourceTreatment ? await tenantCreditOfWithinTx(tx, source.id) : 0;
  const none: TenantCreditApplication = { applied: 0, remaining: credit, skipped: null };
  if (credit <= 0) return none;
  if (!sourceTreatment || !targetTreatment) return { ...none, skipped: 'unclassified' };
  if (ownerSource !== (target.lessor === 'OWNER')) return { ...none, skipped: 'lessor-differs' };
  if (!sameTreatment(sourceTreatment, targetTreatment)) return { ...none, skipped: 'treatment-differs' };

  // ⚖️ أقساطُ التجديد بترتيب استحقاقها، والرصيدُ يمضي فيها حتى ينفد (`ق-١٦٣٧` · «يمضي إلى الأقساط التالية حتى ينفد»).
  const installments = await tx.installment.findMany({
    where: { contractId: target.id, status: { not: 'CANCELLED' } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    select: { id: true, amount: true, serviceStart: true, serviceEnd: true },
  });
  if (installments.length === 0) return none;

  let ownerRate = 0;
  if (ownerSource) {
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: target.unitId }, select: { property: { select: { opRate: true } } } });
    if (unit.property.opRate === null) return { ...none, skipped: 'no-commission-rate' };
    ownerRate = Number(unit.property.opRate);
  }

  // طريقةُ الصفّ طريقةُ القبض الذي أنشأ الرصيد (أحدثُه) — فلا تُوهم الشاشةُ بنقدٍ لم يُقبض اليوم، والصفُّ يحمل أصلَه.
  const origin = await tx.rentPayment.findFirst({ where: { contractId: source.id, installmentId: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], select: { method: true } });
  const rate = Number(target.exchangeRate);
  const prepaymentsAccountId = ownerSource ? await getOrCreateCustomerPrepaymentsAccount(tx, companyId) : null;

  let left = credit;
  for (const installment of installments) {
    if (left <= 0) break;
    const gross = rentAmountsOf(Number(installment.amount), targetTreatment).gross;
    const applied = round2(Math.min(left, gross));
    if (applied <= 0) continue;
    const baseApplied = toBaseAmount(applied, rate);
    const owner = ownerSource ? ownerCollectionSplit(baseApplied, targetTreatment, ownerRate) : null;

    const payment = await tx.rentPayment.create({
      data: {
        contractId: target.id,
        installmentId: installment.id,
        creditFromContractId: source.id,
        date,
        amount: applied,
        discount: 0,
        netAmount: applied,
        method: origin?.method ?? 'CASH',
        notes: `خصمٌ من رصيد المستأجر في العقد ${source.no}`,
        currency: target.currency,
        exchangeRate: rate,
        baseAmount: baseApplied,
        baseDiscount: 0,
        baseNetAmount: baseApplied,
        ...(owner
          ? { commissionRate: ownerRate, baseOwnerVat: owner.ownerVat, baseCommission: owner.commission, baseCommissionTax: owner.commissionTax, baseOwnerShare: owner.ownerShare }
          : {}),
      } as unknown as Prisma.RentPaymentUncheckedCreateInput,
    });

    if (owner && prepaymentsAccountId) {
      const entry = await postOwnerRentCollectionEntry(tx, companyId, {
        customerId: target.customerId,
        unitId: target.unitId,
        contractNo: target.no,
        tenant: target.tenant,
        ownerName: target.ownerName ?? '',
        date,
        baseCash: baseApplied,
        baseOwnerShare: owner.ownerShare,
        baseCommission: owner.commission,
        baseCommissionTax: owner.commissionTax,
        cashAccountId: prepaymentsAccountId,
        memo: `خصمُ رصيد المستأجر من قسط التجديد للمالك ${target.ownerName ?? ''} — عقد ${target.no} من رصيد العقد ${source.no} — ${target.tenant}`,
      });
      if (entry) await tx.rentPayment.update({ where: { id: payment.id }, data: { journalEntryId: entry.id } });
    } else {
      await transferTenantCreditWithinTx(tx, companyId, source, target, targetTreatment, installment, { date, gross: applied, paymentId: payment.id });
      const row = await tx.rentAccrual.findFirst({ where: { paymentId: payment.id, installmentId: installment.id }, select: { journalEntryId: true } });
      if (row?.journalEntryId) await tx.rentPayment.update({ where: { id: payment.id }, data: { journalEntryId: row.journalEntryId } });
    }

    // حالُ القسط من المسدَّد مقابل الإجماليّ — كما يكتبها مسارُ القبض (`ق-١٠٤٠`).
    const derived = deriveSettlementStatus(applied, gross);
    if (derived === 'PAID' || derived === 'PARTIAL') await tx.installment.update({ where: { id: installment.id }, data: { status: derived } });
    left = round2(left - applied);
  }

  return { applied: round2(credit - left), remaining: left, skipped: null };
}
