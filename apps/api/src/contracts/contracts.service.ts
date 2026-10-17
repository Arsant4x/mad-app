import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ClaimKind, Contract, DeductionKind, DepositType, InstallmentStatus, Prisma, Property, Unit } from '@mad-app/db';
import { assertBranchAllowed } from '../branches/branch-scope.util';
import { companyToday } from '../common/company-day.util';
import { documentYear } from '../common/document-year.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { IdempotentReplay, type KeyedRequest, onceForKey, onceForRequest, recordKeyedRequest } from '../common/idempotency/idempotency';
import { companyBaseCurrency, resolveCurrencyWithin, resolveFollowingCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import {
  postClaimIssueEntry,
  postKeyMoneyEntry,
  postClaimPaymentEntry,
  postClaimWaiverEntry,
  postContractSettlementEntry,
  postDeferredSettlementEntry,
  postDepositReceiptEntry,
  postDepositSettlementEntry,
  postOwnerRentCollectionEntry,
  postPartySettlementEntry,
  postRentPaymentEntry,
} from '../journal/auto-posting.util';
import {
  ACCRUAL_CONTRACT_SELECT,
  type AccrualContract,
  accrueDueWithinTx,
  accrueForPaymentWithinTx,
  discountAccrualWithinTx,
  lockContractInstallmentsWithinTx,
  refundCollectedUnearnedWithinTx,
  reverseVoidedInstallmentsWithinTx,
  settleUnpaidUnearnedWithinTx,
  treatmentOf,
  unbilledKeptInstallmentsWithinTx,
  unearnedDetailWithinTx,
  VOIDED_ON_CANCEL,
} from '../journal/rent-accrual.util';
import { closeDeferredWithinTx, recognizeDueWithinTx } from './rent-recognition.service';
import { activeReservationForUnit, expireStaleReservations, lockUnitForBooking } from '../reservations/reservations.service';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { CreateClaimDto, PayClaimDto, WaiveClaimDto } from './dto/claim.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { ContractFeeDto, EndContractFeeDto } from './dto/contract-fee.dto';
import { ContractFeeResponse, CreatedContractFeeResponse } from './dto/contract-fee-responses.dto';
import { raiseDueFeesWithinTx } from './contract-fees.util';
import { applyTenantCreditOnRenewalWithinTx, tenantCreditBalanceWithinTx } from './tenant-credit.util';
import { cutContractForEarlyRenewalWithinTx } from './early-renewal-cut.util';
import { TenantContext } from '../auth/types';
import { PermissionsService } from '../delegations/permissions.service';
import { grant } from '../delegations/permission-tree';
import { ListContractsQueryDto } from './dto/list-contracts-query.dto';
import { CreateHandoverDto, HandoverItemDto, SignHandoverDto, UpdateHandoverDto } from './dto/handover.dto';
import { RecordKeyMoneyDto } from './dto/key-money.dto';
import { RecordDepositDto, SettleDepositDto } from './dto/deposit.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { generateInstallmentSchedule } from './installment-schedule.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { deriveSettlementStatus } from '../common/settlement/settlement.util';
import {
  ownerCollectionSplit,
  rentAmountsOf,
  rentTaxTreatment,
  sharePercentOf,
  type RentClassification,
  type RentLessor,
  type RentTaxTreatment,
  type RentVatInclusion,
} from '../journal/rent-tax-point.util';
import { money } from '../common/money/text';
import { chargeTaxIn, chargeTaxOn } from '../journal/charge-tax.util';
import { FilesService } from '../files/files.service';
import { RETENTION_YEARS } from '../companies/company-movement.service';
import { round2, formatMoney } from '../common/money/rounding';
import { moneyEquals, sumMoney } from '../common/money/allocation';
import { contractTenantIdData, decryptContractTenantId, publicContract } from './contract-tenant-id.util';
import { randomUUID } from 'node:crypto';

/** مهلةُ معاملةٍ تستحقّ جدولاً كاملاً (الإنشاءُ والتجديد) — لا الافتراضُ الخمس ثوانٍ. */
const ACCRUAL_TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

/**
 * ⚖️ **أجزاءُ قبضٍ على قسط** (توجيه ٢٧٥ · `ق-١٥٨٢`، ووسّعه `ق-١٦٠٢`/④ في توجيه ٢٧٦): القسطُ المقصودُ بباقيه، ثم **أقدمُ أقساط
 * العقد المفتوحة استحقاقاً** بباقي كلٍّ، سابقةً للمقصود كانت أو لاحقة (بحكم صاحب المشروع: «وزائدُ الإيجار يُوزَّع على الأقدم
 * استحقاقاً داخل العقد نفسِه»؛ وكان: ما يلي المقصودَ وحدَه)، وما فاض عنها كلِّها جزءٌ بلا قسط (دفعةٌ مقدَّمة بقدرها كما كانت، م٢٠/٢).
 * وحدُّه العقدُ نفسُه لا عقودُ المستأجر الأخرى.
 *
 * و«الباقي» إجماليُّ القسط بالضريبة (`rentAmountsOf`) ناقصاً ما سُدّد له (الصافي + الخصم) — المقياسُ الذي تُشتقّ به حالُه.
 * والأقساطُ على أساس الاستحقاق وحدَه وغيرُ الملغاة؛ وقسطٌ لم يبقَ له شيء لا يُكتب له جزء.
 *
 * ⚖️ **والدفعةُ الحرّة** (بلا قسطٍ مسمّى): تسدّد الحالَّ من الأقدم (توجيه ٢٧٦ · ٢و، القاعدة ٣٧: كانت جزءاً واحداً «بلا قسط» على عقدٍ له
 * أقساطٌ حالّة، فتُستحقّ ضريبتُها فوق ضريبة الأقساط ويبقى الأقدمُ متأخّراً على مستأجرٍ دفع) **ثم القادمَ بترتيب استحقاقه** (توجيه ٢٧٧ · ٢ب
 * · `ق-١٦١٤`، بحكم صاحب المشروع: «ما زاد على الحالّ يذهب إلى القسط القادم، فيُوزَّع إيرادُه على شهره»؛ وكان الزائدُ دفعةً مقدَّمة بلا قسط
 * تُعترف فوراً). فترتيبُها ترتيبُ الزائد نفسُه، **وما زاد على الأقساط كلِّها وحدَه** بلا قسطٍ يُعترف فوراً بحدّه المعلَن (`ق-٤٧٣`).
 */
async function spreadRentPayment(
  tx: Prisma.TransactionClient,
  contractId: string,
  treatment: RentTaxTreatment,
  installment: { id: string; dueDate: Date } | null,
  amount: number,
): Promise<{ installmentId: string | null; amount: number }[]> {
  const candidates = await openRentInstallments(tx, contractId, treatment);
  const ordered = installment ? [...candidates.filter((c) => c.id === installment.id), ...candidates.filter((c) => c.id !== installment.id)] : candidates;
  let left = round2(amount);
  const parts: { installmentId: string | null; amount: number }[] = [];
  for (const c of ordered) {
    if (left <= 0) break;
    if (c.remaining <= 0) continue;
    const take = round2(Math.min(left, c.remaining));
    parts.push({ installmentId: c.id, amount: take });
    left = round2(left - take);
  }
  if (left > 0) parts.push({ installmentId: null, amount: left });
  return parts;
}

/**
 * A contract's open accrual installments, oldest due first, each with what is still owed on it in the contract currency
 * (gross with VAT less net plus discount paid). `dueBy` keeps those due on or before that day.
 */
async function openRentInstallments(
  tx: Prisma.TransactionClient,
  contractId: string,
  treatment: RentTaxTreatment,
  dueBy?: Date,
): Promise<{ id: string; remaining: number }[]> {
  const rows = await tx.installment.findMany({
    where: { contractId, status: { not: 'CANCELLED' }, accrualBasis: 'ACCRUAL', ...(dueBy ? { dueDate: { lte: dueBy } } : {}) },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    select: { id: true, amount: true, payments: { select: { netAmount: true, discount: true } } },
  });
  return rows.map((c) => {
    const settled = round2(c.payments.reduce((s, p) => s + Number(p.netAmount) + Number(p.discount), 0));
    return { id: c.id, remaining: round2(rentAmountsOf(Number(c.amount), treatment).gross - settled) };
  });
}

/**
 * An installment's status derived from what was paid on it against its gross (its amount when unclassified), like an
 * invoice's; when nothing is paid it keeps its due or late status, which follows the date.
 */
async function settledInstallmentStatus(
  tx: Prisma.TransactionClient,
  target: { id: string; amount: Prisma.Decimal; status: InstallmentStatus },
  treatment: RentTaxTreatment | null,
): Promise<InstallmentStatus> {
  const paid = await tx.rentPayment.aggregate({ where: { installmentId: target.id }, _sum: { netAmount: true, discount: true } });
  const settled = round2(Number(paid._sum.netAmount ?? 0) + Number(paid._sum.discount ?? 0));
  const gross = treatment ? rentAmountsOf(Number(target.amount), treatment).gross : round2(Number(target.amount));
  const derived = deriveSettlementStatus(settled, gross);
  return derived === 'PAID' ? 'PAID' : derived === 'PARTIAL' ? 'PARTIAL' : target.status;
}

/** The rent part of an unpaid rent deduction from a deposit, worked out before anything is written. */
interface UnpaidRentPlan {
  contract: AccrualContract;
  treatment: RentTaxTreatment | null;
  /** What goes to the rent installments, in the contract currency; the rest covers claims or the cancellation settlement. */
  toRent: number;
  cancelled: boolean;
}

/** بندُ الرسم كما يُردّ (`ق-١٤٣٨`): المالُ نصٌّ بخانتين، والأيامُ `YYYY-MM-DD`. */
function presentFee(fee: { id: string; contractId: string; label: string; amount: Prisma.Decimal; effectiveFrom: Date; endedAt: Date | null }): ContractFeeResponse {
  return {
    id: fee.id,
    contractId: fee.contractId,
    label: fee.label,
    amount: money(fee.amount),
    effectiveFrom: fee.effectiveFrom.toISOString().slice(0, 10),
    endedAt: fee.endedAt ? fee.endedAt.toISOString().slice(0, 10) : null,
  };
}

const CONTRACT_INCLUDE = {
  unit: { include: { property: true } },
  // بطاقةُ العميل — مصدرُ الحقيقة لاسم المستأجر وهاتفه (`ق-١٠٢٨`/①⑥)؛ الحقلان على العقد ذاكرةٌ مشتقّة.
  customer: { select: { id: true, name: true, phone: true, archived: true } },
  installments: { orderBy: { dueDate: 'asc' as const } },
  payments: { orderBy: { date: 'desc' as const } },
  deposits: { include: { deductions: true }, orderBy: { receivedAt: 'asc' as const } },
  settlementLines: { orderBy: { createdAt: 'asc' as const } },
  claims: { orderBy: { issuedAt: 'desc' as const } },
  // ⚖️ بنودُ الرسوم (السؤالان ٤٩ و٤١٣ · ق-١٦٠٠).
  fees: { orderBy: { createdAt: 'asc' as const } },
  keyMoney: { orderBy: { paidAt: 'asc' as const } },
  // photos عبر select صريح: fileKey مفتاح تخزين داخلي لا يغادر الخادم —
  // التنزيل عبر رابط موقَّع فقط (اكتشاف المراجعة).
  handovers: {
    include: {
      items: { orderBy: { createdAt: 'asc' as const } },
      photos: { select: { id: true, handoverId: true, itemId: true, filename: true, size: true, mimeType: true, note: true, uploadedAt: true } },
    },
    orderBy: { date: 'asc' as const },
  },
};

/**
 * **العميلُ مصدرُ الحقيقة لاسم المستأجر وهاتفه** (`ق-١٠٢٨`/①⑥): الحقلان على العقد ذاكرةٌ مشتقّةٌ تُكتب
 * عند الربط وتُحدَّث في معاملة تعديل العميل — وعند القراءة يُقدَّم ما في بطاقته، فيُصحَّح ما افترق
 * قبل هذا البناء بالاشتقاق لا بهجرةٍ تكتبه. عقدٌ بلا عميل (مسوّدةٌ قديمة) يُقرأ كما كُتب.
 */
function withPartyFromCustomer<T extends { tenant: string; phone: string | null; customer?: { name: string; phone: string | null } | null }>(contract: T): T {
  if (!contract.customer) return contract;
  return { ...contract, tenant: contract.customer.name, phone: contract.customer.phone };
}

/** Arabic labels for the ledger memo — permanent record, so not translated at
 * read time. Same reasoning as DEPOSIT_TYPE_LABEL below. */
const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  MAINTENANCE: 'صيانة',
  UTILITIES: 'فواتير خدمات',
  LATE_FEE: 'غرامة تأخير',
  DAMAGE: 'أضرار',
  OTHER: 'أخرى',
  FEE: 'رسوم خدمة',
};

/** Arabic labels for the journal memo. Kept here rather than in the message
 * catalog: a posted entry's memo is a permanent ledger record, so it must not
 * change when a *reader* switches language. */
const DEPOSIT_TYPE_LABEL: Record<DepositType, string> = {
  RENT: 'تأمين إيجار',
  FACILITY: 'تأمين منشأة',
};

/** Unpaid rent settles a receivable that was already recognized as revenue;
 * everything else is income the landlord keeps. This split is the whole reason
 * a deduction carries a kind rather than just an amount. */
function deductionTarget(kind: DeductionKind): 'receivable' | 'income' {
  return kind === 'UNPAID_RENT' ? 'receivable' : 'income';
}

type ChargeTreatment = 'TAXABLE_SERVICE' | 'ON_BEHALF' | 'COMPENSATION';

/** النيابةُ تُثبَت: ما يثبت شروطَها مكتوبٌ معها، وإلا فهي خدمةٌ خاضعة (دليلُ الوكلاء §8.1). */
function assertOnBehalfEvidence(treatment: ChargeTreatment, evidence: string | undefined): void {
  if (treatment === 'ON_BEHALF' && !evidence?.trim()) throw new BadRequestException(MSG.charge_on_behalf_evidence_required);
}

/**
 * ⚖️ **معاملةُ المطالبة** (الأسئلة ٥١ و٤١٣ · `ق-١٦٠٠`، بحكم صاحب المشروع: «خانةٌ عند كلِّ مطالبة، والافتراضُ خاضع») — أيُّ نوعٍ
 * يقبل أيَّ معاملة، فالتاجرُ أعلمُ بالواقعة؛ والغيابُ خدمةٌ خاضعة لأن النيابةَ والتعويضَ استثناءان يُثبتان.
 */
function claimTreatmentFor(dto: { taxTreatment?: ChargeTreatment; onBehalfEvidence?: string }): ChargeTreatment {
  const treatment = dto.taxTreatment ?? 'TAXABLE_SERVICE';
  assertOnBehalfEvidence(treatment, dto.onBehalfEvidence);
  return treatment;
}

/** ما يجوز من معاملةٍ لكلِّ نوع خصم (السؤال ٤١٤) — `null`: بلا معاملة (الضررُ تعويضٌ بطبعه والإيجارُ يسدّد ذمّتَه). */
const DEDUCTION_TREATMENTS: Record<DeductionKind, readonly ChargeTreatment[] | null> = {
  UNPAID_RENT: null,
  DAMAGE: null,
  CLEANING: ['TAXABLE_SERVICE'],
  UTILITIES: ['TAXABLE_SERVICE', 'ON_BEHALF'],
  OTHER: ['TAXABLE_SERVICE', 'COMPENSATION'],
};

/**
 * ⚖️ **معاملةُ الخصم من التأمين** (السؤال ٤١٤ · `ق-١٦٠٠`، بحكم صاحب المشروع: «`DAMAGE` و`UNPAID_RENT` كما هما، و`CLEANING`
 * و`UTILITIES` بحكم ٤٩ و٥١، و`OTHER` يُسأل عنه عند إدخاله»): النظافةُ خاضعةٌ دائماً · المرافقُ خاضعةٌ افتراضاً أو نيابةً بإثباتها ·
 * «أخرى» لا افتراضَ لها · والضررُ والإيجارُ لا معاملةَ تُختار لهما.
 */
