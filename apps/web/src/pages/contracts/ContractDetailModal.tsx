import { badgeOf } from '../../lib/statusBadge';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Bank } from '../../api/banks';
import {
  cancelContract,
  getContract,
  recordPayment,
  renewContract,
  updateContract,
  type CancelContractInput,
  type Contract,
  type DeclaredClassification,
  type DeclaredVatInclusion,
  type InstallmentStatus,
  type RecordPaymentInput,
  type RecordPaymentMethod,
  type RentPayment,
  type RentPaymentMethod,
  type RenewContractInput,
  type SettlementBasis,
} from '../../api/contracts';
import { usePermissions } from '../../auth/PermissionsContext';
import { dfmt, fmt, today } from '../../lib/format';
import { formatMoney, num0, round2, type MoneyText } from '../../lib/money';
import { STANDARD_VAT_GROSS_FACTOR, standardVatIncludedIn, standardVatIncludedInShare, standardVatOnShare } from '../../lib/vat';
import { AttachmentsSection } from './AttachmentsSection';
import { ClaimsSection } from './ClaimsSection';
import { FeesSection } from './FeesSection';
import { DepositsSection } from './DepositsSection';
import { HandoversSection } from './HandoversSection';
import { KeyMoneySection } from './KeyMoneySection';
import { LessorFields, lessorPayload, type DeclaredLessorChoice } from './LessorFields';
import { newRequestKey } from '../../api/idempotency';
import { CLASSIFICATION_LABEL, CLASSIFICATION_OPTIONS, CYCLE_LABEL, VAT_INCLUSION_LABEL, VAT_INCLUSION_OPTIONS, isLegacyContract, isTaxedClassification, taxedShareOf } from './contractMeta';
import { MixedShareFields, mixedSharePayload } from './MixedShareFields';
import i18n from '../../i18n';

const INSTALLMENT_STATUS_META: Record<InstallmentStatus, { label: string; badgeClass: string }> = {
  DUE: { get label() { return i18n.t('contracts.detail.installment_status.due'); }, badgeClass: 'due' },
  LATE: { get label() { return i18n.t('contracts.detail.installment_status.late'); }, badgeClass: 'overdue' },
  // Partly paid: derived on the server from what was received against the gross; the rest is collected from the same button.
  PARTIAL: { get label() { return i18n.t('contracts.detail.installment_status.partial'); }, badgeClass: 'due' },
  PAID: { get label() { return i18n.t('contracts.detail.installment_status.paid'); }, badgeClass: 'paid' },
  CANCELLED: { get label() { return i18n.t('contracts.detail.installment_status.cancelled'); }, badgeClass: 'draft' },
};

/**
 * Payment method for every value of its column, so a card payment is never
 * read as a bank transfer. `Record` makes the compiler require each value: a
 * value added to the type fails the build until it is named here.
 */
const RENT_PAYMENT_METHOD_LABEL: Record<RentPaymentMethod, string> = {
  get CASH() { return i18n.t('contracts.detail.payment_method.cash'); },
  get BANK() { return i18n.t('contracts.detail.payment_method.bank'); },
  get CARD() { return i18n.t('contracts.detail.payment_method.card'); },
};

/** Where a payment came from. A deduction from the tenant credit or the deposit is not a collection today, so it is never shown as cash. */
export function paymentSourceLabel(p: Pick<RentPayment, 'method' | 'creditFromContractId' | 'depositId'>): string {
  if (p.creditFromContractId) return i18n.t('contracts.detail.credit_deduction');
  if (p.depositId) return i18n.t('contracts.detail.deposit_deduction');
  return RENT_PAYMENT_METHOD_LABEL[p.method] ?? p.method;
}

/** The contract fields that decide whether VAT applies and whether it is included. */
type TaxedContract = { classification: string; vatInclusion: string; exemptSharePercent?: string | null };

/**
 * The installment gross as a number: taxable exclusive adds 15%, mixed adds 15%
 * of its taxable part, anything else is the amount itself (rounding only through `lib/money`).
 */
function grossNumberOf(contract: TaxedContract, amount: string | number): number {
  const a = Number(amount);
  const share = taxedShareOf(contract);
  if (share === 0 || contract.vatInclusion !== 'EXCLUSIVE') return round2(a);
  return share === 1 ? round2(a * STANDARD_VAT_GROSS_FACTOR) : round2(a + round2(standardVatOnShare(round2(a * share))));
}

/**
 * The suggestion for a partly paid installment is the remainder, not the whole
 * installment: the gross with VAT less what was received on it (net payment plus
 * its discount, as the server derives the status). An installment with nothing
 * received keeps its full suggestion.
 */
function suggestedRemainingGross(
  contract: TaxedContract,
  installment: { id: string; amount: string | number; gross?: MoneyText; settled?: MoneyText; remaining?: MoneyText } | undefined,
): string {
  if (!installment) return '';
  // Gross, settled and remaining come from the server with the contract; computing them here
  // got operated properties wrong (no VAT on them). A contract from a list without them falls back to the screen's gross.
  const gross = installment.gross !== undefined ? num0(installment.gross) : grossNumberOf(contract, installment.amount);
  const settled = num0(installment.settled);
  const remaining = installment.remaining !== undefined ? num0(installment.remaining) : round2(gross - settled);
  return formatMoney(settled > 0 && remaining > 0 ? remaining : gross);
}

/** The statement on the payment screen: inclusive, exclusive or exempt, with its figures. */
function paymentDeclaration(contract: TaxedContract, amount: string | number | undefined): string | null {
  if (amount === undefined || amount === null || amount === '') return null;
  const a = Number(amount);
  if (contract.classification === 'RESIDENTIAL') return i18n.t('contracts.detail.declaration.residential', { amount: formatMoney(a) });
  const share = taxedShareOf(contract);
  if (share === 0) return i18n.t('contracts.detail.declaration.unclassified');
  // Mixed: VAT is on its taxable part only, so that is said before the figures.
  const mixed = share < 1 ? i18n.t('contracts.detail.declaration.mixed', { percent: String(contract.exemptSharePercent) }) : '';
  if (contract.vatInclusion === 'INCLUSIVE') {
    const tax = share === 1 ? round2(standardVatIncludedIn(a)) : round2(standardVatIncludedInShare(a, share));
    return i18n.t('contracts.detail.declaration.inclusive', { mixed, amount: formatMoney(a), net: formatMoney(round2(a - tax)), tax: formatMoney(tax) });
  }
  if (contract.vatInclusion === 'EXCLUSIVE') {
    const tax = round2(standardVatOnShare(round2(a * share)));
    return i18n.t('contracts.detail.declaration.exclusive', { mixed, amount: formatMoney(a), tax: formatMoney(tax), gross: formatMoney(round2(a + tax)) });
  }
  return i18n.t('contracts.detail.declaration.undeclared');
}