function deductionTreatmentFor(d: { kind: string; taxTreatment?: ChargeTreatment; onBehalfEvidence?: string }): ChargeTreatment | null {
  const allowed = DEDUCTION_TREATMENTS[d.kind as DeductionKind];
  if (!allowed) {
    if (d.taxTreatment) throw new BadRequestException(MSG.deduction_treatment_not_allowed);
    return null;
  }
  if (!d.taxTreatment) {
    if (d.kind === 'OTHER') throw new BadRequestException(MSG.deduction_other_treatment_required);
    return 'TAXABLE_SERVICE';
  }
  if (!allowed.includes(d.taxTreatment)) throw new BadRequestException(MSG.deduction_treatment_not_allowed);
  assertOnBehalfEvidence(d.taxTreatment, d.onBehalfEvidence);
  return d.taxTreatment;
}

/**
 * رمزا عملةٍ واحدٌ؟ — **بلا اعتبارٍ للمسافة ولا لحالة الأحرف**: الرمزُ يُشذَّب عند الإنشاء ولا يُطبَّع إلى أحرفٍ كبيرة
 * (`createClaim` · `recordDeposit`)، فمقارنةٌ حرفيةٌ كانت تعدّ رمزَ عملة الأساس بأحرفٍ صغيرة عملةً أجنبيةً فتطلب لمستند
 * عملة الأساس سعرَ يومٍ لا ترسله الواجهة (المراجعةُ العدائية لـ`ق-١٤٨٩`).
 */