function PaymentForm({
  banks,
  defaultAmount,
  declaration,
  onCancel,
  onSubmit,
}: {
  banks: Bank[];
  defaultAmount: string;
  /** Inclusive and exclusive are stated on the payment screen, so the suggestion reads as a gross, not an installment. */
  declaration?: string | null;
  onCancel: () => void;
  onSubmit: (dto: RecordPaymentInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(defaultAmount);
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState<RecordPaymentMethod>('CASH');
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  // Which cash box took a cash receipt. Optional and defaults to none, so cash
  // payments keep working exactly as before unless a box is chosen.
  const [cashBoxId, setCashBoxId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (method === 'BANK' && !bankId) {
      setError(i18n.t('err_bank_required'));
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        date,
        amount: parseFloat(amount) || 0,
        discount: parseFloat(discount) || undefined,
        method,
        // A bank transfer names the account; a cash receipt may name the branch
        // cash box that took it (optional — omitted keeps the old behaviour).
        bankId: method === 'BANK' ? bankId : cashBoxId || undefined,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_payment_record'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
      {declaration && (
        <p className="hint" style={{ marginBottom: 8 }}>
          {declaration}
        </p>
      )}
      <div className="two-col">
        <div className="field">
          <label>{t('contracts.detail.payment.date')}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('contracts.detail.payment.amount')}</label>
          <input className="num" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label>{t('contracts.detail.payment.discount')}</label>
          <input className="num" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label>{t('contracts.detail.payment.method')}</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as RecordPaymentMethod)}>
            <option value="CASH">{t('contracts.detail.payment_method.cash')}</option>
            <option value="BANK">{t('contracts.detail.payment_method.bank')}</option>
          </select>
        </div>
      </div>
      {method === 'BANK' && (
        <div className="field">
          <label>{t('contracts.detail.payment.bank_account')}</label>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {method === 'CASH' && banks.length > 0 && (
        <div className="field">
          <label>{t('contracts.detail.payment.cash_box')}</label>
          <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)}>
            <option value="">{t('contracts.detail.payment.no_cash_box')}</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <p className="hint">{t('contracts.detail.payment.cash_box_hint')}</p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          {t('contracts.detail.cancel')}
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {t('contracts.detail.payment.record')}
        </button>
      </div>
    </div>
  );
}

const SETTLEMENT_BASIS_LABEL: Record<SettlementBasis, string> = {
  get none() { return i18n.t('contracts.detail.settlement_basis.none'); },
  get amount() { return i18n.t('contracts.detail.settlement_basis.amount'); },
  get installments() { return i18n.t('contracts.detail.settlement_basis.installments'); },
  get all() { return i18n.t('contracts.detail.settlement_basis.all'); },
};

export function CancelForm({ contract, onCancel, onSubmit }: { contract: Contract; onCancel: () => void; onSubmit: (dto: CancelContractInput) => Promise<void> }) {
  const { t } = useTranslation();
  const [cancelDate, setCancelDate] = useState(today());
  const [cancelReason, setCancelReason] = useState('');
  const [installmentDisposition, setInstallmentDisposition] = useState<'keep' | 'cancel'>('cancel');
  const [settlementBasis, setSettlementBasis] = useState<SettlementBasis>('none');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementInstallments, setSettlementInstallments] = useState('1');
  const [lines, setLines] = useState<{ label: string; amount: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Previewed here so the user sees the figure before agreeing to it — the
   * server recomputes it from the same rows, so this is a display aid, never
   * the source of truth. */
  const unpaidFromCancelDate = contract.installments
    .filter((i) => (i.status === 'DUE' || i.status === 'LATE') && i.dueDate >= cancelDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const previewedSettlement =
    settlementBasis === 'amount'
      ? parseFloat(settlementAmount) || 0
      : settlementBasis === 'installments'
        ? unpaidFromCancelDate.slice(0, parseInt(settlementInstallments, 10) || 0).reduce((sum, i) => sum + Number(i.amount), 0)
        : settlementBasis === 'all'
          ? unpaidFromCancelDate.reduce((sum, i) => sum + Number(i.amount), 0)
          : 0;

  // Settling from the installments charges them already, so the server refuses keeping them due as well.
  const settlesFromInstallments = settlementBasis === 'installments' || settlementBasis === 'all';
  const disposition = settlesFromInstallments ? 'cancel' : installmentDisposition;

  async function submit() {
    setError(null);
    if (!cancelReason.trim()) {
      setError(i18n.t('err_cancel_reason_required'));
      return;
    }
    if (settlementBasis !== 'none' && lines.length) {
      const sum = lines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);
      if (Math.abs(sum - previewedSettlement) > 0.01) {
        setError(t('contracts.detail.cancel_form.lines_mismatch'));
        return;
      }
    }
    setSaving(true);
    try {
      await onSubmit({
        cancelDate,
        cancelReason: cancelReason.trim(),
        installmentDisposition: disposition,
        ...(settlementBasis === 'none'
          ? {}
          : {
              settlementBasis,
              ...(settlementBasis === 'amount' ? { settlementAmount: parseFloat(settlementAmount) || 0 } : {}),
              ...(settlementBasis === 'installments' ? { settlementInstallments: parseInt(settlementInstallments, 10) || 0 } : {}),
              ...(lines.length ? { settlementLines: lines.map((l) => ({ label: l.label.trim(), amount: parseFloat(l.amount) || 0 })) } : {}),
            }),
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_contract_cancel'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
      <div className="field">
        <label>{t('contracts.detail.cancel_form.date')}</label>
        <input type="date" value={cancelDate} onChange={(e) => setCancelDate(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('contracts.detail.cancel_form.reason')}</label>
        <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t('contracts.detail.cancel_form.reason_placeholder')} />
      </div>
      <div className="field">
        <label>{t('contracts.detail.cancel_form.upcoming_installments')}</label>
        <select value={disposition} onChange={(e) => setInstallmentDisposition(e.target.value as 'keep' | 'cancel')}>
          <option value="cancel">{t('contracts.detail.cancel_form.cancel_them')}</option>
          <option value="keep" disabled={settlesFromInstallments}>
            {t('contracts.detail.cancel_form.keep_them')}
          </option>
        </select>
        {settlesFromInstallments ? (
          <p className="hint">{t('contracts.detail.cancel_form.settlement_cancels_installments')}</p>
        ) : (
          disposition === 'keep' && <p className="hint">{t('contracts.detail.cancel_form.keep_hint')}</p>
        )}
      </div>

      <div className="two-col">
        <div className="field">
          <label>{t('contracts.detail.cancel_form.settlement')}</label>
          <select value={settlementBasis} onChange={(e) => setSettlementBasis(e.target.value as SettlementBasis)}>
            {(Object.keys(SETTLEMENT_BASIS_LABEL) as SettlementBasis[]).map((b) => (
              <option key={b} value={b}>
                {SETTLEMENT_BASIS_LABEL[b]}
              </option>
            ))}
          </select>
        </div>
        {settlementBasis === 'amount' && (
          <div className="field">
            <label>{t('contracts.detail.cancel_form.amount')}</label>
            <input className="num" value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} placeholder="0.00" />
          </div>
        )}
        {settlementBasis === 'installments' && (
          <div className="field">
            <label>{t('contracts.detail.cancel_form.installment_count')}</label>
            <input type="number" min="1" value={settlementInstallments} onChange={(e) => setSettlementInstallments(e.target.value)} />
            <p className="hint">{t('contracts.detail.cancel_form.unpaid_from_date', { n: unpaidFromCancelDate.length })}</p>
          </div>
        )}
      </div>
      {settlementBasis !== 'none' && (
        // Says where the money lands, because "settlement" alone doesn't tell
        // the user it becomes a receivable rather than cash in hand.
        <p className="hint">
          {t('contracts.detail.cancel_form.settlement_hint', { amount: fmt(previewedSettlement) })}
        </p>
      )}
      {previewedSettlement > 0 && (
        <div className="card" style={{ background: '#faf9f5', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <b>{t('contracts.detail.cancel_form.lines_title')}</b>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setLines((ls) => [...ls, { label: '', amount: '' }])}>
              {t('contracts.detail.cancel_form.add_line')}
            </button>
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input style={{ flex: 2 }} placeholder={t('contracts.detail.cancel_form.line_label_placeholder')} value={l.label} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input style={{ flex: 1 }} type="number" placeholder={t('contracts.detail.cancel_form.line_amount_placeholder')} value={l.amount} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          {lines.length > 0 && (
            <p className="hint" style={{ marginTop: 6 }}>
              {t('contracts.detail.cancel_form.lines_sum')}<b className="num">{fmt(lines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0))}</b>{t('contracts.detail.cancel_form.lines_must_equal', { amount: fmt(previewedSettlement) })}
            </p>
          )}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          {t('contracts.detail.back')}
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {t('contracts.detail.cancel_form.confirm')}
        </button>
      </div>
    </div>
  );
}

/**
 * Renewing produces a new contract — the expiring one keeps its own schedule
 * and payment history. The form defaults to the day after the current term
 * ends and to the same rent, which is the ordinary case; everything else is an
 * override. A start on or before the current term's last day ends the current
 * contract the day before, and the form says so before it is confirmed.
 */
export function RenewForm({ contract, onCancel, onSubmit }: { contract: Contract; onCancel: () => void; onSubmit: (dto: RenewContractInput) => Promise<void> }) {
  const { t } = useTranslation();
  const dayAfter = (iso: string) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const dayBeforeIso = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const oneYearOn = (iso: string) => {
    const d = new Date(iso);
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  };

  const defaultStart = dayAfter(contract.end);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(oneYearOn(contract.end));
  const [value, setValue] = useState(contract.value);
  const [no, setNo] = useState('');
  const [ejarNo, setEjarNo] = useState('');
  const [carryDeposits, setCarryDeposits] = useState(true);
  // Prefilled from the original for review: the server requires both and does not inherit them; a legacy original gives no preset.
  const [classification, setClassification] = useState<DeclaredClassification | ''>(contract.classification === 'LEGACY_UNCLASSIFIED' ? '' : contract.classification);
  const [vatInclusion, setVatInclusion] = useState<DeclaredVatInclusion | ''>(contract.vatInclusion === 'LEGACY_UNDECLARED' ? '' : contract.vatInclusion);
  // The lessor on an operated property is declared on renewal like the classification, prefilled from the original for review.
  const managed = contract.unit.property.ownership === 'managed';
  const [lessor, setLessor] = useState<DeclaredLessorChoice>(contract.lessor === 'LEGACY_UNDECLARED' ? '' : contract.lessor);
  const [ownerName, setOwnerName] = useState(contract.ownerName ?? '');
  const [ownerVatNumber, setOwnerVatNumber] = useState(contract.ownerVatNumber ?? '');
  // The mixed share is prefilled from the original for review; the server does not inherit it.
  const [sharePercent, setSharePercent] = useState(contract.exemptSharePercent ?? '');
  const [shareBasis, setShareBasis] = useState(contract.exemptShareBasis ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heldDeposits = contract.deposits.filter((d) => d.status === 'HELD');
  // The tenant credit is deducted from renewal installments only under the original tax treatment:
  // a different classification, inclusion or share means no deduction and it stays on the original.
  const tenantCredit = num0(contract.tenantCredit ?? '0');
  const treatmentChanged =
    classification !== contract.classification ||
    vatInclusion !== contract.vatInclusion ||
    (classification === 'MIXED' && sharePercent !== (contract.exemptSharePercent ?? ''));
  // Same for the lessor on an operated property: an owner-lessor credit is not deducted from a company-lessor contract, nor the reverse.
  const lessorChanged = managed && lessor !== contract.lessor;
  // A renewal starting on or before the current contract's last day ends it the day before; the server does the cut.
  const early = start !== '' && start <= contract.end.slice(0, 10);
  const cutDay = early ? dayBeforeIso(start) : '';
  const cancelledAfterCut = early ? contract.installments.filter((i) => i.status !== 'CANCELLED' && i.dueDate.slice(0, 10) > cutDay).length : 0;

  async function submit() {
    setError(null);
    if (!classification || !vatInclusion) {
      setError(i18n.t('err_contract_classification'));
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        start,
        end,
        classification,
        vatInclusion,
        ...mixedSharePayload(classification, sharePercent, shareBasis),
        ...(managed ? lessorPayload(lessor, ownerName, ownerVatNumber) : {}),
        value: parseFloat(value) || undefined,
        no: no.trim() || undefined,
        ejarNo: ejarNo.trim() || undefined,
        carryDeposits,
      });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.detail.renew.failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
      <div className="two-col">
        <div className="field">
          <label>{t('contracts.detail.renew.start')}</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('contracts.detail.renew.end')}</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label>{t('contracts.detail.renew.annual_value')}</label>
          <input className="num" value={value} onChange={(e) => setValue(e.target.value)} />
          <p className="hint">{t('contracts.detail.renew.same_rent_hint')}</p>
        </div>
        <div className="field">
          <label>{t('contracts.detail.renew.no')}</label>
          <input value={no} onChange={(e) => setNo(e.target.value)} placeholder={t('contracts.detail.renew.no_placeholder')} />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label>{t('contracts.detail.renew.classification')}</label>
          <select value={classification} onChange={(e) => setClassification(e.target.value as DeclaredClassification | '')}>
            <option value="">{t('contracts.lessor.choose')}</option>
            {CLASSIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('contracts.detail.renew.vat_inclusion')}</label>
          <select value={vatInclusion} onChange={(e) => setVatInclusion(e.target.value as DeclaredVatInclusion | '')}>
            <option value="">{t('contracts.lessor.choose')}</option>
            {VAT_INCLUSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {classification === 'MIXED' && <MixedShareFields idPrefix="renew" percent={sharePercent} onPercent={setSharePercent} basis={shareBasis} onBasis={setShareBasis} />}
      {managed && (
        <LessorFields
          idPrefix="renew"
          lessor={lessor}
          onLessor={setLessor}
          ownerName={ownerName}
          onOwnerName={setOwnerName}
          ownerVatNumber={ownerVatNumber}
          onOwnerVatNumber={setOwnerVatNumber}
          commercial={isTaxedClassification(classification)}
        />
      )}
      <div className="field">
        <label>{t('contracts.detail.renew.ejar_no')}</label>
        <input value={ejarNo} onChange={(e) => setEjarNo(e.target.value)} />
      </div>
      {heldDeposits.length > 0 && (
        <div className="field">
          <label>
            <input type="checkbox" checked={carryDeposits} onChange={(e) => setCarryDeposits(e.target.checked)} /> {t('contracts.detail.renew.carry_deposits')}
          </label>
          {/* No cash moves either way — this only changes which lease the
              existing deposit secures. */}
          <p className="hint">
            {carryDeposits
              ? t('contracts.detail.renew.carry_hint', { n: heldDeposits.length })
              : t('contracts.detail.renew.keep_hint')}
          </p>
        </div>
      )}
      {tenantCredit > 0 && (
        <p className="hint" role="note" style={treatmentChanged || lessorChanged ? { color: 'var(--rose)' } : undefined}>
          {treatmentChanged
            ? t('contracts.detail.renew.credit_kept_classification', { amount: formatMoney(tenantCredit) })
            : lessorChanged
              ? t('contracts.detail.renew.credit_kept_lessor', { amount: formatMoney(tenantCredit) })
              : t('contracts.detail.renew.credit_deducted', { amount: formatMoney(tenantCredit) })}
        </p>
      )}
      {early && (
        <p className="hint" role="note" style={{ color: 'var(--rose)' }}>
          {t('contracts.detail.renew.early_cut', { no: contract.no, cut: dfmt(cutDay), n: cancelledAfterCut })}
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          {t('contracts.detail.back')}
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {t('contracts.detail.renew.confirm')}
        </button>
      </div>
    </div>
  );
}

/**
 * A contract from before the migration carries a declared legacy value
 * (unclassified / undeclared); the merchant replaces it here by hand. Nothing
 * is assumed: both choices stay empty until picked.
 */
function LegacyDeclarationForm({ contract, onDeclared }: { contract: Contract; onDeclared: () => Promise<void> }) {
  const { t } = useTranslation();
  const [classification, setClassification] = useState<DeclaredClassification | ''>(contract.classification === 'LEGACY_UNCLASSIFIED' ? '' : contract.classification);
  const [vatInclusion, setVatInclusion] = useState<DeclaredVatInclusion | ''>(contract.vatInclusion === 'LEGACY_UNDECLARED' ? '' : contract.vatInclusion);
  const [sharePercent, setSharePercent] = useState(contract.exemptSharePercent ?? '');
  const [shareBasis, setShareBasis] = useState(contract.exemptShareBasis ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function declare() {
    setError(null);
    if (!classification || !vatInclusion) {
      setError(i18n.t('err_contract_classification'));
      return;
    }
    setSaving(true);
    try {
      await updateContract(contract.id, { classification, vatInclusion, ...mixedSharePayload(classification, sharePercent, shareBasis) });
      await onDeclared();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.detail.legacy.classification_failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#fff8e6', marginBottom: 10 }}>
      <p className="hint" style={{ marginTop: 0 }}>{t('contracts.detail.legacy.classification_hint')}</p>
      <div className="two-col">
        <div className="field">
          <label>{t('contracts.modal.classification')}</label>
          <select value={classification} onChange={(e) => setClassification(e.target.value as DeclaredClassification | '')}>
            <option value="">{t('contracts.lessor.choose')}</option>
            {CLASSIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('contracts.detail.value_and_vat')}</label>
          <select value={vatInclusion} onChange={(e) => setVatInclusion(e.target.value as DeclaredVatInclusion | '')}>
            <option value="">{t('contracts.lessor.choose')}</option>
            {VAT_INCLUSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {classification === 'MIXED' && <MixedShareFields idPrefix="legacy-class" percent={sharePercent} onPercent={setSharePercent} basis={shareBasis} onBasis={setShareBasis} />}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-primary" onClick={declare} disabled={saving}>
          {t('contracts.detail.legacy.save_classification')}
        </button>
      </div>
    </div>
  );
}

/**
 * A contract on an operated property from before the lessor field: its lessor
 * is declared here by hand. It cannot be edited, accrued or enter the return
 * until declared. Nothing is assumed: the choice stays empty until picked.
 */
function LegacyLessorForm({ contract, onDeclared }: { contract: Contract; onDeclared: () => Promise<void> }) {
  const { t } = useTranslation();
  const [lessor, setLessor] = useState<DeclaredLessorChoice>('');
  const [ownerName, setOwnerName] = useState(contract.ownerName ?? '');
  const [ownerVatNumber, setOwnerVatNumber] = useState(contract.ownerVatNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function declare() {
    setError(null);
    if (!lessor) {
      setError(t('contracts.detail.legacy.err_lessor'));
      return;
    }
    setSaving(true);
    try {
      await updateContract(contract.id, lessorPayload(lessor, ownerName, ownerVatNumber));
      await onDeclared();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.detail.legacy.lessor_failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#fff8e6', marginBottom: 10 }}>
      <p className="hint" style={{ marginTop: 0 }}>{t('contracts.detail.legacy.lessor_hint')}</p>
      <LessorFields
        idPrefix="legacy"
        lessor={lessor}
        onLessor={setLessor}
        ownerName={ownerName}
        onOwnerName={setOwnerName}
        ownerVatNumber={ownerVatNumber}
        onOwnerVatNumber={setOwnerVatNumber}
        commercial={isTaxedClassification(contract.classification)}
      />
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-primary" onClick={declare} disabled={saving}>
          {t('contracts.detail.legacy.save_lessor')}
        </button>
      </div>
    </div>
  );
}

export function ContractDetailModal({ contract: initial, banks, onClose, onChanged }: { contract: Contract; banks: Bank[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // Each control follows the action its route checks: a declaration edits, a payment records, a renewal adds, a cancellation deletes.
  const canEdit = can('contracts', 'edit');
  const canRecord = can('contracts', 'record');
  const canRenew = can('contracts', 'add');
  const canCancel = can('contracts', 'delete');
  const [contract, setContract] = useState(initial);
  const [payingInstallmentId, setPayingInstallmentId] = useState<string | null | 'free'>(null);
  const [cancelling, setCancelling] = useState(false);
  const [renewing, setRenewing] = useState(false);
  // One key per payment: it stays with every attempt at the same payment and is renewed after success, so a double click or retry never collects twice.
  const [paymentKey, setPaymentKey] = useState(newRequestKey);

  async function reload() {
    const fresh = await getContract(contract.id);
    setContract(fresh);
    onChanged();
  }

  async function handlePayment(dto: import('../../api/contracts').RecordPaymentInput) {
    await recordPayment(contract.id, { ...dto, installmentId: payingInstallmentId === 'free' ? undefined : (payingInstallmentId ?? undefined) }, paymentKey);
    setPaymentKey(newRequestKey());
    setPayingInstallmentId(null);
    await reload();
  }

  /** Renewal creates a different contract, so the modal switches to showing it
   * — staying on the expiring one would leave the user looking at a lease they
   * just replaced. */
  async function handleRenew(dto: RenewContractInput) {
    const renewal = await renewContract(contract.id, dto);
    setRenewing(false);
    setContract(renewal);
    onChanged();
  }

  async function handleCancel(dto: CancelContractInput) {
    await cancelContract(contract.id, dto);
    setCancelling(false);
    await reload();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {t('contracts.detail.title', { no: contract.no, property: contract.unit.property.name, unit: contract.unit.unitNo })}
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>{t('contracts.detail.tenant')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {contract.tenant} {contract.phone ? `— ${contract.phone}` : ''}
            </p>
          </div>
          <div className="field">
            <label>{t('contracts.detail.value_cycle')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {fmt(contract.value)} — {CYCLE_LABEL[contract.cycle]}
            </p>
          </div>
        </div>
        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>{t('contracts.detail.period')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {dfmt(contract.start)} — {dfmt(contract.end)}
            </p>
          </div>
          <div className="field">
            <label>{t('contracts.detail.deposit')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {fmt(contract.deposit)}
            </p>
          </div>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>{t('contracts.detail.classification')}</label>
            <p style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {CLASSIFICATION_LABEL[contract.classification]}
              {contract.classification === 'MIXED' && contract.exemptSharePercent !== null && t('contracts.detail.exempt_share', { percent: contract.exemptSharePercent, basis: contract.exemptShareBasis ?? '' })}
            </p>
          </div>
          <div className="field">
            <label>{t('contracts.detail.value_and_vat')}</label>
            <p style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>{VAT_INCLUSION_LABEL[contract.vatInclusion]}</p>
          </div>
        </div>
        {canEdit && isLegacyContract(contract) && <LegacyDeclarationForm contract={contract} onDeclared={reload} />}
        {(contract.unit.property.ownership === 'managed' || contract.lessor !== 'COMPANY') && contract.lessor !== 'LEGACY_UNDECLARED' && (
          <div className="field" style={{ marginBottom: 6 }}>
            <label>{t('contracts.detail.lessor')}</label>
            <p style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {contract.lessor === 'OWNER'
                ? t('contracts.detail.lessor_owner', { name: contract.ownerName ?? '', vat: contract.ownerVatNumber ? t('contracts.detail.lessor_owner_vat', { vat: contract.ownerVatNumber }) : '' })
                : t('contracts.detail.lessor_company')}
            </p>
          </div>
        )}
        {canEdit && contract.lessor === 'LEGACY_UNDECLARED' && <LegacyLessorForm contract={contract} onDeclared={reload} />}

        {contract.status === 'CANCELLED' && (
          <p className="hint" style={{ color: 'var(--rose)', marginBottom: 10 }}>
            {t('contracts.detail.cancelled_on', { date: contract.cancelDate ? dfmt(contract.cancelDate) : '', reason: contract.cancelReason })}
          </p>
        )}

        <div className="card-title" style={{ marginBottom: 10 }}>
          {t('contracts.detail.installments_title', { n: contract.installments.length })}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('contracts.detail.col_due_date')}</th>
              <th>{t('contracts.detail.col_amount')}</th>
              <th>{t('contracts.detail.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contract.installments.map((i) => (
              <tr key={i.id}>
                <td className="num">{dfmt(i.dueDate)}</td>
                <td className="num">{fmt(i.amount)}</td>
                <td>
                  <span className={`badge ${badgeOf(INSTALLMENT_STATUS_META, i.status).badgeClass}`}>{badgeOf(INSTALLMENT_STATUS_META, i.status).label}</span>
                </td>
                <td>
                  {canRecord && (i.status === 'DUE' || i.status === 'LATE' || i.status === 'PARTIAL') && contract.status !== 'CANCELLED' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setPayingInstallmentId(i.id)}>
                      {t('contracts.detail.record_payment')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {canRecord && payingInstallmentId && (
          <>
            {/* The engine's limit is stated where it is read: rent revenue is
                spread over the installment's service period, and a payment with
                no installment has no known service period. */}
            {/* On a classified contract a payment with no installment settles the
                due installments from the oldest, then the upcoming ones in order
                (the server splits it), so each part's revenue follows its
                installment's month; anything beyond all installments is tenant
                credit, not revenue. */}
            {payingInstallmentId === 'free' && (
              <p className="hint" style={{ marginTop: 4 }}>
                {t('contracts.detail.free_payment.start')}<strong>{t('contracts.detail.free_payment.order')}</strong>{t('contracts.detail.free_payment.middle')}<strong>{t('contracts.detail.free_payment.credit')}</strong>{t('contracts.detail.free_payment.end')}
              </p>
            )}
            <PaymentForm
              banks={banks}
              defaultAmount={payingInstallmentId !== 'free' ? suggestedRemainingGross(contract, contract.installments.find((i) => i.id === payingInstallmentId)) : ''}
              declaration={payingInstallmentId !== 'free' ? paymentDeclaration(contract, contract.installments.find((i) => i.id === payingInstallmentId)?.amount) : null}
              onCancel={() => setPayingInstallmentId(null)}
              onSubmit={handlePayment}
            />
          </>
        )}

        {canRecord && !payingInstallmentId && contract.status !== 'CANCELLED' && (
          <button className="add-line" onClick={() => setPayingInstallmentId('free')}>
            {t('contracts.detail.free_payment_button')}
          </button>
        )}

        <HandoversSection
          contract={contract}
          onChanged={(updated) => {
            setContract(updated);
            onChanged();
          }}
        />

        <KeyMoneySection
          contract={contract}
          onChanged={(updated) => {
            setContract(updated);
            onChanged();
          }}
        />

        <FeesSection
          contract={contract}
          onChanged={(updated) => {
            setContract(updated);
            onChanged();
          }}
        />

        <ClaimsSection
          contract={contract}
          onChanged={(updated) => {
            setContract(updated);
            onChanged();
          }}
        />

        <DepositsSection
          contract={contract}
          onChanged={(updated) => {
            // Both deposit endpoints return the whole contract, so the section
            // hands it back instead of triggering another fetch.
            setContract(updated);
            onChanged();
          }}
        />

        {/* Attachments own their state — separate endpoint, not part of the
            contract object — so they take just the id, no onChanged. */}
        <AttachmentsSection contractId={contract.id} />

        <div className="card-title" style={{ margin: '16px 0 10px' }}>
          {t('contracts.detail.payments_title', { n: contract.payments.length })}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('contracts.detail.col_date')}</th>
              <th>{t('contracts.detail.col_net_amount')}</th>
              <th>{t('contracts.detail.col_method')}</th>
            </tr>
          </thead>
          <tbody>
            {contract.payments.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <div className="empty-state">{t('contracts.detail.no_payments')}</div>
                </td>
              </tr>
            )}
            {contract.payments.map((p) => (
              <tr key={p.id}>
                <td className="num">{dfmt(p.date)}</td>
                <td className="num">{fmt(p.netAmount)}</td>
                <td>{paymentSourceLabel(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {canCancel && cancelling && <CancelForm contract={contract} onCancel={() => setCancelling(false)} onSubmit={handleCancel} />}
        {canRenew && renewing && <RenewForm contract={contract} onCancel={() => setRenewing(false)} onSubmit={handleRenew} />}

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('contracts.detail.close')}
          </button>
          {/* A cancelled lease has no future to renew, and a draft isn't a
              tenancy yet. */}
          {canRenew && contract.status !== 'CANCELLED' && contract.status !== 'DRAFT' && !renewing && !cancelling && (
            <button className="btn btn-ghost" onClick={() => setRenewing(true)}>
              {t('contracts.detail.renew_contract')}
            </button>
          )}
          {canCancel && contract.status !== 'CANCELLED' && !cancelling && (
            <button className="btn btn-ghost" style={{ color: 'var(--rose)' }} onClick={() => setCancelling(true)}>
              {t('contracts.detail.cancel_contract')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