function sameCurrency(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * ⚖️ **عملةُ المستند غيرُ عملة أساس المنشأة؟** (`ق-١٤٨٩` · B7 · B8 · B9) — فمستندٌ بعملة الأساس سعرُه سعرُ يومه
 * بالتعريف، ولا سعرَ يُطلب له ولا يُقرأ، ويبقى قيدُه حرفاً كما كان.
 */
async function isForeignCurrency(tx: Prisma.TransactionClient, companyId: string, currency: string): Promise<boolean> {
  return !sameCurrency(currency, await companyBaseCurrency(tx, companyId));
}

/**
 * ⚖️ **سعرُ يوم النقد لمستندٍ بعملةٍ أجنبية — مُدخَلٌ لا مفترَض** (`ق-١٤٨٩` · B7 · B8 · B9).
 *
 * المطالبةُ والوديعةُ والمقبوضُ غيرُ المكتسَب قُيّدت بسعرها يومَ نشأت، والنقدُ الذي يسوّيها يتحرّك يوماً آخر بسعرٍ
 * آخر. **وكان النقدُ يُقيَّد بالسعر التاريخيّ فيُطوى فرقُ السوق في `1000`** في المسارات الثلاثة (قياس `ق-١٤٨٩`).
 * ⛔ **ولا سعرَ يُفترض**: سعرُ المستند افتراضاً هو العطلُ نفسُه بلبوسٍ آخر — فغيابُه يُرفض برسالةٍ مسمّاة قبل أيّ أثر.
 * ⚠️ **و`null` كالغياب**: `@IsOptional` يُمرّر `null` بلا فحص؛ ولو عُومل سعراً لصار النقدُ `amount × null = 0` فيُرحَّل
 * المستندُ كلُّه خسارةَ صرفٍ على `5600` بقيدٍ متوازن، ولصار في الوديعة والإلغاء «لا سعر» فيعود السعرُ التاريخيّ صامتاً —
 * أي العطلُ نفسُه من بابٍ ثانٍ (المراجعةُ العدائية لـ`ق-١٤٨٩`؛ ونظيرُه في `resolveCurrency` على فرع M1).
 */
function requireCashDayRate(currency: string, dayRate: number | null | undefined): number {
  if (dayRate === undefined || dayRate === null) throw new BadRequestException(formatMessage(MSG.rent_cash_rate_required, { currency }));
  return dayRate;
}

/**
 * ⚖️ **تقسيمُ الوديعة بسعرها — والأجزاءُ تساوي الالتزامَ بالضبط** (`ق-١٤٨٩` · B8 · البندُ ٢٩ من المراجعة العدائية).
 *
 * كان كلُّ جزءٍ (خصمُ الذمّة · خصمُ الدخل · الردّ) يُقوَّم بسعر الوديعة ويُدوَّر وحدَه، والالتزامُ `2300` مدوَّرٌ مرّةً
 * واحدة: فوديعةُ `0.03` بسعر `1.5` التزامُها `0.05`، وأجزاؤها الثلاثة بـ`0.01` كلٌّ منها `0.02` — مجموعُها `0.06`،
 * فيختلّ القيدُ بهللة ويُرفض `journal_entry_unbalanced`. **فبقيّةُ التقريب يحملها جزءٌ واحدٌ معلوم** (قاعدة `ق-٣٦` في
 * `allocateEvenly`): **أكبرُ الأجزاء قيمةً** — فلا يصير جزءٌ سالباً — **وعند التساوي الدخلُ ثم الردُّ ثم الذمّة**: الدخلُ
 * لا يُقوَّم بسعرٍ آخر، فبقيّتُه لا تصل `5600`.
 */
function splitAtDepositRate(
  liability: number,
  amounts: { receivable: number; income: number; refund: number },
  rate: number,
): { receivable: number; income: number; refund: number } {
  const valued = {
    receivable: toBaseAmount(amounts.receivable, rate),
    income: toBaseAmount(amounts.income, rate),
    refund: toBaseAmount(amounts.refund, rate),
  };
  const remainder = round2(liability - valued.receivable - valued.income - valued.refund);
  const present = (['income', 'refund', 'receivable'] as const).filter((k) => amounts[k] > 0);
  if (remainder === 0 || present.length === 0) return valued;
  const carrier = present.reduce((best, k) => (valued[k] > valued[best] ? k : best));
  return { ...valued, [carrier]: round2(valued[carrier] + remainder) };
}

// ⛔ كانت هنا خريطةُ كلماتٍ خمس تحوّل `Unit.type` الحرَّ إلى تعداد العقار لفحص اتساقٍ عند
// إنشاء العقد — **وتتخطّى ما لا تعرفه صامتةً** (`office` بالحرف اللاتينيّ غيرُ مرئيٍّ لها).
// حُذفت بحكم المالك (`ق-٨٩٨`): التصنيفُ حقلٌ مهيكلٌ إلزاميٌّ على العقد (`Contract.classification`)
// **ولا يُستنبَط من نصّ** — ولا تُبقى الخريطةُ «لفحص الاتساق» فبقاؤها يُبقي الاستنباط.
// حارسٌ يُسقط الحزمة على عودتها: `no-word-classification.spec.ts`.

/** حقولُ المؤجّر كما تُكتب على العقد. */
interface LessorFields {
  lessor: 'COMPANY' | 'OWNER';
  ownerName: string | null;
  ownerVatNumber: string | null;
}

/**
 * ⚖️ **من المؤجّر** (السؤال ٥٧٧ · `ق-١٦٠٠` · `ق-١٦٠٩`/أ، بحكم صاحب المشروع) — مصدرٌ واحد للإنشاء والتجديد والتعديل.
 *
 * - **عقارٌ مملوكٌ أو مستأجَرٌ رئيساً**: المؤجّرُ المنشأةُ واقعةً (لا مالكَ غيرُها يُبرم) — و«المالكُ مؤجّراً» عليه يُرفض.
 * - **عقارُ تشغيل**: المؤجّرُ **يُعلَن ولا يُفترض** — فالفيصلُ عند الهيئة باسم من يُبرم العقد، والخطأُ فيه ضريبةٌ ناقصة
 *   أو إيرادٌ ليس للمنشأة.
 * - **المالكُ مؤجّراً**: اسمُه إلزاميّ (له يُدفع)، ورقمُه الضريبيّ للتجاريّ (مورّدٌ خاضعٌ مسجَّل)، ونسبةُ عمولة العقار
 *   معلَنة (منها تُحسب العمولةُ عند كلِّ قبض). وحين المؤجّرُ المنشأةُ تُمحى حقولُ المالك ولا تُترك تشهد بغير الواقع.
 */
function lessorFieldsFor(
  property: Pick<Property, 'ownership' | 'opRate'>,
  dto: { lessor?: 'COMPANY' | 'OWNER'; ownerName?: string; ownerVatNumber?: string },
  /** العقدُ تجاريٌّ كما أُعلن — فتوريدُ المالك خاضعٌ ورقمُه الضريبيّ إلزاميّ. */
  commercial: boolean,
): LessorFields {
  const none: LessorFields = { lessor: 'COMPANY', ownerName: null, ownerVatNumber: null };
  if (property.ownership !== 'managed') {
    if (dto.lessor === 'OWNER') throw new BadRequestException(MSG.contract_owner_lessor_requires_managed);
    return none;
  }
  if (dto.lessor === undefined) throw new BadRequestException(MSG.contract_lessor_required);
  if (dto.lessor === 'COMPANY') return none;
  const ownerName = dto.ownerName?.trim();
  if (!ownerName) throw new BadRequestException(MSG.contract_owner_name_required);
  const ownerVatNumber = dto.ownerVatNumber?.trim() || null;
  if (commercial && !ownerVatNumber) throw new BadRequestException(MSG.contract_owner_vat_required);
  if (property.opRate === null) throw new BadRequestException(MSG.contract_owner_commission_rate_missing);
  return { lessor: 'OWNER', ownerName, ownerVatNumber };
}

/**
 * **أيُدفع على هذا الإيجار ضريبة؟** — التجاريُّ والإيواءُ المخدومُ كلُّه والمختلطُ بجزئه الخاضع (السؤالان ٥٩ و٤١٢). فالمالكُ
 * المؤجّرُ لأيٍّ منها مورّدٌ خاضعٌ يحتاج رقماً ضريبيّاً. والوسيطُ «نوعٌ» لا «تصنيف» عمداً: حارسُ `no-word-classification`
 * يقرأ كلَّ إسنادٍ لاسم التصنيف من غير الطلب.
 */
function isTaxedKind(kind: string): boolean {
  return kind === 'COMMERCIAL' || kind === 'SERVICED_LODGING' || kind === 'MIXED';
}

/** نصيبُ المعفى وأساسُه كما يُكتبان على العقد. */
interface MixedShareFields {
  exemptSharePercent: number | null;
  exemptShareBasis: string | null;
}

/**
 * ⚖️ **نسبةُ العقد المختلط** (السؤال ٤١٢ · `ق-١٦٠٠`، بحكم صاحب المشروع: «نسبةٌ يعلنها المؤجّرُ بأساسه، ولا مساحةَ إلزامية»)
 * — مصدرٌ واحد للإنشاء والتجديد والتعديل: إلزاميّةٌ مع أساسها للمختلط، وممنوعةٌ لغيره فلا تبقى نسبةٌ تشهد بقسمةٍ لا تقع.
 * والقاعدةُ تحبس الشيءَ نفسَه بقيد `contracts_mixed_share_declared`.
 */
function mixedShareFieldsFor(kind: string, share: { exemptSharePercent?: number | null; exemptShareBasis?: string | null }): MixedShareFields {
  const percent = share.exemptSharePercent ?? null;
  const basis = share.exemptShareBasis?.trim() || null;
  if (kind !== 'MIXED') {
    if (percent !== null || basis !== null) throw new BadRequestException(MSG.contract_mixed_share_only_for_mixed);
    return { exemptSharePercent: null, exemptShareBasis: null };
  }
  if (percent === null || basis === null) throw new BadRequestException(MSG.contract_mixed_share_required);
  return { exemptSharePercent: percent, exemptShareBasis: basis };
}

/**
 * Whether an edit changes the declared tax treatment (classification, VAT inclusion, mixed exempt share). A contract still
 * carrying a legacy value has no treatment yet, so declaring it is not a change.
 */
function changesTaxTreatment(
  existing: Pick<Contract, 'classification' | 'vatInclusion' | 'lessor' | 'exemptSharePercent'>,
  dto: Pick<UpdateContractDto, 'classification' | 'vatInclusion' | 'exemptSharePercent'>,
): boolean {
  const lessor = existing.lessor as RentLessor;
  const declared = rentTaxTreatment(existing.classification as RentClassification, existing.vatInclusion as RentVatInclusion, lessor, sharePercentOf(existing.exemptSharePercent));
  if (!declared) return false;
  const nextKind = (dto.classification ?? existing.classification) as RentClassification;
  const nextShare = nextKind === 'MIXED' ? (dto.exemptSharePercent ?? sharePercentOf(existing.exemptSharePercent)) : null;
  const next = rentTaxTreatment(nextKind, (dto.vatInclusion ?? existing.vatInclusion) as RentVatInclusion, lessor, nextShare);
  return !next || next.classification !== declared.classification || next.inclusive !== declared.inclusive || next.exemptShare !== declared.exemptShare;
}

/**
 * Locks the contract row before its state is read, so a receipt, a cancellation and a renewal of the same contract run one
 * after another. NO KEY UPDATE, not UPDATE: the rent sweep holds installment locks while it inserts accrual rows that
 * reference the contract, and a FOR UPDATE here would make the two wait on each other.
 */
async function lockContractRow(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "contracts" WHERE "id" = ${id} FOR NO KEY UPDATE`;
}

/** Rent accrual rows and collections on a contract; once there is one, what it was posted under stays. */
async function postedRentRows(tx: Prisma.TransactionClient, contractId: string): Promise<number> {
  const [accrued, paid] = await Promise.all([tx.rentAccrual.count({ where: { contractId } }), tx.rentPayment.count({ where: { contractId } })]);
  return accrued + paid;
}

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly permissions: PermissionsService,
  ) {}

  list(companyId: string, query: ListContractsQueryDto = {}) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => this.listRefreshed(tx, query));
  }

  findOne(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.refreshInstallmentStatuses(tx, id);
      const contract = await tx.contract.findUnique({ where: { id }, include: CONTRACT_INCLUDE });
      if (!contract) throw new NotFoundException(MSG.contract_not_found);
      // العميلُ مصدرُ الحقيقة (`ق-١٠٢٨`/⑥): ما افترق على العقد قبل هذا البناء يُصحَّح بالاشتقاق عند
      // القراءة — لا بهجرةٍ تكتبه — وما بعده تُبقيه الكتابةُ متطابقاً.
      // ⚖️ ورصيدُ المستأجر الباقي تقرؤه نافذةُ التجديد (`ق-١٦٣٧`) — من مصدر الخصم نفسِه.
      const tenantCredit = await tenantCreditBalanceWithinTx(tx, contract);
      // ⚖️ رقمُ هويّة المستأجر مفكوكاً — في التفصيل وحدَه (السؤال ٩٤٨ · توجيه ٢٨٦).
      const tenantIdNumber = decryptContractTenantId(companyId, contract);
      return { ...this.withComputedFigures(withPartyFromCustomer(contract)), tenantCredit: money(tenantCredit), tenantIdNumber };
    });
  }

  /**
   * **الأرقامُ التي كانت تجمعها نافذةُ العقد بنفسها** (`ق-١٢٤٣`: الشاشةُ تقرأ ولا تحسب) — نصّاً بخانتين:
   * لكل قسطٍ **إجماليُّه** بالضريبة من الدالّة نفسِها التي يقيس بها الاستحقاقُ والقبض (`rentAmountsOf`؛
   * والقديمُ غيرُ المصنَّف بمبلغه — **وعقارُ التشغيل بلا ضريبة**، وهو ما كانت الشاشةُ تخطئه) **ومسدَّدُه**
   * (صافي دفعاته + خصمُها — كما تُشتقّ حالتُه) **ومتبقّيه** (موقَّعاً: الزائدُ سالب)؛ ومجموعُ المطالبات
   * المفتوحة؛ والتأميناتُ المحجوزة لدى المنشأة.
   */
  private withComputedFigures<
    T extends Pick<Contract, 'classification' | 'vatInclusion' | 'lessor' | 'exemptSharePercent' | 'tenantIdCipher' | 'tenantIdIndex'> & {
      installments: { id: string; amount: Prisma.Decimal }[];
      payments: { installmentId: string | null; netAmount: Prisma.Decimal; discount: Prisma.Decimal }[];
      claims: { status: string; amount: Prisma.Decimal; taxAmount: Prisma.Decimal }[];
      deposits: { status: string; holder: string; amount: Prisma.Decimal }[];
    },
  >(contract: T) {
    // المعاملةُ الضريبية من حقول العقد المُعلَنة (`ق-٨٩١` · السؤال ٥٧٧) — لا استنباطَ من كلمة.
    const treatment = rentTaxTreatment(
      contract.classification as RentClassification,
      contract.vatInclusion as RentVatInclusion,
      contract.lessor as RentLessor,
      sharePercentOf(contract.exemptSharePercent),
    );
    const settledBy = new Map<string, number>();
    for (const p of contract.payments) {
      if (!p.installmentId) continue;
      settledBy.set(p.installmentId, (settledBy.get(p.installmentId) ?? 0) + Number(p.netAmount) + Number(p.discount));
    }
    return {
      // ⚖️ بلا نصِّ هويّة المستأجر المشفَّر ولا بصمته (توجيه ٢٨٦) — `tenantIdOnFile` وحدَها.
      ...publicContract(contract),
      installments: contract.installments.map((i) => {
        const gross = treatment ? rentAmountsOf(Number(i.amount), treatment).gross : round2(Number(i.amount));
        const settled = round2(settledBy.get(i.id) ?? 0);
        return { ...i, gross: money(gross), settled: money(settled), remaining: money(gross - settled) };
      }),
      // ⚖️ المطالبةُ المفتوحة بإجماليّها — الخاضعةُ بضريبتها (السؤال ٤١٣)، فهو ما يدين به المستأجر.
      claimsOutstanding: money(contract.claims.filter((c) => c.status === 'OPEN').reduce((s, c) => s + Number(c.amount) + Number(c.taxAmount), 0)),
      depositsHeld: money(contract.deposits.filter((d) => d.status === 'HELD' && d.holder === 'COMPANY').reduce((s, d) => s + Number(d.amount), 0)),
      // ⚖️ مدّةُ حفظ صور نماذج التسليم كما يُعلَم بها المستأجر (`ق-١٦٠٠` · السؤال ٢٤٣) — من مدد الحفظ، تقرؤها الشاشةُ ولا تكتبها.
      handoverPhotoRetentionYears: RETENTION_YEARS.realEstate,
    };
  }

  /** The contract a keyed request wrote or recorded on, as its create answered it. */
  private async replayedContract(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.contract.findUnique({ where: { id }, include: CONTRACT_INCLUDE });
    return row ? this.withComputedFigures(row) : null;
  }

  create(companyId: string, dto: CreateContractDto, request?: KeyedRequest) {
    // Retries the whole transaction on a "no" collision from a concurrent
    // create — same reasoning as InvoicesService.create.
    // ⚠️ مهلةٌ أطول من الافتراض: عقدٌ يُدخَل بتاريخٍ مضى يستحقّ أقساطَه التي حلّت في المعاملة
    // نفسِها (ق-٩٢٧/٥) — وقيدٌ لكلِّ قسط؛ فمهلةُ الخمس ثوانٍ تُسقط ترحيلَ عقدٍ بعشرين قسطاً.
    return onceForRequest(this.tenantPrisma, companyId, request, (tx, id) => this.replayedContract(tx, id), () =>
    retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(
        companyId,
        (tx) => recordKeyedRequest(tx, companyId, request, async () => {
        // بلا عملةٍ صريحة ⟵ عملةُ أساس المنشأة لا الريال (`ق-١٣٦٨`).
        const { currency, exchangeRate } = await resolveCurrencyWithin(tx, companyId, dto);
        const unit = await tx.unit.findUnique({ where: { id: dto.unitId }, include: { property: true } });
        if (!unit) throw new NotFoundException(MSG.unit_not_found);

        const start = new Date(dto.start);
        const end = new Date(dto.end);
        const isDraft = dto.draft ?? false;
        // **العميلُ يُختار بمعرّفه — للمسوّدة كما للحيّ** (`ق-١٠٢٨`/①②): لا بحثَ بالاسم ولا إنشاءَ ضمنيّ.
        const customer = await this.linkableCustomer(tx, dto.customerId);
        if (!isDraft) await this.validateContract(tx, unit, unit.property, start, end, customer.name);
        // ⚖️ من المؤجّر (السؤال ٥٧٧) — للمسوّدة كما للحيّ: الحقلُ إلزاميٌّ في القاعدة، ويُعلَن على عقار التشغيل.
        const lessor = lessorFieldsFor(unit.property, dto, isTaxedKind(dto.classification));
        // ⚖️ ونسبةُ المختلط (السؤال ٤١٢) — للمسوّدة كما للحيّ كذلك: القيدُ في القاعدة لا يميّز المسوّدة.
        const mixedShare = mixedShareFieldsFor(dto.classification, dto);

        const no = await this.nextContractNumber(tx, companyId, start);
        // المعرّفُ قبل الكتابة — فرقمُ هويّة المستأجر المشفَّر يُربط بصفّه من أوّل حقل (توجيه ٢٨٦).
        const contractId = randomUUID();

        const created = await tx.contract.create({
          data: {
            id: contractId,
            ...contractTenantIdData(companyId, contractId, dto.tenantIdNumber),
            unitId: dto.unitId,
            customerId: customer.id,
            no,
            ejarNo: dto.ejarNo,
            // مشتقّان من بطاقة العميل — ذاكرةٌ تُحدَّث مع تعديله، لا لقطةٌ تشيخ (`ق-١٠٢٨`/①⑥).
            tenant: customer.name,
            phone: customer.phone,
            value: dto.value,
            cycle: dto.cycle,
            start,
            end,
            deposit: dto.deposit ?? 0,
            services: dto.services,
            furnished: dto.furnished,
            // إلزاميان من الـDTO وحدَه — لا افتراضَ ولا استنباط (ق-٨٩١ · ق-٨٩٢).
            classification: dto.classification,
            vatInclusion: dto.vatInclusion,
            ...lessor,
            ...mixedShare,
            status: isDraft ? 'DRAFT' : 'DUE',
            currency,
            exchangeRate,
            baseValue: toBaseAmount(dto.value, exchangeRate),
          } as unknown as Prisma.ContractUncheckedCreateInput,
        });

        if (!isDraft) {
          const schedule = generateInstallmentSchedule(start, end, dto.value, dto.cycle);
          await tx.installment.createMany({
            // Installments inherit the contract's currency and rate — they're
            // just a schedule of the same obligation, not separate deals.
            data: schedule.map((s) => ({
              contractId: created.id,
              dueDate: s.dueDate,
              amount: s.amount,
              // فترةُ الخدمة تُثبَّت لحظةَ التوليد ولا تُشتقّ لاحقاً (ق-٤٧٥/②).
              serviceStart: s.serviceStart,
              serviceEnd: s.serviceEnd,
              currency,
              exchangeRate,
              baseAmount: toBaseAmount(s.amount, exchangeRate),
            })) as unknown as Prisma.InstallmentUncheckedCreateInput[],
          });

          // Matches the mockup: creating a live (non-draft) contract for a
          // unit that carries a matching-name active reservation converts
          // that reservation rather than leaving it dangling — mismatched
          // names were already rejected above by validateContract.
          const rsv = await activeReservationForUnit(tx, dto.unitId);
          if (rsv) await tx.reservation.update({ where: { id: rsv.id }, data: { status: 'CONVERTED' } });

          // ⭐ ما حلّ استحقاقُه من الجدول يُستحقّ ذمّةً في اللحظة نفسِها (ق-٩١٧ · ق-٩٢٧/٥):
          // عقدٌ يُدخَل بتاريخٍ مضى يحمل أقساطاً حلّت، وكلٌّ منها نقطةُ ضريبةٍ بتاريخها —
          // لا ينتظر الكنسَ اليوميّ. والمقفلُ من الفترات يُتخطّى ويُعدّ لا يوقف الإنشاء.
          await accrueDueWithinTx(tx, companyId, new Date(), created.id);
        }

        // ⚖️ بنودُ الرسوم (السؤالان ٤٩ و٤١٣ · ق-١٦٠٠): تُكتب للمسوّدة كما للحيّ، وتُطالَب لما حلّ من أقساط الحيّ في اللحظة نفسِها.
        if (dto.fees?.length) {
          await tx.contractFee.createMany({
            data: dto.fees.map((f) => ({ contractId: created.id, label: f.label.trim(), amount: f.amount, effectiveFrom: new Date(f.effectiveFrom ?? dto.start) })) as unknown as Prisma.ContractFeeCreateManyInput[],
          });
          if (!isDraft) await raiseDueFeesWithinTx(tx, companyId, new Date(), created.id);
        }

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: created.id }, include: CONTRACT_INCLUDE }));
        }),
        ACCRUAL_TX_OPTIONS,
      ),
    ));
  }

  /**
   * ⚖️ **بندُ رسمٍ يُضاف لعقدٍ قائم** (السؤالان ٤٩ و٤١٣ · `ق-١٦٠٠`) — ويُطالَب في اللحظة نفسِها لما حلّ من أقساطه منذ سريانه
   * (الافتراضُ اليوم)، وما يحلّ بعدُ يلتقطه الكنسُ اليوميّ.
   */
  addFee(companyId: string, contractId: string, dto: ContractFeeDto, request?: KeyedRequest): Promise<CreatedContractFeeResponse> {
    // A replay counts the claims raised for the fee now, since the first answer's count is not kept.
    const replayed = async (tx: Prisma.TransactionClient, id: string): Promise<CreatedContractFeeResponse | null> => {
      const fee = await tx.contractFee.findUnique({ where: { id } });
      return fee ? { ...presentFee(fee), raisedClaims: await tx.contractClaim.count({ where: { feeId: fee.id } }) } : null;
    };
    return onceForRequest(this.tenantPrisma, companyId, request, replayed, () =>
    retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(
        companyId,
        (tx) => recordKeyedRequest(tx, companyId, request, async () => {
          const contract = await tx.contract.findUnique({ where: { id: contractId } });
          if (!contract) throw new NotFoundException(MSG.contract_not_found);
          if (contract.status === 'CANCELLED') throw new ConflictException(MSG.contract_fee_on_cancelled);
          const fee = await tx.contractFee.create({
            data: { contractId, label: dto.label.trim(), amount: dto.amount, effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : await companyToday(tx, companyId) } as unknown as Prisma.ContractFeeUncheckedCreateInput,
          });
          const raised = contract.status !== 'DRAFT' ? (await raiseDueFeesWithinTx(tx, companyId, new Date(), contractId)).raised : 0;
          return { ...presentFee(fee), raisedClaims: raised };
        }),
        ACCRUAL_TX_OPTIONS,
      ),
    ));
  }

  /**
   * ⚖️ **إنهاءُ بند رسم** — لا حذف: ما طولب عنه يبقى مطالبةً تُحصَّل أو تُسقَط، ولا يُطالَب لقسطٍ يحلّ بعد `endedAt`.
   */
  endFee(companyId: string, contractId: string, feeId: string, dto: EndContractFeeDto): Promise<ContractFeeResponse> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const fee = await tx.contractFee.findUnique({ where: { id: feeId } });
      if (!fee || fee.contractId !== contractId) throw new NotFoundException(MSG.contract_fee_not_found);
      const endedAt = new Date(dto.endedAt);
      if (endedAt < fee.effectiveFrom) throw new BadRequestException(MSG.contract_fee_end_before_start);
      return presentFee(await tx.contractFee.update({ where: { id: feeId }, data: { endedAt } }));
    });
  }

  update(companyId: string, id: string, dto: UpdateContractDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.contract.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.contract_not_found);

      // عقدٌ سبق الهجرة يحمل قيمةً قديمةً معلَنة — وأوّلُ تعديلٍ له يوجب إعلانَ ما لم
      // يُعلَن (ق-٨٩٨): «يُعلَن ولا يُصحَّح رجعياً، ويُنقص بيدٍ عند لمس العقد».
      if (existing.classification === 'LEGACY_UNCLASSIFIED' && dto.classification === undefined) {
        throw new BadRequestException(MSG.contract_classification_required);
      }
      if (existing.vatInclusion === 'LEGACY_UNDECLARED' && dto.vatInclusion === undefined) {
        throw new BadRequestException(MSG.contract_vat_inclusion_required);
      }
      // ⚖️ وعقدٌ على عقار تشغيلٍ سبق حقلَ المؤجّر يُعلَن مؤجّرُه أوّلاً (السؤال ٥٧٧ · ق-١٦٠٠) — بالمبدأ نفسِه.
      if (existing.lessor === 'LEGACY_UNDECLARED' && dto.lessor === undefined) {
        throw new BadRequestException(MSG.contract_lessor_required);
      }
      // Posted rent, its later reductions and the VAT return all read the tax treatment, so it stays once rent was posted.
      if (changesTaxTreatment(existing, dto) && (await postedRentRows(tx, id)) > 0) {
        throw new ConflictException(MSG.contract_tax_treatment_locked_after_posting);
      }

      const data: Prisma.ContractUncheckedUpdateInput = {};
      if (dto.classification !== undefined) data.classification = dto.classification;
      if (dto.vatInclusion !== undefined) data.vatInclusion = dto.vatInclusion;
      // The mixed share follows the classification that remains after the edit: declared with MIXED, cleared with any other.
      if (dto.classification !== undefined || dto.exemptSharePercent !== undefined || dto.exemptShareBasis !== undefined) {
        const nextKind = dto.classification ?? existing.classification;
        Object.assign(
          data,
          mixedShareFieldsFor(nextKind, {
            exemptSharePercent: dto.exemptSharePercent ?? (nextKind === 'MIXED' ? sharePercentOf(existing.exemptSharePercent) : null),
            exemptShareBasis: dto.exemptShareBasis ?? (nextKind === 'MIXED' ? existing.exemptShareBasis : null),
          }),
        );
      }
      if (dto.lessor !== undefined || dto.ownerName !== undefined || dto.ownerVatNumber !== undefined) {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: existing.unitId }, include: { property: true } });
        const next = lessorFieldsFor(
          unit.property,
          {
            lessor: dto.lessor ?? (existing.lessor === 'LEGACY_UNDECLARED' ? undefined : existing.lessor),
            ownerName: dto.ownerName ?? existing.ownerName ?? undefined,
            ownerVatNumber: dto.ownerVatNumber ?? existing.ownerVatNumber ?? undefined,
          },
          isTaxedKind(dto.classification ?? existing.classification),
        );
        // **لا يُغيَّر المؤجّرُ بعد ترحيل**: القبضُ رُحّل أمانةً للمالك أو إيراداً للمنشأة، والاستحقاقُ ذمّةً — وتحويلُه
        // إعادةُ كتابة تاريخ (`§6.4`). أمّا إعلانُ مؤجّرِ عقدٍ قديم فيجوز ولو بعد قبض: لا معاملةَ له قبله، ويسري على ما بعده.
        if (existing.lessor !== 'LEGACY_UNDECLARED' && next.lessor !== existing.lessor && (await postedRentRows(tx, id)) > 0) {
          throw new ConflictException(MSG.contract_lessor_locked_after_posting);
        }
        Object.assign(data, next);
      }
      // **تغييرُ الطرف قبل أوّل ترحيلٍ فقط** (`ق-١٠٢٨`/③): بعده ذمّةٌ وقيودٌ نُسبت إليه — استحقاقٌ رُحِّل،
      // أو قبضٌ، أو وديعةٌ أو مطالبةٌ أو خلوّ — وتحويلُها إعادةُ كتابة تاريخ (`§6.4`). والمخرجُ تسمّيه
      // الرسالة: إنهاءُ العقد وعقدٌ جديد. أمّا الاسمُ والهاتفُ فمشتقّان من العميل لا مُدخَلان.
      if (dto.customerId !== undefined && dto.customerId !== existing.customerId) {
        const party = await this.linkableCustomer(tx, dto.customerId);
        const [accrued, paid, deposits, claims, keyMoney] = await Promise.all([
          tx.rentAccrual.count({ where: { contractId: id, journalEntryId: { not: null } } }),
          tx.rentPayment.count({ where: { contractId: id } }),
          tx.contractDeposit.count({ where: { contractId: id } }),
          tx.contractClaim.count({ where: { contractId: id } }),
          tx.contractKeyMoney.count({ where: { contractId: id } }),
        ]);
        if (accrued + paid + deposits + claims + keyMoney > 0) throw new ConflictException(MSG.contract_party_locked_after_posting);
        data.customerId = party.id;
        data.tenant = party.name;
        data.phone = party.phone;
      }
      if (dto.services !== undefined) data.services = dto.services;
      if (dto.furnished !== undefined) data.furnished = dto.furnished;
      if (dto.ejarNo !== undefined) data.ejarNo = dto.ejarNo;
      Object.assign(data, contractTenantIdData(companyId, id, dto.tenantIdNumber));

      return this.withComputedFigures(await tx.contract.update({ where: { id }, data, include: CONTRACT_INCLUDE }));
    });
  }

  cancel(companyId: string, id: string, dto: CancelContractDto) {
    // A settlement worked out from the upcoming installments charges them already; keeping them due as well charges twice.
    if (dto.installmentDisposition === 'keep' && (dto.settlementBasis === 'installments' || dto.settlementBasis === 'all')) {
      throw new BadRequestException(MSG.settlement_from_installments_needs_cancel);
    }
    // Retries on a journal-entry "no" collision when a settlement is posted.
    // ⚠️ ومهلةُ الدفعة كالإنشاء: الإلغاءُ يعترف بما قُدِّم حتى تاريخه ويعكس المُسقَط — قيدٌ لكلِّ
    // شهرٍ ولكلِّ قسطٍ مُسقَط، وعقدٌ طويل يتجاوز بها الخمسَ ثوانٍ.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(
        companyId,
        async (tx) => {
        // Locked before it is read: two cancellations, or a cancellation and a receipt, wait here and the later one reads it cancelled.
        await lockContractRow(tx, id);
        const existing = await tx.contract.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException(MSG.contract_not_found);
        if (existing.status === 'CANCELLED') throw new ConflictException(MSG.contract_already_cancelled);

        const cancelDate = new Date(dto.cancelDate);
        const accrualContract = await tx.contract.findUniqueOrThrow({ where: { id }, select: ACCRUAL_CONTRACT_SELECT });

        // A cancelled contract is not swept again, so what falls due before the cancel date (a date still to come
        // included) is billed now, with its fees, and the recognition below reads it.
        const lastServedDay = new Date(cancelDate.getTime() - 86_400_000);
        await accrueDueWithinTx(tx, companyId, lastServedDay, id);
        await raiseDueFeesWithinTx(tx, companyId, lastServedDay, id);

        // Worked out **before** the installments are touched: 'all' and
        // 'installments' read the very rows that `installmentDisposition:
        // 'cancel'` is about to void, and voiding them first would settle at
        // zero.
        // ⚖️ **قبل كلِّ شيء: يُعترَف بما قُدِّم حتى تاريخ الإلغاء** — بالمحرّك
        // نفسِه لا بقاعدةٍ ثانية (`ق-٤٦٩`). **فما بقي بعدها مقبوضٌ عن مدّةٍ لن
        // تُقدَّم**، وهو وحده موضوعُ السؤال.
        await recognizeDueWithinTx(tx, companyId, cancelDate, id);

        // ⭐ ثم **يُعكس استحقاقُ ما سيُسقَط** (ق-٩٢٥/②): قسطٌ حلّ بعد تاريخ الإلغاء ولم يُقبض
        // منه شيء ويُسقَط — تُردّ ذمّتُه وضريبتُه وإيرادُه كإشعارٍ دائن، **قبل** أن يُقرأ
        // الالتزامُ الباقي فلا يُسأل عن وجهةِ ما لم يعد التزاماً.
        if (dto.installmentDisposition === 'cancel') await reverseVoidedInstallmentsWithinTx(tx, companyId, accrualContract, cancelDate);
        // Kept installments stay owed, as compensation for a period the tenant does not occupy: what is not billed yet
        // goes to other income now, never to rent revenue later. Read before the rent received for them is settled.
        const keptUnbilled = dto.installmentDisposition === 'keep' ? await unbilledKeptInstallmentsWithinTx(tx, accrualContract, cancelDate) : 0;

        const unearnedDetail = await unearnedDetailWithinTx(tx, id);
        const unearned = unearnedDetail.total;
        if (unearned > 0 && !dto.unearnedDisposition) {
          // ⛔ **ولا افتراض** (`ق-٤٧٢`): «كلا الخيارين يكذب على نصف الحالات».
          throw new BadRequestException(formatMessage(MSG.unearned_disposition_required, { amount: formatMoney(unearned) }));
        }
        // ⚖️ (`ق-١٤٨٩` · B9) **ما يُردّ نقداً من المقبوض عن مدّةٍ لم تُقدَّم يخرج بسعر يوم الإلغاء** لعقدٍ بعملةٍ أجنبية —
        //    والالتزامُ (`2400`) بسعر العقد، والفرقُ على `5600`. ⛔ ولا سعرَ يُفترض: يُطلب هنا قبل تسوية الإلغاء.
        const refundDayRate =
          unearned > 0 && dto.unearnedDisposition === 'refund' && unearnedDetail.collected > 0 && (await isForeignCurrency(tx, companyId, existing.currency))
            ? requireCashDayRate(existing.currency, dto.exchangeRate)
            : null;

        const settlementAmount = await this.resolveSettlementAmount(tx, id, cancelDate, dto);
        // بنود التسوية (§16): التفصيل لا يغيّر المبلغ — يشرحه. مجموعٌ لا
        // يساويه = خطأ إدخال يُرفض قبل أي أثر.
        if (dto.settlementLines?.length) {
          // الجمع مدوَّرٌ عند كل تراكم والمقارنة بالتسامح المركزي — وكانت هنا
          // عتبةٌ مكتوبةٌ بيد على جمعٍ عائم، وهو ما كان يخترعه كل ملف لنفسه.
          if (!moneyEquals(sumMoney(dto.settlementLines.map((l) => l.amount)), settlementAmount)) {
            throw new BadRequestException(MSG.settlement_lines_mismatch);
          }
        }
        const settlementEntry =
          settlementAmount > 0
            ? await postContractSettlementEntry(tx, companyId, {
                unitId: existing.unitId,
                customerId: existing.customerId,
                contractNo: existing.no,
                tenant: existing.tenant,
                date: cancelDate,
                baseAmount: toBaseAmount(settlementAmount, Number(existing.exchangeRate)),
              })
            : null;
        if (keptUnbilled > 0) {
          await postContractSettlementEntry(tx, companyId, {
            unitId: existing.unitId,
            customerId: existing.customerId,
            contractNo: existing.no,
            tenant: existing.tenant,
            date: cancelDate,
            baseAmount: toBaseAmount(keptUnbilled, Number(existing.exchangeRate)),
            keptInstallments: true,
          });
        }

        const data: Prisma.ContractUncheckedUpdateInput = {
          status: 'CANCELLED',
          cancelDate,
          cancelReason: dto.cancelReason,
          ...(settlementAmount > 0 ? { settlementAmount, settlementEntryId: settlementEntry?.id ?? null } : {}),
        };
        // Shrinking `end` to the cancel date is what frees the unit up again —
        // UnitsService's status check only looks at contracts still covering
        // today (start <= today <= end).
        if (cancelDate < existing.end) data.end = cancelDate;

        await tx.contract.update({ where: { id }, data });

        if (dto.settlementLines?.length) {
          await tx.contractSettlementLine.createMany({
            data: dto.settlementLines.map((l) => ({ companyId, contractId: id, label: l.label, amount: l.amount })),
          });
        }

        if (dto.installmentDisposition === 'cancel') {
          await tx.installment.updateMany({
            where: { contractId: id, status: { in: VOIDED_ON_CANCEL }, dueDate: { gte: cancelDate } },
            data: { status: 'CANCELLED' },
          });
        }
        // Nothing from the cancel date on is billed again, whether cancelled or kept.
        await tx.installment.updateMany({
          where: { contractId: id, dueDate: { gte: cancelDate }, accrualCompletedAt: null },
          data: { accrualCompletedAt: new Date() },
        });

        // إقفالُ الالتزام الباقي — **بعد تعديل الأقساط**، فالمبلغُ مقروءٌ قبلها
        // ولا تغيّره حالةُ قسطٍ لم يُقبض منه شيء.
        if (unearned > 0 && dto.unearnedDisposition) {
          // ⚖️ ما **قُبض** عن مدّةٍ لن تُقدَّم ويُردّ: إشعارٌ دائنٌ يعكسه بضريبته ثم يُردّ للمستأجر كاملاً (توجيه ٢٧٥ · `ق-١٥٨٢`) —
          //    للأقساط على أساس الاستحقاق. والاحتجازُ بشرط العقد (`income`) والمقبوضُ القديمُ على أساس القبض كما كانا (حدّان معلَنان).
          const creditedNet =
            dto.unearnedDisposition === 'refund' ? await refundCollectedUnearnedWithinTx(tx, companyId, accrualContract, unearnedDetail, cancelDate, refundDayRate) : 0;
          const collectedRest = round2(unearnedDetail.collected - creditedNet);
          // وما بقي: يُردّ أو يُحتجَز — كما كان (ق-٤٧٢).
          if (collectedRest > 0) {
            await postDeferredSettlementEntry(tx, companyId, {
              unitId: existing.unitId,
              customerId: existing.customerId,
              contractNo: existing.no,
              tenant: existing.tenant,
              date: cancelDate,
              baseAmount: collectedRest,
              disposition: dto.unearnedDisposition,
              // المردودُ بعملة العقد = الالتزامُ مقسوماً على سعره، ثم يُقوَّم نقداً بسعر يوم الإلغاء (`ق-١٤٨٩` · B9).
              ...(refundDayRate === null
                ? {}
                : { baseCash: toBaseAmount(round2(collectedRest / (Number(existing.exchangeRate) || 1)), refundDayRate) }),
            });
          }
          // وما **استُحقّ ولم يُقبض** عن مدّةٍ بعد الإلغاء يتبع الوجهةَ نفسَها (ق-٩٢٧/٧):
          // `refund` ⇒ لا يدين به المستأجر فيُعكس؛ `income` ⇒ يبقى ذمّةً ويصير دخلاً آخر.
          await settleUnpaidUnearnedWithinTx(tx, companyId, accrualContract, unearnedDetail, cancelDate, dto.unearnedDisposition);
          // العدّادُ يُغلق: ما خرج من الالتزام لا يعود مرشَّحاً للتحوّل — وإلّا
          // رحّل الكنسُ الشهريّ التزاماً أُقفل بالفعل.
          await closeDeferredWithinTx(tx, id);
        }

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id }, include: CONTRACT_INCLUDE }));
        },
        ACCRUAL_TX_OPTIONS,
      ),
    );
  }

  /** Turns the chosen basis into a figure. Returns 0 for 'none', and for the
   * installment-derived bases when nothing is left unpaid — cancelling a fully
   * paid lease owes nothing. */
  private async resolveSettlementAmount(tx: Prisma.TransactionClient, contractId: string, cancelDate: Date, dto: CancelContractDto): Promise<number> {
    const basis = dto.settlementBasis ?? 'none';
    if (basis === 'none') return 0;
    if (basis === 'amount') return dto.settlementAmount ?? 0;

    const remaining = await tx.installment.findMany({
      where: { contractId, status: { in: ['DUE', 'LATE'] }, dueDate: { gte: cancelDate } },
      orderBy: { dueDate: 'asc' },
      ...(basis === 'installments' ? { take: dto.settlementInstallments } : {}),
      select: { amount: true },
    });

    return round2(remaining.reduce((sum, i) => sum + Number(i.amount), 0));
  }

  /** قبضُ إيجار — مرّةً لكلِّ مفتاح طلب (`recordPaymentOnce` يحمل القبضَ نفسَه وإعلانَ صندوقه). */
  recordPayment(companyId: string, allowedBranchIds: string[] | 'all', contractId: string, dto: RecordPaymentDto, idempotencyKey?: string) {
    // ⚖️ الإرسالُ المكرّر لا يُنشئ قبضين (توجيه ٢٧٦ · ق-١٦٠٩/ب): المفتاحُ نفسُه يعيد القبضَ نفسَه — `onceForKey`.
    return onceForKey(
      idempotencyKey,
      () => this.rentPaymentByKey(companyId, contractId, idempotencyKey!, dto),
      () => this.recordPaymentOnce(companyId, allowedBranchIds, contractId, dto, idempotencyKey),
    );
  }

  /**
   * القبضُ المكتوبُ بالمفتاح — أو `null`؛ ويُرفض `409` إن خالف الطلبُ ما كُتب به: عقداً، أو مجموعَ أجزائه (القبضُ الموزَّع أجزاءٌ
   * يحمل المفتاحَ أوّلُها ويجمعها قيدٌ واحد).
   */
  private rentPaymentByKey(companyId: string, contractId: string, key: string, dto: RecordPaymentDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.rentPayment.findFirst({ where: { clientRequestId: key }, include: { installment: true } });
      if (!existing) return null;
      const parts = existing.journalEntryId ? await tx.rentPayment.findMany({ where: { journalEntryId: existing.journalEntryId }, select: { amount: true } }) : [existing];
      const total = round2(parts.reduce((s, p) => s + Number(p.amount), 0));
      if (existing.contractId !== contractId || total !== round2(dto.amount)) throw new ConflictException(MSG.idempotency_key_reused);
      return existing;
    });
  }

  /**
   * **صندوقُه لا يُقاس هنا**: دفعةُ الإيجار مستندٌ بلا فرع (العقدُ والعقارُ لا يحملان فرعاً)، والمستندُ بلا فرعٍ خارجُ حكم
   * `ق-١٤٣٧` — وحركةُ البنك مرآتُها بلا فرعٍ كذلك.
   *
   * 🔴 **لكنّ فروعَ الفاعل تُقاس** (توجيه ٢٧٥ · ق-١٥٧٨/ب — قِيس `201`): الصندوقُ صفٌّ يحمل فرعاً، والقبضُ فيه كتابةٌ في رصيده؛
   * فموظّفٌ مقيَّدٌ لا يقبض في صندوق فرعٍ لا يملكه (`403`)، وصندوقُ المنشأة كلِّها (بلا فرع) لكلِّ فاعل.
   */
  private recordPaymentOnce(companyId: string, allowedBranchIds: string[] | 'all', contractId: string, dto: RecordPaymentDto, idempotencyKey?: string) {
    // Retries on a journal-entry "no" collision from a concurrent payment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        // Locked before anything is read: a cancellation or another receipt on the same contract finishes first, then this one
        // reads what it left. Its installments are locked too, in the sweep's order, before any of them is billed.
        await lockContractRow(tx, contractId);
        await lockContractInstallmentsWithinTx(tx, contractId);
        // قبضٌ موازٍ بالمفتاح نفسِه سبق فكتب — لا يُكتب ثانٍ، ويُقرأ ما كُتب (`onceForKey`).
        if (idempotencyKey && (await tx.rentPayment.findFirst({ where: { clientRequestId: idempotencyKey }, select: { id: true } }))) throw new IdempotentReplay();
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);
        // ⚖️ لا قبضَ على عقدٍ ملغى ولا على قسطٍ ملغى (`ق-١١٩٨`/⑥ — مراجعةٌ خارجية): الإلغاءُ سوّى
        //    العقدَ وأسقط أقساطَه وعكس ما استُحقّ منها، فقبضٌ بعده يُرحّل استحقاقاً واعترافاً على
        //    التزامٍ لم يعد قائماً — كان يمرّ `201` (مقيس).
        if (contract.status === 'CANCELLED') throw new ConflictException(MSG.contract_cancelled_no_payment);

        let installment = null;
        if (dto.installmentId) {
          installment = await tx.installment.findUnique({ where: { id: dto.installmentId } });
          if (!installment || installment.contractId !== contractId) throw new NotFoundException(MSG.installment_not_found);
          if (installment.status === 'CANCELLED') throw new ConflictException(MSG.installment_cancelled_no_payment);
        }

        if (dto.method === 'BANK' && !dto.bankId) throw new BadRequestException(MSG.bank_required);
        // A bankId is honoured for **either** method: a bank transfer names the
        // account, and a cash receipt may name the branch cash box it landed in
        // (a cash box is just a Bank record pointed at a branch — CLAUDE.md 6.8).
        // Either way the balance moves and a transaction is written, so a
        // branch's cash box reflects real money rather than only the GL account.
        const bank = dto.bankId ? await tx.bank.findUnique({ where: { id: dto.bankId } }) : null;
        if (dto.bankId && !bank) throw new NotFoundException(MSG.bank_not_found);
        assertBranchAllowed(allowedBranchIds, bank?.branchId);

        // A payment carries the contract's currency and may carry its own rate —
        // the gap between the rate the contract was priced at and the one it
        // settles at is the realized FX gain/loss.
        // ⚖️ (`ق-١٥٠٣`/ب · ٣-د) **ولا يُقبض الإيجارُ بعملةٍ غير عملة العقد**: كان يمرّ فيُسدَّد القسطُ بمقياسٍ آخر ويُحوَّل
        //    المبلغُ إلى عملة العقد بقسمة سعرين، ولا فرقَ صرفٍ يُعرف له (القياس B5). والقائمُ «`0`» على التطوير والمنشور
        //    (`ق-١٥٠٣`/ج) — فالرفضُ لا يمسّ صفّاً. والرموزُ بلا اعتبارٍ لحالة الأحرف، والمخزَّنُ عملةُ العقد بعينها.
        const requested = dto.currency?.trim();
        if (requested && requested.toUpperCase() !== contract.currency.trim().toUpperCase()) {
          throw new BadRequestException(formatMessage(MSG.rent_payment_currency_mismatch, { payment: requested, contract: contract.currency }));
        }
        const payCurrency = contract.currency;
        // السعرُ المرسَلُ يُقاس كمستندٍ جديد: لعقدٍ بعملة الأساس ١ لا غيرُه (توجيه ٢٧٤ · البند 1)، وبلا سعرٍ يرث سعرَ العقد.
        const { exchangeRate: payRate } = await resolveFollowingCurrency(tx, companyId, { currency: payCurrency, exchangeRate: dto.exchangeRate }, { currency: contract.currency, exchangeRate: Number(contract.exchangeRate) });

        const discount = dto.discount ?? 0;
        const netAmount = round2(dto.amount - discount);
        if (netAmount <= 0) throw new BadRequestException(MSG.payment_net_must_be_positive);

        // ⭐ **مساران بحدٍّ معلَن** (ق-٩٢٦ · ق-٩٢٧/٢·٣): القبضُ على قسطٍ استحقاقيّ لعقدٍ مصنَّف
        // **يسدّد ذمّةً** (نقدٌ ⇄ `1200`) بعد أن يُستحقّ ما يلزم؛ وما سبق البناءَ (أساسُ
        // القبض) أو عقدٌ لم يُصنَّف بعد يبقى على مسار القبض القائم (نقدٌ ⇄ `4200`/`2400`)
        // — ويُحسب في الإقرار ويُعدّ باسمه، ولا يُرحَّل رجعياً.
        const accrualContract = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, select: ACCRUAL_CONTRACT_SELECT });
        const treatment = treatmentOf(accrualContract);
        // ⚖️ **ومسارٌ ثالث: عقدٌ مؤجّرُه المالك** (السؤال ٥٧٧ · ق-١٦٠٠): القبضُ أمانةٌ له (`2500`) وعمولةٌ للمنشأة (`4250`)
        //    بضريبتها — بلا ذمّةٍ ولا استحقاقٍ ولا إيرادِ إيجار. والنسبةُ من العقار **لحظةَ القبض**؛ وبلا نسبةٍ يُرفض القبضُ برسالة
        //    لا يُرحَّل ناقصاً.
        const ownerPath = treatment !== null && treatment.managed;
        let ownerRate = 0;
        if (ownerPath) {
          const unitRow = await tx.unit.findUniqueOrThrow({ where: { id: contract.unitId }, select: { property: { select: { opRate: true } } } });
          if (unitRow.property.opRate === null) throw new BadRequestException(MSG.contract_owner_commission_rate_missing);
          ownerRate = Number(unitRow.property.opRate);
        }
        const accrualPath = !ownerPath && treatment !== null && (installment === null || installment.accrualBasis === 'ACCRUAL');
        // الإجماليُّ بمقياس عملة العقد — قبل الخصم، فالخصمُ تعديلُ مقابلٍ لاحق.
        // والقبضُ بعملة العقد وحدَها — فالمتوقَّعُ بسعر العقد، والإجماليُّ مبلغُ كلِّ جزءٍ نفسُه (أدناه).
        const baseExpected = toBaseAmount(netAmount, Number(contract.exchangeRate));

        let journalEntry: { id: string; no: string } | null = null;
        let earnedNow = 0;
        if (!accrualPath && !ownerPath) {
          const posting = await postRentPaymentEntry(tx, companyId, {
            unitId: contract.unitId,
            customerId: contract.customerId,
            contractNo: contract.no,
            tenant: contract.tenant,
            date: new Date(dto.date),
            // فترةُ خدمةِ القسط — وبلا قسطٍ مرتبط لا فترةَ تُعرف (ق-٤٧٣).
            service:
              installment?.serviceStart && installment?.serviceEnd
                ? { start: installment.serviceStart, end: installment.serviceEnd }
                : null,
            baseNetAmount: toBaseAmount(netAmount, payRate),
            // Priced at the contract's rate — but only when the payment is in
            // the contract's own currency. A payment made in a different
            // currency altogether has no rate difference to recognize.
            baseExpectedAmount: baseExpected,
            // (ق-٢٧٧) الطرفُ المدين حسابُ البنك حين يُقبض الإيجارُ على بنك — لا `1000`.
            cashAccountId: bank?.accountId ?? null,
          });
          journalEntry = posting.entry;
          earnedNow = posting.earned;
          // قسطٌ استحقاقيٌّ لعقدٍ لم يُصنَّف قُبض على المسار القائم — فيُثبَّت على أساس القبض
          // كي لا يستحقّه الكنسُ ثانيةً بعد التصنيف (والصفُّ سابقٌ للبناء فالقيدُ يقبله).
          if (installment && installment.accrualBasis === 'ACCRUAL') {
            await tx.installment.update({ where: { id: installment.id }, data: { accrualBasis: 'LEGACY_COLLECTED' } });
          }
        }

        // ⚖️ **الزائدُ على القسط يُوزَّع على الأقساط التالية بترتيب استحقاقها** (توجيه ٢٧٥ · `ق-١٥٨٢`، بحكم صاحب المشروع —
        //    ج-3 من مراجعة 3.3): كان الزائدُ صفَّ استحقاقٍ «بلا قسط» بتاريخه، ثم يحلّ القسطُ التالي كاملاً فتُستحقّ ضريبتُه
        //    مرّتين وتبقى ذمّةٌ على مستأجرٍ دفع. فيُقسَم القبضُ أجزاءً، لكلِّ قسطٍ جزؤه، وما فاض عن الأقساط كلِّها يبقى بلا قسط.
        //    والقبضُ واحد: قيدُ تسويةٍ واحد وحركةُ بنكٍ واحدة يحملهما الأجزاءُ كلُّها. وعلى مسار الاستحقاق وحدَه (حدٌّ معلَن):
        //    القسطُ القديمُ على أساس القبض يبقى على مساره القائم.
        //    ⚖️ **والدفعةُ بلا قسطٍ مسمّى تسدّد الحالَّ من الأقدم ثم القادمَ بترتيبه** (توجيه ٢٧٦ · ٢و ثم توجيه ٢٧٧ · ٢ب · ق-١٦١٤):
        //    كانت تبقى جزءاً واحداً بلا قسط، ثم صار ما زاد على الحالّ وحدَه بلا قسط؛ وما زاد على الأقساط كلِّها رصيدٌ للمستأجر
        //    لا إيراد (`ق-١٦٢٤`، نوعُ استحقاقه `TENANT_CREDIT` وأصلُه في `2450`).
        const parts =
          (accrualPath || ownerPath) && treatment
            ? await spreadRentPayment(tx, contractId, treatment, installment, dto.amount)
            : [{ installmentId: dto.installmentId ?? null, amount: dto.amount }];
        // والخصمُ على قسط الجزء الأوّل؛ فإن لم يقع الجزءُ الأوّلُ على قسطٍ فالدفعةُ كلُّها رصيدٌ، ولا خصمَ على رصيد.
        if ((accrualPath || ownerPath) && treatment && discount > 0 && parts[0]?.installmentId === null) {
          throw new BadRequestException(MSG.rent_discount_on_tenant_credit);
        }
        // ⚖️ وللمالك المؤجّر: لكلِّ جزءٍ على قسطٍ قسمتُه من صافيه بعملة الدفتر — حصّةُ المالك والعمولةُ وضريبتُها (السؤال ٥٧٧)؛ **وما زاد على
        //    الأقساط كلِّها رصيدٌ للمستأجر في `2450` لا حصّةً ولا عمولة حتى يقابله قسط** (توجيه ٢٧٨ · `ق-١٦٣٠`، بحكم صاحب المشروع).
        const ownerTotals = { cash: 0, share: 0, commission: 0, tax: 0, credit: 0 };
        // الخصمُ على الجزء الأوّل — وهو القسطُ المقصود، أو أوّلُ قسطٍ بقي له شيء.
        if (round2(parts[0].amount - discount) <= 0) throw new BadRequestException(MSG.payment_net_must_be_positive);

        // الأساسُ يُقسَم بالباقي: كلُّ جزءٍ بسعره إلا الأخيرَ فهو الفرقُ — فمجموعُ الأجزاء يساوي أساسَ القبض بلا هللة تقريب.
        const baseTotal = { amount: toBaseAmount(dto.amount, payRate), discount: toBaseAmount(discount, payRate), net: toBaseAmount(netAmount, payRate) };
        const baseSoFar = { amount: 0, net: 0 };
        const rows: { id: string; installmentId: string | null; amount: number }[] = [];
        for (const [k, part] of parts.entries()) {
          const last = k === parts.length - 1;
          const partDiscount = k === 0 ? discount : 0;
          const partNet = round2(part.amount - partDiscount);
          const baseAmount = last ? round2(baseTotal.amount - baseSoFar.amount) : toBaseAmount(part.amount, payRate);
          const baseNet = last ? round2(baseTotal.net - baseSoFar.net) : toBaseAmount(partNet, payRate);
          baseSoFar.amount = round2(baseSoFar.amount + baseAmount);
          baseSoFar.net = round2(baseSoFar.net + baseNet);
          const owner = ownerPath && treatment && part.installmentId !== null ? ownerCollectionSplit(baseNet, treatment, ownerRate) : null;
          if (ownerPath && part.installmentId === null) {
            ownerTotals.cash = round2(ownerTotals.cash + baseNet);
            ownerTotals.credit = round2(ownerTotals.credit + baseNet);
          }
          if (owner) {
            if (owner.ownerShare < 0) throw new BadRequestException(MSG.contract_owner_commission_exceeds_collection);
            ownerTotals.cash = round2(ownerTotals.cash + baseNet);
            ownerTotals.share = round2(ownerTotals.share + owner.ownerShare);
            ownerTotals.commission = round2(ownerTotals.commission + owner.commission);
            ownerTotals.tax = round2(ownerTotals.tax + owner.commissionTax);
          }
          const row = await tx.rentPayment.create({
            data: {
              contractId,
              installmentId: part.installmentId,
              date: new Date(dto.date),
              amount: part.amount,
              discount: partDiscount,
              netAmount: partNet,
              method: dto.method,
              // Records which money-holder took it — the bank account for a
              // transfer, or the branch cash box for a cash receipt.
              bankId: bank ? bank.id : undefined,
              notes: dto.notes,
              journalEntryId: journalEntry?.id,
              currency: payCurrency,
              exchangeRate: payRate,
              baseAmount,
              baseDiscount: k === 0 ? baseTotal.discount : 0,
              baseNetAmount: baseNet,
              ...(owner
                ? { commissionRate: ownerRate, baseOwnerVat: owner.ownerVat, baseCommission: owner.commission, baseCommissionTax: owner.commissionTax, baseOwnerShare: owner.ownerShare }
                : {}),
              // المفتاحُ على الجزء الأوّل وحدَه — فالقيدُ فريدٌ في المنشأة، والأجزاءُ يجمعها قيدُها.
              clientRequestId: k === 0 ? (idempotencyKey ?? null) : null,
            } as unknown as Prisma.RentPaymentUncheckedCreateInput,
          });
          rows.push({ id: row.id, installmentId: part.installmentId, amount: part.amount });
        }
        const payment = rows[0];

        if (ownerPath) {
          // قيدٌ واحد للقبض كلِّه، ومجاميعُه من صفوف الأجزاء نفسِها — فما يقرؤه الإقرارُ هو ما رُحِّل.
          const ownerEntry = await postOwnerRentCollectionEntry(tx, companyId, {
            customerId: contract.customerId,
            unitId: contract.unitId,
            contractNo: contract.no,
            tenant: contract.tenant,
            ownerName: contract.ownerName ?? '',
            date: new Date(dto.date),
            baseCash: ownerTotals.cash,
            baseOwnerShare: ownerTotals.share,
            baseCommission: ownerTotals.commission,
            baseCommissionTax: ownerTotals.tax,
            baseTenantCredit: ownerTotals.credit,
            cashAccountId: bank?.accountId ?? null,
          });
          journalEntry = ownerEntry;
          if (ownerEntry) await tx.rentPayment.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { journalEntryId: ownerEntry.id } });
        }

        if (accrualPath && treatment) {
          // ① يُستحقّ ما يلزم — بعد كتابة الدفعة كي يقرأها المحرّك: نقطتُها المقدَّمة بقدرها
          //    إن سبقت الاستحقاق، أو باقي القسط إن حلّ، وما فاض عنه بقدره (م٢٠/٢ · ق-٩٢٤). ولكلِّ جزءٍ قسطُه.
          for (const row of rows) {
            const accrued = await accrueForPaymentWithinTx(
              tx,
              companyId,
              accrualContract,
              treatment,
              { id: row.id, date: new Date(dto.date), grossInContractCurrency: row.amount, installmentId: row.installmentId },
              new Date(),
            );
            if (!accrued) throw new BadRequestException(MSG.rent_accrual_period_locked);
          }

          // ② الخصمُ تعديلُ مقابلٍ (ق-٩٢٧/٦): يُنقص الذمّةَ والصافيَ والضريبة — لا يُهمَل. وهو على قسط الجزء الأوّل.
          if (discount > 0) {
            const fresh = payment.installmentId
              ? await tx.installment.findUniqueOrThrow({
                  where: { id: payment.installmentId },
                  select: { id: true, baseAccruedGross: true, baseAccruedNet: true, baseAccruedTax: true, baseRecognized: true },
                })
              : null;
            const discountGross = discount;
            await discountAccrualWithinTx(tx, companyId, accrualContract, treatment, fresh, {
              date: new Date(dto.date),
              gross: discountGross,
              paymentId: payment.id,
            });
          }

          // ③ ثم القبضُ يسدّد الذمّة: نقدٌ بسعر يومه ⇄ `1200` بسعر العقد، وفرقُ الصرف على
          //    `5600` — كسند القبض على فاتورة (ق-٨٧١).
          const settlement = await postPartySettlementEntry(tx, companyId, {
            customerId: contract.customerId,
            side: 'RECEIVABLE',
            date: new Date(dto.date),
            memo: `قبض إيجار — عقد ${contract.no} — ${contract.tenant}`,
            baseCash: toBaseAmount(netAmount, payRate),
            baseSettled: baseExpected,
            cashAccountId: bank?.accountId ?? null,
            unitId: contract.unitId,
          });
          journalEntry = settlement;
          if (settlement) await tx.rentPayment.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { journalEntryId: settlement.id } });
        }

        // مرآةُ البنك/الصندوق — بعد أن يُعرف قيدُ القبض على المسارَين (رقمُه في الحركة).
        if (bank) {
          await tx.bank.update({ where: { id: bank.id }, data: { balance: { increment: netAmount } } });
          await tx.bankTransaction.create({
            data: {
              bankId: bank.id,
              // ⚖️ (البند ٥٩٩ · توجيه ٢٨٦ · `ق-١٥٨١`) العقدُ بلا فرع، فالمرآةُ بفرع الصندوق الذي قبض فيه، فلا يراها المقيَّدُ بفرعٍ آخر.
              branchId: bank.branchId ?? null,
              date: new Date(dto.date),
              description: `دفعة إيجار — عقد ${contract.no} — ${contract.tenant}`,
              amount: netAmount,
              source: 'rent',
              matched: !!journalEntry,
              entryNo: journalEntry?.no ?? null,
              currency: payCurrency,
              exchangeRate: payRate,
              baseAmount: toBaseAmount(netAmount, payRate),
            } as unknown as Prisma.BankTransactionUncheckedCreateInput,
          });
        }

        // لكلِّ قسطٍ مسَّه القبضُ حالُه — والقسطُ المقصودُ أوّلُها ولو لم يبقَ له شيء (فحالُه كما كانت تُشتقّ).
        const touched = [...new Set([installment?.id, ...rows.map((r) => r.installmentId)].filter((id): id is string => !!id))];
        for (const installmentId of touched) {
          const target = installmentId === installment?.id ? installment : await tx.installment.findUniqueOrThrow({ where: { id: installmentId } });
          // Accrual, aging and the VAT return never read this status; they follow the tax point.
          const status = await settledInstallmentStatus(tx, target, treatment);
          await tx.installment.update({
            where: { id: installmentId },
            // العدّادُ يُزاد بما اعتُرف به **في قيد القبض القائم وحده** — وصفرٌ على مسار
            // الاستحقاق (الاعترافُ هناك من الاستحقاق لا من القبض) وحين تخطّى الترحيل (ق-٤٦٨).
            data: { status, baseRecognized: { increment: installmentId === installment?.id ? earnedNow : 0 } },
          });
        }

        const first = await tx.rentPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { installment: true } });
        // وأجزاءُ القبض حين وُزّع — بأقساطها ومبالغها، فالشاشةُ تقول أين ذهب المال.
        return rows.length > 1 ? { ...first, spread: rows.map((r) => ({ paymentId: r.id, installmentId: r.installmentId, amount: money(r.amount) })) } : first;
      }),
    );
  }

  private async validateContract(tx: Prisma.TransactionClient, unit: Unit, property: Property, start: Date, end: Date, tenantName: string): Promise<void> {
    if (start > end) throw new BadRequestException(MSG.contract_start_after_end);

    if (property.activityType === 'residential' && property.activitySubtype && unit.subtype && unit.subtype !== property.activitySubtype) {
      throw new ConflictException(MSG.unit_subtype_mismatch);
    }
    if (property.ownership === 'leased' && property.leaseStart && property.leaseEnd) {
      if (start < property.leaseStart || end > property.leaseEnd) {
        throw new ConflictException(MSG.contract_outside_head_lease);
      }
    }

    await lockUnitForBooking(tx, unit.id);
    const overlapping = await tx.contract.findFirst({
      where: {
        unitId: unit.id,
        status: { not: 'CANCELLED' },
        start: { lte: end },
        end: { gte: start },
      },
    });
    if (overlapping) throw new ConflictException(formatMessage(MSG.contract_dates_overlap, { contractNo: overlapping.no }));

    await expireStaleReservations(tx);
    const activeRsv = await activeReservationForUnit(tx, unit.id);
    if (activeRsv && activeRsv.name.trim() !== tenantName.trim()) {
      throw new ConflictException(
        formatMessage(MSG.reservation_name_mismatch, {
          name: activeRsv.name,
          expiryDate: activeRsv.expiryDate.toISOString().slice(0, 10),
        }),
      );
    }
  }

  /**
   * **العميلُ الذي يصحّ ربطُ عقدٍ به** (`ق-١٠٢٨`/①): يُقرأ **بمعرّفه** داخل سياق المنشأة — فالغائبُ
   * والمحذوفُ ناعماً (يُخفيه الامتداد) `404`، والمؤرشَفُ `409` تسمّي المخرج. لا بحثَ بالاسم ولا
   * إنشاءَ ضمنيّاً — بابُ الإنشاء وحدةُ العملاء (حارسُه `no-name-linking.spec.ts`).
   */
  private async linkableCustomer(tx: Prisma.TransactionClient, customerId: string): Promise<{ id: string; name: string; phone: string | null }> {
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true, archived: true } });
    if (!customer) throw new NotFoundException(MSG.customer_not_found);
    if (customer.archived) throw new ConflictException(MSG.customer_archived_cannot_link);
    return { id: customer.id, name: customer.name, phone: customer.phone };
  }

  /**
   * Renews a lease: a **new** contract that carries the tenancy forward, linked
   * back to the one it replaces.
   *
   * Not an edit of the old contract. The expiring one keeps its own installments
   * and payment history — that record is what a dispute is settled against, and
   * stretching its dates would erase it.
   *
   * An early renewal, one that starts on or before the original's last day, ends
   * the original on the day before it starts, in the same transaction, and undoes
   * what the original billed after that day (`cutContractForEarlyRenewalWithinTx`).
   *
   * The renewal is created as UPCOMING when its term hasn't started yet: signed
   * and certain, unlike a DRAFT which may never happen. It becomes DUE by the
   * same date-driven refresh that already moves DUE to LATE.
   */
  async renew(tenant: TenantContext, id: string, dto: RenewContractDto) {
    const { companyId } = tenant;
    // Ending a contract early is what a cancellation does, so an early renewal needs the same permission.
    // Read outside the transaction because forActor opens its own.
    const canEndEarly = (await this.permissions.forActor(tenant)).grants.includes(grant('contracts', 'delete'));
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        // Locked before it is read, as in a cancellation: two renewals, or a renewal and a cancellation, cannot both cut it.
        await lockContractRow(tx, id);
        const source =await tx.contract.findUnique({ where: { id }, include: { unit: { include: { property: true } }, renewedTo: true } });
        if (!source) throw new NotFoundException(MSG.contract_not_found);
        if (source.status === 'CANCELLED') throw new ConflictException(MSG.contract_cancelled_cannot_renew);
        // The unique constraint would catch this too, but as an opaque 500.
        if (source.renewedTo) throw new ConflictException(formatMessage(MSG.contract_already_renewed, { contractNo: source.renewedTo.no }));

        const start = new Date(dto.start);
        const end = new Date(dto.end);
        if (start <= source.start) throw new BadRequestException(MSG.renewal_must_start_after_source);

        let creditDate = await companyToday(tx, companyId);
        if (start <= source.end) {
          if (!canEndEarly) throw new ForbiddenException(MSG.early_renewal_needs_cancel_permission);
          const cut = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 1));
          // A cut in the past is undone on the day it is recorded: a reduction of output VAT belongs to the period of the
          // event or of the credit note, whichever is later, and a past period may already be filed or closed.
          creditDate = cut > creditDate ? cut : creditDate;
          await cutContractForEarlyRenewalWithinTx(tx, companyId, source.id, cut, creditDate);
        }

        // The renewal is a real tenancy on the same unit, so it goes through
        // the same overlap and activity checks as any other contract — the
        // original included: it ends before the renewal starts, cut above when
        // the renewal is early.
        // The party is read from the customer card at renewal time, not from the original's text.
        const party = source.customerId ? await this.linkableCustomer(tx, source.customerId) : null;
        await this.validateContract(tx, source.unit, source.unit.property, start, end, party?.name ?? source.tenant);

        const value = dto.value ?? Number(source.value);
        const cycle = dto.cycle ?? source.cycle;
        // ⚖️ والمؤجّرُ يُعلَن في طلب التجديد على عقار التشغيل كالتصنيف (السؤال ٥٧٧) — لا يُورَّث: عقدٌ جديدٌ باسم من يُبرمه.
        const lessor = lessorFieldsFor(source.unit.property, dto, isTaxedKind(dto.classification));
        // ⚖️ ونسبةُ المختلط تُعلَن في التجديد ولا تُورَّث (السؤال ٤١٢).
        const mixedShare = mixedShareFieldsFor(dto.classification, dto);
        // التجديد: بادئته من بداية العقد **الجديد** لا الأصل — فهو مستندٌ قائم
        // بذاته بمدّته الخاصة.
        const no = dto.no?.trim() || (await this.nextContractNumber(tx, companyId, start));
        if (dto.no?.trim()) {
          const taken = await tx.contract.findFirst({ where: { no } });
          if (taken) throw new ConflictException(formatMessage(MSG.contract_no_taken, { contractNo: no }));
        }

        const exchangeRate = Number(source.exchangeRate);
        // ⚖️ رقمُ هويّة المستأجر يُحمل إلى التجديد بإعادة تشفيره لصفّه (توجيه ٢٨٦): الموضعُ يحمل معرّفَ العقد فلا يُنسخ النصّ.
        const renewedId = randomUUID();
        const created = await tx.contract.create({
          data: {
            id: renewedId,
            ...contractTenantIdData(companyId, renewedId, decryptContractTenantId(companyId, source) ?? undefined),
            unitId: source.unitId,
            customerId: source.customerId,
            no,
            ejarNo: dto.ejarNo ?? null,
            tenant: party?.name ?? source.tenant,
            phone: party?.phone ?? source.phone,
            value,
            cycle,
            start,
            end,
            // The agreed deposit figure carries over as-is; whether the money
            // itself moves is `carryDeposits` below.
            deposit: source.deposit,
            services: source.services,
            furnished: source.furnished,
            // يُعلَنان في طلب التجديد لا يُورَّثان من الأصل (ق-٨٩١).
            classification: dto.classification,
            vatInclusion: dto.vatInclusion,
            ...lessor,
            ...mixedShare,
            status: start > new Date() ? 'UPCOMING' : 'DUE',
            currency: source.currency,
            exchangeRate,
            baseValue: toBaseAmount(value, exchangeRate),
            renewedFromId: source.id,
          } as unknown as Prisma.ContractUncheckedCreateInput,
        });

        const schedule = generateInstallmentSchedule(start, end, value, cycle);
        await tx.installment.createMany({
          data: schedule.map((s) => ({
            contractId: created.id,
            dueDate: s.dueDate,
            amount: s.amount,
            // كسابقتها في `create` — الفترةُ تُثبَّت لا تُشتقّ (ق-٤٧٥/②).
            serviceStart: s.serviceStart,
            serviceEnd: s.serviceEnd,
            currency: source.currency,
            exchangeRate,
            baseAmount: toBaseAmount(s.amount, exchangeRate),
          })) as unknown as Prisma.InstallmentUncheckedCreateInput[],
        });

        // Carrying a deposit forward posts **nothing**: the cash never moved,
        // and the liability is the same one — only the lease it secures
        // changed. Refunding and re-collecting it on paper would invent two
        // cash movements that never happened.
        if (dto.carryDeposits ?? true) {
          await tx.contractDeposit.updateMany({
            where: { contractId: source.id, status: 'HELD' },
            data: { contractId: created.id },
          });
        }

        // The tenant's credit on the original is deducted from the renewal's installments before what is due is accrued,
        // so an installment reads what was deducted as a tax point already passed. After an early renewal the credit
        // includes rent received for days after the cut, and it moves on the same day as the cut's postings.
        await applyTenantCreditOnRenewalWithinTx(tx, companyId, source, created, creditDate);

        // كسابقتها في `create`: ما حلّ من جدول التجديد يُستحقّ في اللحظة نفسِها.
        await accrueDueWithinTx(tx, companyId, new Date(), created.id);

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: created.id }, include: CONTRACT_INCLUDE }));
        },
        ACCRUAL_TX_OPTIONS,
      ),
    );
  }

  /**
   * Creates a condition-of-unit form as a draft.
   *
   * Nothing is posted: a handover is a record of state, not a financial event.
   * What it feeds is the *argument* over a later deposit deduction.
   */
  createHandover(companyId: string, contractId: string, dto: CreateHandoverDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new NotFoundException(MSG.contract_not_found);

      const created = await tx.contractHandover.create({
        data: {
          contractId,
          type: dto.type,
          date: new Date(dto.date),
          electricityMeter: dto.electricityMeter?.trim() || null,
          waterMeter: dto.waterMeter?.trim() || null,
          notes: dto.notes?.trim() || null,
        } as unknown as Prisma.ContractHandoverUncheckedCreateInput,
      });

      await this.replaceHandoverItems(tx, created.id, dto.items);
      return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
    });
  }

  /** Draft only — see `assertHandoverEditable`. */
  updateHandover(companyId: string, contractId: string, handoverId: string, dto: UpdateHandoverDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const handover = await this.loadEditableHandover(tx, contractId, handoverId);

      await tx.contractHandover.update({
        where: { id: handover.id },
        data: {
          ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
          ...(dto.electricityMeter !== undefined ? { electricityMeter: dto.electricityMeter.trim() || null } : {}),
          ...(dto.waterMeter !== undefined ? { waterMeter: dto.waterMeter.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        },
      });

      if (dto.items) await this.replaceHandoverItems(tx, handover.id, dto.items);
      return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
    });
  }

  /**
   * Signs the form and freezes it.
   *
   * `signedAt` is the **server's** clock, never the caller's. A document whose
   * purpose is to be unarguable later cannot let one side choose the time it
   * claims to have been signed.
   *
   * ⚖️ **وعلى النموذج صورٌ ⟸ تُختم مدّةُ حفظها يومَ التوقيع، بلا إقرارٍ من الموظّف** (توجيه ٢٧٧ · `ق-١٦١٩`/ج، بحكم صاحب
   * المشروع: «الاستلامُ والتسليمُ والوحدةُ فارغة يكفيهما بندٌ في العقد، ولا يُطلب فيهما إقرارُ الموظّف … والصورُ لا تُحذف، وتبقى في
   * سجلّ العقد طوالَ مدّة الحفظ النظامية»). كان الإقرارُ شرطاً (`ق-١٦٠٠` · #718)؛ والمدّةُ تُختم كما كانت (ما يحفظه البند) ووقتُها وقتُ
   * التوقيع. **والصفُّ مقفولٌ** منذ القراءة (`loadEditableHandover`)، فصورةٌ تُرفع في اللحظة نفسِها تنتظر: تدخل قبله فتُعدّ، أو تُردّ بعده.
   */
  signHandover(companyId: string, contractId: string, handoverId: string, dto: SignHandoverDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const handover = await this.loadEditableHandover(tx, contractId, handoverId);
      const photos = await tx.handoverPhoto.count({ where: { handoverId: handover.id } });
      const years = RETENTION_YEARS.realEstate;

      const signedAt = new Date();
      await tx.contractHandover.update({
        where: { id: handover.id },
        data: {
          status: 'SIGNED',
          signedAt,
          signedBy: dto.signedBy.trim(),
          ...(photos > 0 ? { photoNoticeYears: years, photoNoticeAt: signedAt } : {}),
        },
      });

      return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
    });
  }

  /** Deleting is a draft-only operation for the same reason editing is. */
  async deleteHandover(companyId: string, contractId: string, handoverId: string) {
    const { photoKeys, refreshed } = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const handover = await this.loadEditableHandover(tx, contractId, handoverId);
      // صور المسودة تُحذف صفوفها بالتتالي — نلتقط مفاتيح كائناتها قبل ذلك
      // كي لا تبقى بايتاتها يتيمةً في التخزين (اكتشاف المراجعة).
      const photos = await tx.handoverPhoto.findMany({ where: { handoverId: handover.id }, select: { fileKey: true } });
      await tx.contractHandover.delete({ where: { id: handover.id } });
      const refreshed = this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
      return { photoKeys: photos.map((p) => p.fileKey), refreshed };
    });
    for (const key of photoKeys) {
      await this.files.remove(companyId, key).catch((e: Error) => this.logger.warn(`Could not delete handover photo object "${key}": ${e.message}`));
    }
    return refreshed;
  }

  /** The single gate every mutation goes through — one place to be wrong, and
   * one place to get right.
   *
   * 🔴 **ويقفل صفَّ النموذج قبل أن يقرأه** (توجيه ٢٧٧ · `ق-١٦١٩`/ج: «وقفلُ الصفّ بين رفع الصورة والتوقيع»): التعديلُ والحذفُ والتوقيعُ
   * ورفعُ الصورة وحذفُها كلُّها تمرّ بقفل الصفّ نفسِه (`handover-photos.service.ts`)، فلا يعدّ التوقيعُ صوراً تتغيّر تحته. */
  private async loadEditableHandover(tx: Prisma.TransactionClient, contractId: string, handoverId: string) {
    await tx.$queryRaw`SELECT "id" FROM "contract_handovers" WHERE "id" = ${handoverId} FOR UPDATE`;
    const handover = await tx.contractHandover.findUnique({ where: { id: handoverId } });
    if (!handover || handover.contractId !== contractId) throw new NotFoundException(MSG.handover_not_found);
    if (handover.status === 'SIGNED') throw new ConflictException(MSG.handover_signed_immutable);
    return handover;
  }

  private async replaceHandoverItems(tx: Prisma.TransactionClient, handoverId: string, items: HandoverItemDto[]) {
    // Photos hang off items by id, and this replace strategy re-creates every
    // item with a NEW id (onDelete: SetNull would silently orphan them —
    // caught in adversarial review). Remember which labels each photo pointed
    // at, and re-attach by label after the rebuild; a photo whose item was
    // truly removed degrades to a whole-form photo rather than vanishing.
    const linkedPhotos = await tx.handoverPhoto.findMany({
      where: { handoverId, itemId: { not: null } },
      select: { id: true, item: { select: { label: true } } },
    });

    await tx.handoverItem.deleteMany({ where: { handoverId } });

    if (items.length > 0) {
      await tx.handoverItem.createMany({
        data: items.map((i) => ({
          handoverId,
          label: i.label.trim(),
          condition: i.condition,
          note: i.note?.trim() || null,
        })) as unknown as Prisma.HandoverItemUncheckedCreateInput[],
      });
    }

    if (linkedPhotos.length > 0) {
      const fresh = await tx.handoverItem.findMany({ where: { handoverId }, select: { id: true, label: true } });
      const idByLabel = new Map(fresh.map((i) => [i.label, i.id]));
      for (const photo of linkedPhotos) {
        const newItemId = photo.item ? (idByLabel.get(photo.item.label) ?? null) : null;
        await tx.handoverPhoto.update({ where: { id: photo.id }, data: { itemId: newItemId } });
      }
    }
  }

  /**
   * Records key money — the lump sum paid for the right to a commercial
   * location, in whichever direction it went.
   *
   * Recorded per contract rather than as a contract field because a tenancy can
   * legitimately carry more than one (an initial payment and a top-up on
   * renewal), and each is its own cash movement with its own date.
   */
  recordKeyMoney(companyId: string, contractId: string, dto: RecordKeyMoneyDto, request?: KeyedRequest) {
    return onceForRequest(this.tenantPrisma, companyId, request, (tx, id) => this.replayedContract(tx, id), () =>
    retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) => recordKeyedRequest(tx, companyId, request, async () => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);

        // عملةُ التقبيل وسعرُها كمستندٍ يتبع العقد (توجيه ٢٧٤ · البند 1): لا سعرَ حرّاً لعملة الأساس، ولا ترثُ أجنبيةٌ سعرَ غيرها.
        const { currency, exchangeRate } = await resolveFollowingCurrency(tx, companyId, dto, { currency: contract.currency, exchangeRate: Number(contract.exchangeRate) });
        const baseAmount = toBaseAmount(dto.amount, exchangeRate);

        const journalEntry = await postKeyMoneyEntry(tx, companyId, {
          unitId: contract.unitId,
          customerId: contract.customerId,
          contractNo: contract.no,
          tenant: contract.tenant,
          date: new Date(dto.paidAt),
          baseAmount,
          received: dto.direction === 'RECEIVED',
        });

        await tx.contractKeyMoney.create({
          data: {
            contractId,
            direction: dto.direction,
            amount: dto.amount,
            note: dto.note?.trim() || null,
            currency,
            exchangeRate,
            baseAmount,
            paidAt: new Date(dto.paidAt),
            journalEntryId: journalEntry?.id ?? null,
          } as unknown as Prisma.ContractKeyMoneyUncheckedCreateInput,
        });

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
      })),
    ));
  }

  /**
   * Raises a claim against the tenant — a repair they caused, a utility bill
   * they left, a late fee.
   *
   * Posted immediately as a receivable: the demand exists from the moment it is
   * made, and holding it unposted until someone pays would leave the landlord's
   * books understating what they are owed.
   */
  createClaim(companyId: string, contractId: string, dto: CreateClaimDto, request?: KeyedRequest) {
    return onceForRequest(this.tenantPrisma, companyId, request, (tx, id) => this.replayedContract(tx, id), () =>
    retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) => recordKeyedRequest(tx, companyId, request, async () => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);

        // عملةُ المطالبة وسعرُها كمستندٍ يتبع العقد (توجيه ٢٧٤ · البند 1).
        const { currency, exchangeRate } = await resolveFollowingCurrency(tx, companyId, dto, { currency: contract.currency, exchangeRate: Number(contract.exchangeRate) });
        const baseAmount = toBaseAmount(dto.amount, exchangeRate);
        // ⚖️ معاملتُها الضريبية (السؤالان ٥١ و٤١٣): الخاضعةُ ضريبتُها فوق المبلغ بعملتها ثم بالدفتر.
        const treatment = claimTreatmentFor(dto);
        const taxAmount = treatment === 'TAXABLE_SERVICE' ? chargeTaxOn(dto.amount) : 0;
        const baseTax = toBaseAmount(taxAmount, exchangeRate);

        const journalEntry = await postClaimIssueEntry(tx, companyId, {
          unitId: contract.unitId,
          customerId: contract.customerId,
          contractNo: contract.no,
          tenant: contract.tenant,
          date: new Date(dto.issuedAt),
          baseAmount,
          kindLabel: CLAIM_KIND_LABEL[dto.kind as ClaimKind],
          treatment,
          baseTax,
        });

        await tx.contractClaim.create({
          data: {
            contractId,
            kind: dto.kind,
            amount: dto.amount,
            description: dto.description.trim(),
            currency,
            exchangeRate,
            baseAmount,
            taxTreatment: treatment,
            taxAmount,
            baseTax,
            onBehalfEvidence: treatment === 'ON_BEHALF' ? dto.onBehalfEvidence!.trim() : null,
            issuedAt: new Date(dto.issuedAt),
            journalEntryId: journalEntry?.id ?? null,
          } as unknown as Prisma.ContractClaimUncheckedCreateInput,
        });

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
      })),
    ));
  }

  /** Collects a claim in cash. Partial collection isn't supported: a claim is a
   * single agreed demand, and splitting one is better modelled as two claims. */
  payClaim(companyId: string, contractId: string, claimId: string, dto: PayClaimDto) {
    return this.settleClaim(companyId, contractId, claimId, 'PAID', new Date(dto.paidAt), null, dto.exchangeRate);
  }

  /** Writes a claim off. Reverses the income rather than deleting the claim —
   * it really was raised, and the audit trail has to show both facts. */
  waiveClaim(companyId: string, contractId: string, claimId: string, dto: WaiveClaimDto) {
    return this.settleClaim(companyId, contractId, claimId, 'WAIVED', new Date(dto.waivedAt), dto.reason.trim());
  }

  private settleClaim(
    companyId: string,
    contractId: string,
    claimId: string,
    status: 'PAID' | 'WAIVED',
    date: Date,
    waiveReason: string | null,
    cashDayRate?: number,
  ) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const claim = await tx.contractClaim.findUnique({ where: { id: claimId }, include: { contract: true } });
        if (!claim || claim.contractId !== contractId) throw new NotFoundException(MSG.claim_not_found);
        if (claim.status !== 'OPEN') throw new ConflictException(MSG.claim_already_settled);
        // نظيرُ تسوية الوديعة (البند 27 · `ق-١٥٧٥`): تحصيلان، أو تحصيلٌ وإسقاطٌ متزامنان، كانا يرحّلان قيدين.
        // فالمطالبةُ بشرط «مفتوحة» أوّلَ المعاملة، والثانيةُ تنتظر قفلَ الصفّ ثم تُردّ.
        const claimed = await tx.contractClaim.updateMany({ where: { id: claimId, contractId, status: 'OPEN' }, data: { status } });
        if (claimed.count === 0) throw new ConflictException(MSG.claim_already_settled);

        const posting = {
          unitId: claim.contract.unitId,
          customerId: claim.contract.customerId,
          contractNo: claim.contract.no,
          tenant: claim.contract.tenant,
          date,
          baseAmount: Number(claim.baseAmount),
          kindLabel: CLAIM_KIND_LABEL[claim.kind],
          // ⚖️ التحصيلُ والإسقاطُ بمعاملة الإنشاء نفسِها (الأسئلة ٥١ و٤١٣).
          treatment: claim.taxTreatment,
          baseTax: Number(claim.baseTax),
        };
        // ⚖️ (`ق-١٤٨٩` · B7) نقدُ التحصيل لمطالبةٍ بعملةٍ أجنبية بسعر يومه — والذمّةُ بسعر إصدارها، والفرقُ على `5600`.
        //    والإسقاطُ لا نقدَ فيه فلا سعرَ له. والنقدُ إجماليُّها (الخاضعةُ بضريبتها).
        const baseCash =
          status === 'PAID' && (await isForeignCurrency(tx, companyId, claim.currency))
            ? toBaseAmount(Number(claim.amount) + Number(claim.taxAmount), requireCashDayRate(claim.currency, cashDayRate))
            : undefined;
        const entry = status === 'PAID' ? await postClaimPaymentEntry(tx, companyId, { ...posting, baseCash }) : await postClaimWaiverEntry(tx, companyId, posting);

        await tx.contractClaim.update({
          where: { id: claimId },
          data: { status, settledAt: date, waiveReason, settlementEntryId: entry?.id ?? null },
        });

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
      }),
    );
  }

  /**
   * Records a deposit the tenant has actually handed over, and posts it as a
   * liability.
   *
   * `Contract.deposit` remains what was *agreed*; this is what was *received*.
   * The two are separate on purpose — a contract can be signed with a deposit
   * owed but not yet paid, and only the second belongs in the ledger.
   */
  recordDeposit(companyId: string, contractId: string, dto: RecordDepositDto, request?: KeyedRequest) {
    // Retries on a journal-entry "no" collision from a concurrent posting.
    return onceForRequest(this.tenantPrisma, companyId, request, (tx, id) => this.replayedContract(tx, id), () =>
    retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) => recordKeyedRequest(tx, companyId, request, async () => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);

        // A deposit defaults to the contract's currency and rate, since it is
        // part of the same deal, but may carry its own — measured like a new
        // document (توجيه ٢٧٤ · البند 1): no free rate for the base currency,
        // and a foreign currency without a rate does not inherit the contract's.
        const { currency, exchangeRate } = await resolveFollowingCurrency(tx, companyId, dto, { currency: contract.currency, exchangeRate: Number(contract.exchangeRate) });
        const baseAmount = toBaseAmount(dto.amount, exchangeRate);

        // Only a deposit the company actually holds hits the ledger. One
        // blocked on Ejar is tracked here so it shows on the contract and can
        // be settled later, but the company neither received cash nor owes it
        // back — the platform is the custodian.
        const holder = dto.holder ?? 'COMPANY';
        const journalEntry =
          holder === 'COMPANY'
            ? await postDepositReceiptEntry(tx, companyId, {
                unitId: contract.unitId,
                customerId: contract.customerId,
                contractNo: contract.no,
                tenant: contract.tenant,
                date: new Date(dto.receivedAt),
                baseAmount,
                typeLabel: DEPOSIT_TYPE_LABEL[dto.type as DepositType],
              })
            : null;

        await tx.contractDeposit.create({
          data: {
            contractId,
            type: dto.type,
            holder,
            amount: dto.amount,
            currency,
            exchangeRate,
            baseAmount,
            receivedAt: new Date(dto.receivedAt),
            note: dto.note,
            journalEntryId: journalEntry?.id ?? null,
          } as unknown as Prisma.ContractDepositUncheckedCreateInput,
        });

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
      })),
    ));
  }

  /**
   * Closes a deposit out: itemized deductions, and whatever is left goes back
   * to the tenant.
   *
   * Settling twice is refused rather than allowed to post a second entry — the
   * liability only exists once, and a repeat would credit cash the landlord
   * never paid.
   */
  settleDeposit(companyId: string, contractId: string, depositId: string, dto: SettleDepositDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const deposit = await tx.contractDeposit.findUnique({ where: { id: depositId }, include: { contract: true } });
        if (!deposit || deposit.contractId !== contractId) throw new NotFoundException(MSG.deposit_not_found);
        if (deposit.status === 'SETTLED') throw new ConflictException(MSG.deposit_already_settled);
        // ⚖️ معاملةُ كلِّ خصمٍ قبل أيّ أثر (السؤال ٤١٤): ما لا يصحّ يُردّ برسالته ولا يُكتب شيء.
        const treatments = dto.deductions.map((d) => deductionTreatmentFor(d));
        // ⚖️ **المطالبةُ أوّلَ المعاملة لا آخرَها** (البند 27 من مراجعة 3.3 · `ق-١٥٧٥`): الفحصُ أعلاه قراءةٌ عادية،
        //    فتسويتان متزامنتان كانتا تقرآن «غيرَ مسوّاة» وترحّلان القيدَ مرّتين ثم يكتب الثاني فوق الأوّل، و`settlementEntryId`
        //    الفريدُ لا يمنع لأن لكلٍّ قيدَه. فالحالُ تُكتب هنا بشرطها: الثانيةُ تنتظر قفلَ الصفّ ثم لا تجد ما تطالب به فتُردّ.
        const claimed = await tx.contractDeposit.updateMany({ where: { id: depositId, contractId, status: { not: 'SETTLED' } }, data: { status: 'SETTLED' } });
        if (claimed.count === 0) throw new ConflictException(MSG.deposit_already_settled);

        const held = Number(deposit.amount);
        // Rounded at every accumulation: two 2-decimal amounts can sum to a
        // float like 300.00000000000006 and spuriously exceed the deposit.
        const deducted = sumMoney(dto.deductions.map((d) => d.amount));
        if (deducted > held) {
          throw new BadRequestException(formatMessage(MSG.deductions_exceed_deposit, { held: formatMoney(held) }));
        }
        const settledAt = new Date(dto.settledAt);
        const unpaidRent = sumMoney(dto.deductions.filter((d) => d.kind === 'UNPAID_RENT').map((d) => d.amount));
        const rentPlan = unpaidRent > 0 ? await this.planUnpaidRentDeduction(tx, deposit, unpaidRent, settledAt) : null;

        const rate = Number(deposit.exchangeRate);
        const amountFor = (target: 'receivable' | 'income') =>
          sumMoney(dto.deductions.filter((d) => deductionTarget(d.kind as DeductionKind) === target).map((d) => d.amount));
        const receivableAmount = amountFor('receivable');
        const incomeAmount = amountFor('income');

        const refund = round2(held - deducted);
        // An Ejar-held deposit has no liability to clear — only what the
        // platform releases to the company gets posted.
        const heldByCompany = deposit.holder === 'COMPANY';

        // ⚖️ (`ق-١٤٨٩` · B8) **كلُّ جزءٍ بسعره، والفرقُ على `5600` لا في `1000`**:
        //   · الالتزامُ `2300` بسعر الوديعة كما قُيِّد، وأجزاؤه بسعرها تساويه بالضبط (`splitAtDepositRate` — البندُ ٢٩)؛
        //   · النقدُ — ردُّ المحتجَز أو ما تُفرج عنه إيجار — بسعر يوم التسوية لوديعةٍ بعملةٍ أجنبية، ولا سعرَ يُفترض؛
        //   · وخصمُ الذمّة يُقيَّد `1200` دائناً **بسعر العقد** حين تكون الوديعةُ بعملته — فهو سعرُ الذمّة التي يسدّدها،
        //     وبسعر الوديعة يترك في `1200` رصيداً يتيماً (القياس B8 ج).
        //   ولوديعةٍ بعملة الأساس يعود كلُّ ذلك إلى القيد القائم حرفاً: سعرٌ واحد، ولا بقيّةَ تقريب، ولا فرق.
        const foreign = await isForeignCurrency(tx, companyId, deposit.currency);
        const cashMoves = heldByCompany ? refund > 0 : deducted > 0;
        const dayRate = foreign && cashMoves ? requireCashDayRate(deposit.currency, dto.exchangeRate) : null;
        const atDepositRate = heldByCompany
          ? splitAtDepositRate(Number(deposit.baseAmount), { receivable: receivableAmount, income: incomeAmount, refund }, rate)
          : { receivable: toBaseAmount(receivableAmount, rate), income: toBaseAmount(incomeAmount, rate), refund: 0 };
        const againstReceivable =
          foreign && sameCurrency(deposit.currency, deposit.contract.currency)
            ? toBaseAmount(receivableAmount, Number(deposit.contract.exchangeRate))
            : atDepositRate.receivable;
        const refundCash = heldByCompany && dayRate !== null ? toBaseAmount(refund, dayRate) : atDepositRate.refund;
        const awardedCash = !heldByCompany && dayRate !== null ? toBaseAmount(deducted, dayRate) : undefined;
        // ربحُ الصرف: ما خرج من الالتزام بسعر الوديعة مطروحاً منه ما قُيِّد بسعره هو (للمحتجَز)، أو النقدُ الداخلُ مطروحاً
        // منه ما سوّاه (لما في إيجار) — والدخلُ بسعر الوديعة في الحالين فلا يدخل الفرق.
        const fxGain = heldByCompany
          ? round2(atDepositRate.receivable - againstReceivable + (atDepositRate.refund - refundCash))
          : round2((awardedCash ?? round2(atDepositRate.receivable + atDepositRate.income)) - againstReceivable - atDepositRate.income);

        // ⚖️ **جزءُ الدخل بمعاملته** (السؤال ٤١٤): لكلِّ خصمٍ خاضعٍ صافيه وضريبتُه من إجماليّه بسعر الوديعة (`chargeTaxIn`)،
        //    ولكلِّ خصمٍ نيابةً مبلغُه إلى `1260`؛ و`4300` يحمل الباقي من جزء الدخل كلِّه (الضررُ والتعويضُ وصافي الخاضع وبقيّةُ
        //    التقريب) — فالقيدُ يتوازن بالبناء، ومجموعُ ضريبة الأسطر هو ما يُقيَّد على `2200` ويقرؤه الإقرار.
        const rows = dto.deductions.map((d, i) => {
          const treatment = treatments[i];
          const base = toBaseAmount(d.amount, rate);
          const tax = treatment === 'TAXABLE_SERVICE' ? chargeTaxIn(base) : 0;
          return { d, treatment, base, tax };
        });
        const incomeTax = round2(rows.reduce((s, r) => s + r.tax, 0));
        const onBehalf = round2(rows.filter((r) => r.treatment === 'ON_BEHALF').reduce((s, r) => s + r.base, 0));

        const settlementEntry = await postDepositSettlementEntry(tx, companyId, {
          unitId: deposit.contract.unitId,
          customerId: deposit.contract.customerId,
          contractNo: deposit.contract.no,
          tenant: deposit.contract.tenant,
          date: new Date(dto.settledAt),
          heldByCompany,
          baseAmount: Number(deposit.baseAmount),
          againstReceivable,
          againstIncome: round2(atDepositRate.income - incomeTax - onBehalf),
          againstIncomeTax: incomeTax,
          againstOnBehalf: onBehalf,
          refund: refundCash,
          typeLabel: DEPOSIT_TYPE_LABEL[deposit.type],
          awardedCash,
          fxGain,
        });

        if (dto.deductions.length > 0) {
          await tx.depositDeduction.createMany({
            data: rows.map(({ d, treatment, base, tax }) => ({
              depositId,
              kind: d.kind,
              amount: d.amount,
              reason: d.reason,
              taxTreatment: treatment,
              baseNet: treatment === 'TAXABLE_SERVICE' ? round2(base - tax) : null,
              baseTax: tax,
              onBehalfEvidence: treatment === 'ON_BEHALF' ? d.onBehalfEvidence!.trim() : null,
            })) as unknown as Prisma.DepositDeductionUncheckedCreateInput[],
          });
        }
        // The cash side of the rent part is the deposit at its own rate, or what Ejar releases at the day's rate.
        if (rentPlan) await this.applyUnpaidRentDeduction(tx, companyId, depositId, rentPlan, settledAt, heldByCompany ? rate : (dayRate ?? rate));

        await tx.contractDeposit.update({
          where: { id: depositId },
          data: {
            status: 'SETTLED',
            settledAt: new Date(dto.settledAt),
            refundAmount: refund,
            settlementEntryId: settlementEntry?.id ?? null,
          },
        });

        return this.withComputedFigures(await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE }));
      }, ACCRUAL_TX_OPTIONS),
    );
  }

  /**
   * Refuses unpaid rent above what the tenant owes on the contract, before anything is written. Rent counts where it is
   * the company's receivable: installments due by the settlement date, or all open ones once the cancellation billed them.
   */
  private async planUnpaidRentDeduction(
    tx: Prisma.TransactionClient,
    deposit: { id: string; currency: string; contract: Contract },
    amount: number,
    settledAt: Date,
  ): Promise<UnpaidRentPlan> {
    const contract = deposit.contract;
    // Rent is received only in its contract currency, from a deposit as from a payment.
    if (!sameCurrency(deposit.currency, contract.currency)) {
      throw new BadRequestException(formatMessage(MSG.rent_payment_currency_mismatch, { payment: deposit.currency, contract: contract.currency }));
    }
    const accrual = await tx.contract.findUniqueOrThrow({ where: { id: contract.id }, select: ACCRUAL_CONTRACT_SELECT });
    const treatment = treatmentOf(accrual);
    const rentOwed = treatment !== null && !treatment.managed;
    const cancelled = contract.status === 'CANCELLED';
    const open = treatment && rentOwed ? await openRentInstallments(tx, contract.id, treatment, cancelled ? undefined : settledAt) : [];
    const dueRent = sumMoney(open.map((i) => Math.max(0, i.remaining)));
    const toRent = round2(Math.min(amount, dueRent));
    const rest = round2(amount - toRent);
    if (rest > 0) {
      const other = await this.otherOwedOnContract(tx, contract, deposit.id);
      if (rest > other) {
        if (!rentOwed && other === 0) throw new BadRequestException(MSG.deposit_unpaid_rent_not_receivable);
        throw new BadRequestException(formatMessage(MSG.deposit_unpaid_rent_exceeds_due, { due: formatMoney(round2(dueRent + other)) }));
      }
    }
    return { contract: accrual, treatment, toRent, cancelled };
  }

  /**
   * What the tenant owes on the contract outside its installments, in the contract currency: open claims and the
   * cancellation settlement, less what earlier deposits took as unpaid rent beyond the installments they paid.
   */
  private async otherOwedOnContract(tx: Prisma.TransactionClient, contract: Contract, depositId: string): Promise<number> {
    const rate = Number(contract.exchangeRate) || 1;
    const claims = await tx.contractClaim.findMany({
      where: { contractId: contract.id, status: 'OPEN' },
      select: { amount: true, taxAmount: true, currency: true, baseAmount: true, baseTax: true },
    });
    const onClaims = sumMoney(
      claims.map((c) =>
        sameCurrency(c.currency, contract.currency) ? round2(Number(c.amount) + Number(c.taxAmount)) : round2((Number(c.baseAmount) + Number(c.baseTax)) / rate),
      ),
    );
    const settlement = contract.status === 'CANCELLED' ? Number(contract.settlementAmount ?? 0) : 0;
    const earlier = await tx.contractDeposit.findMany({
      where: { contractId: contract.id, status: 'SETTLED', id: { not: depositId } },
      select: { deductions: { where: { kind: 'UNPAID_RENT' }, select: { amount: true } }, rentPayments: { select: { netAmount: true } } },
    });
    const takenBeyondRent = sumMoney(
      earlier.map((d) => round2(sumMoney(d.deductions.map((x) => Number(x.amount))) - sumMoney(d.rentPayments.map((p) => Number(p.netAmount))))),
    );
    return round2(Math.max(0, onClaims + settlement - takenBeyondRent));
  }

  /**
   * A payment without cash, linked to the deposit, on each installment the unpaid rent pays, oldest due first. The
   * deposit settlement entry already credits 1200 for it; only billing an installment not billed yet is posted here.
   */
  private async applyUnpaidRentDeduction(tx: Prisma.TransactionClient, companyId: string, depositId: string, plan: UnpaidRentPlan, settledAt: Date, rate: number) {
    const { contract, treatment } = plan;
    if (plan.toRent <= 0 || !treatment) return;
    const parts = await spreadRentPayment(tx, contract.id, treatment, null, plan.toRent);
    // What fell due by a settlement date still to come is billed on its due date, as the daily sweep would.
    const asOf = settledAt.getTime() > Date.now() ? settledAt : new Date();
    for (const part of parts) {
      // The plan caps the amount at the open installments, so a part without one means the two disagree.
      if (part.installmentId === null) throw new Error(`unpaid rent of deposit ${depositId} reached past the open installments`);
      const base = toBaseAmount(part.amount, rate);
      const row = await tx.rentPayment.create({
        data: {
          contractId: contract.id,
          installmentId: part.installmentId,
          depositId,
          date: settledAt,
          amount: part.amount,
          discount: 0,
          netAmount: part.amount,
          method: 'CASH',
          currency: contract.currency,
          exchangeRate: rate,
          baseAmount: base,
          baseDiscount: 0,
          baseNetAmount: base,
        } as unknown as Prisma.RentPaymentUncheckedCreateInput,
      });
      // A cancelled contract was billed by its cancellation, the installments it keeps included.
      if (!plan.cancelled) {
        const billed = await accrueForPaymentWithinTx(
          tx,
          companyId,
          contract,
          treatment,
          { id: row.id, date: settledAt, grossInContractCurrency: part.amount, installmentId: part.installmentId },
          asOf,
        );
        if (!billed) throw new BadRequestException(MSG.rent_accrual_period_locked);
      }
      const target = await tx.installment.findUniqueOrThrow({ where: { id: part.installmentId } });
      await tx.installment.update({ where: { id: target.id }, data: { status: await settledInstallmentStatus(tx, target, treatment) } });
    }
  }

  /** `EJ-<year>-<seq>`, same max-based scheme as invoice/purchase/journal
   * numbering — see InvoicesService.nextInvoiceNumber for why count() would
   * be wrong here. */
  /**
   * بادئة رقم العقد من **`startDate`** — قرار المالك 2026-08-15.
   *
   * ولا تاريخ توقيع في نموذج العقد أصلاً (`create-contract.dto.ts` يحمل `start`
   * و`end` لا غير). والحجّة: **تاريخ العقد الفعلي الذي يعرفه الطرفان ويظهر في
   * المستند — ولا يعتمد على ساعة الخادم إطلاقاً.**
   *
   * ⚠️ و`signedAt` بندٌ مسجَّل بلا بدء (نماذج التسليم والتوقيع الرقمي). **وحين
   * يُضاف لا تنتقل البادئة إليه تلقائياً** — تغييرُ أساس الترقيم بعد إصدار أرقام
   * قرارٌ مستقل يُعاد فتحه، لا أثرٌ جانبي لحقلٍ جديد.
   */
  private async nextContractNumber(tx: Prisma.TransactionClient, companyId: string, startDate: Date): Promise<string> {
    // عدّادٌ ذرّيّ لا مسحُ سنة (ق-٣٢٨) — والبذرُ من أعلى قائمٍ مرّةً واحدة.
    return nextDocumentNumber(tx, companyId, startDate, { kind: 'EJ', pad: 4 }, (prefix) => highestSequenceOf(tx.contract, prefix));
  }

  /** Lazily flips DUE -> LATE for any installment whose due date has passed
   * — matches the mockup's `refreshInstallmentStatuses`, called on every
   * read rather than via a background job. */
  private async refreshInstallmentStatuses(tx: Prisma.TransactionClient, contractId?: string): Promise<void> {
    await tx.installment.updateMany({
      where: { status: 'DUE', dueDate: { lt: new Date() }, ...(contractId ? { contractId } : {}) },
      data: { status: 'LATE' },
    });

    // An UPCOMING renewal becomes live the day its term starts. Driven by the
    // same lazy read-time refresh as the line above rather than a scheduled
    // job — a contract that only turns active when someone happens to look at
    // it is still correct, because nothing reads it without going through here.
    await tx.contract.updateMany({
      where: { status: 'UPCOMING', start: { lte: new Date() }, ...(contractId ? { id: contractId } : {}) },
      data: { status: 'DUE' },
    });
  }

  /**
   * Paginated, slim list — contract row + unit/property only, never the full
   * sub-tree. The old shape (every contract with all installments, payments,
   * deposits, claims, key money and handovers) grew linearly with portfolio
   * size and blew the tenant transaction's 5s timeout at ~1,300 contracts
   * (~12 MB of JSON). The detail modal loads one contract's sub-tree via
   * findOne, which keeps CONTRACT_INCLUDE.
   *
   * Statuses stay mockup-faithful: the same lazy refresh runs first, and each
   * row's `status` is the stored, freshly-refreshed value — nothing is
   * computed per row.
   */
  private async listRefreshed(tx: Prisma.TransactionClient, query: ListContractsQueryDto) {
    await this.refreshInstallmentStatuses(tx);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.search?.trim();
    const where: Prisma.ContractWhereInput = q
      ? {
          OR: [
            { tenant: { contains: q, mode: 'insensitive' } },
            { no: { contains: q, mode: 'insensitive' } },
            { unit: { unitNo: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {};

    // Sequential on purpose: an interactive transaction runs on a single
    // connection, so concurrent queries on `tx` would only race for it.
    const total = await tx.contract.count({ where });
    const rows = await tx.contract.findMany({
      where,
      include: { unit: { include: { property: true } }, customer: { select: { id: true, name: true, phone: true, archived: true } } },
      // ترتيبٌ تامّ لا جزئيّ (`ق-٣٥٦`) — `start` بدقّة اليوم فيتعادل، و`id` يحسم.
      orderBy: [{ start: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // الاسمُ والهاتفُ من بطاقة العميل عند القراءة (`ق-١٠٢٨`/⑥) — والبحثُ أعلاه على الذاكرة المشتقّة
    // التي تُحدَّث مع تعديل العميل، فلا تتخلّف إلا لعقودٍ افترقت قبل هذا البناء.
    // ⚖️ والقائمةُ بلا نصِّ هويّة المستأجر المشفَّر ولا بصمته (توجيه ٢٨٦) — `tenantIdOnFile` وحدَها.
    const items = rows.map((r) => publicContract(withPartyFromCustomer(r)));

    return { items, total, page, pageSize };
  }
}
