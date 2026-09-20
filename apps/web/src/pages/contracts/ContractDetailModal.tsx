import { badgeOf } from '../../lib/statusBadge';
import { useState } from 'react';
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
  type PaymentMethod,
  type RecordPaymentInput,
  type RenewContractInput,
  type SettlementBasis,
} from '../../api/contracts';
import { dfmt, fmt, today } from '../../lib/format';
import { formatMoney, round2 } from '../../lib/money';
import { STANDARD_VAT_GROSS_FACTOR, STANDARD_VAT_RATE, standardVatIncludedIn } from '../../lib/vat';
import { AttachmentsSection } from './AttachmentsSection';
import { ClaimsSection } from './ClaimsSection';
import { DepositsSection } from './DepositsSection';
import { HandoversSection } from './HandoversSection';
import { KeyMoneySection } from './KeyMoneySection';
import { CLASSIFICATION_LABEL, CLASSIFICATION_OPTIONS, CYCLE_LABEL, VAT_INCLUSION_LABEL, VAT_INCLUSION_OPTIONS, isLegacyContract } from './contractMeta';
import i18n from '../../i18n';

const INSTALLMENT_STATUS_META: Record<InstallmentStatus, { label: string; badgeClass: string }> = {
  DUE: { label: 'مستحقة', badgeClass: 'due' },
  LATE: { label: 'متأخرة', badgeClass: 'overdue' },
  // مسدَّدٌ بعضُه — تُشتقّ في الخادم من المقبوض مقابل الإجماليّ (ق-١٠٤٠)؛ والباقي يُقبض من زرّ القبض نفسِه.
  PARTIAL: { label: 'مسدَّدة جزئياً', badgeClass: 'due' },
  PAID: { label: 'مدفوعة', badgeClass: 'paid' },
  CANCELLED: { label: 'ملغية', badgeClass: 'draft' },
};

/** الإجماليُّ الذي يدين به المستأجر عن قسطٍ — بحسب الشمول (م٤٥/٢ · ق-٩١٨): غيرُ الشامل يزيد 15%. */
/** إجماليُّ القسط رقماً — غيرُ الشامل الخاضع +15%، والباقي المبلغُ نفسُه (التدويرُ من `lib/money` وحده — ق-٦٥ بروحها). */
function grossNumberOf(contract: { classification: string; vatInclusion: string }, amount: string | number): number {
  const a = Number(amount);
  return contract.classification === 'COMMERCIAL' && contract.vatInclusion === 'EXCLUSIVE' ? round2(a * STANDARD_VAT_GROSS_FACTOR) : round2(a);
}

/**
 * المقترَحُ للقسط المسدَّد بعضُه هو **الباقي** لا القسطُ كلُّه (ق-١٠٤٠): الإجماليُّ بالضريبة ناقصَ ما
 * قُبض عليه (صافي الدفعة + خصمُها — كما يشتقّ الخادمُ الحالة). القسطُ الذي لم يُقبض عليه شيءٌ يبقى على
 * اقتراحه الكامل.
 */
function suggestedRemainingGross(
  contract: { classification: string; vatInclusion: string; payments: { installmentId: string | null; netAmount: string; discount: string }[] },
  installment: { id: string; amount: string | number } | undefined,
): string {
  if (!installment) return '';
  const gross = grossNumberOf(contract, installment.amount);
  const settled = contract.payments
    .filter((p) => p.installmentId === installment.id)
    .reduce((sum, p) => sum + Number(p.netAmount) + Number(p.discount), 0);
  const remaining = round2(gross - settled);
  return formatMoney(settled > 0 && remaining > 0 ? remaining : gross);
}

/** نصُّ الإعلان في شاشة القبض — الشاملُ وغيرُ الشامل والمعفى، بأرقامها (ق-٩٢٧/②). */
function paymentDeclaration(contract: { classification: string; vatInclusion: string }, amount: string | number | undefined): string | null {
  if (amount === undefined || amount === null || amount === '') return null;
  const a = Number(amount);
  if (contract.classification === 'RESIDENTIAL') return `عقدٌ سكنيّ معفى — المبلغُ المقترَح هو القسطُ ${formatMoney(a)} بلا ضريبة.`;
  if (contract.classification !== 'COMMERCIAL') return 'عقدٌ قديم بلا تصنيف — لا تُحسب له ضريبةٌ حتى يُصنَّف من بطاقته؛ والقبضُ على المسار القائم.';
  if (contract.vatInclusion === 'INCLUSIVE') {
    const tax = round2(standardVatIncludedIn(a));
    return `قيمةُ العقد شاملةٌ للضريبة: القسطُ ${formatMoney(a)} = ${formatMoney(round2(a - tax))} صافياً + ${formatMoney(tax)} ضريبة — فالإيرادُ أقلُّ من القسط.`;
  }
  if (contract.vatInclusion === 'EXCLUSIVE') {
    const tax = round2((a * STANDARD_VAT_RATE) / 100);
    return `قيمةُ العقد غيرُ شاملة: القسطُ ${formatMoney(a)} + ${formatMoney(tax)} ضريبة = ${formatMoney(round2(a + tax))} يدين به المستأجر — وهو المقترَح.`;
  }
  return 'عقدٌ قديم غيرُ معلَنِ الشمول — لا تُحسب له ضريبةٌ حتى يُعلَن من بطاقته.';
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
  /** ⭐ الشاملُ وغيرُ الشامل يُعلنان في شاشة القبض — فالمقترَحُ إجماليٌّ لا قسط (ق-٩٢٧/②). */
  declaration?: string | null;
  onCancel: () => void;
  onSubmit: (dto: RecordPaymentInput) => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(defaultAmount);
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
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
          <label>تاريخ الدفعة</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>المبلغ</label>
          <input className="num" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label>الخصم</label>
          <input className="num" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label>طريقة السداد</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="CASH">نقداً</option>
            <option value="BANK">تحويل بنكي</option>
          </select>
        </div>
      </div>
      {method === 'BANK' && (
        <div className="field">
          <label>الحساب البنكي</label>
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
          <label>الصندوق المستلِم (اختياري)</label>
          <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)}>
            <option value="">— لا صندوق محدّد —</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <p className="hint">اختر صندوق الفرع الذي استلم النقد ليرتفع رصيده. اتركه فارغاً لتسجيل الدخل دون تحديد صندوق.</p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          تسجيل الدفعة
        </button>
      </div>
    </div>
  );
}

const SETTLEMENT_BASIS_LABEL: Record<SettlementBasis, string> = {
  none: 'بدون تسوية',
  amount: 'مبلغ محدَّد',
  installments: 'عدد من الدفعات',
  all: 'كامل المتبقي',
};

function CancelForm({ contract, onCancel, onSubmit }: { contract: Contract; onCancel: () => void; onSubmit: (dto: CancelContractInput) => Promise<void> }) {
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

  async function submit() {
    setError(null);
    if (!cancelReason.trim()) {
      setError(i18n.t('err_cancel_reason_required'));
      return;
    }
    if (settlementBasis !== 'none' && lines.length) {
      const sum = lines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);
      if (Math.abs(sum - previewedSettlement) > 0.01) {
        setError('مجموع البنود لا يساوي مبلغ التسوية.');
        return;
      }
    }
    setSaving(true);
    try {
      await onSubmit({
        cancelDate,
        cancelReason: cancelReason.trim(),
        installmentDisposition,
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
        <label>تاريخ الإلغاء</label>
        <input type="date" value={cancelDate} onChange={(e) => setCancelDate(e.target.value)} />
      </div>
      <div className="field">
        <label>سبب الإلغاء</label>
        <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="مثال: إخلاء مبكر باتفاق الطرفين" />
      </div>
      <div className="field">
        <label>الأقساط المستحقة القادمة</label>
        <select value={installmentDisposition} onChange={(e) => setInstallmentDisposition(e.target.value as 'keep' | 'cancel')}>
          <option value="cancel">إلغاؤها</option>
          <option value="keep">إبقاؤها مستحقة</option>
        </select>
      </div>

      <div className="two-col">
        <div className="field">
          <label>تسوية الإخلاء المبكر</label>
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
            <label>المبلغ</label>
            <input className="num" value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} placeholder="0.00" />
          </div>
        )}
        {settlementBasis === 'installments' && (
          <div className="field">
            <label>عدد الدفعات</label>
            <input type="number" min="1" value={settlementInstallments} onChange={(e) => setSettlementInstallments(e.target.value)} />
            <p className="hint">المتبقي غير المسدَّد من تاريخ الإلغاء: {unpaidFromCancelDate.length} دفعة</p>
          </div>
        )}
      </div>
      {settlementBasis !== 'none' && (
        // Says where the money lands, because "settlement" alone doesn't tell
        // the user it becomes a receivable rather than cash in hand.
        <p className="hint">
          سيُسجَّل {fmt(previewedSettlement)} كمستحق على المستأجر ضمن إيرادات أخرى — وليس إيراد إيجار. يمكن خصمه لاحقاً من التأمين المحتجز.
        </p>
      )}
      {previewedSettlement > 0 && (
        <div className="card" style={{ background: '#faf9f5', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <b>تفصيل التسوية بنوداً (اختياري)</b>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }} onClick={() => setLines((ls) => [...ls, { label: '', amount: '' }])}>
              + بند
            </button>
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input style={{ flex: 2 }} placeholder="مثال: بدل إشعار" value={l.label} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input style={{ flex: 1 }} type="number" placeholder="المبلغ (سالب = خصم)" value={l.amount} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          {lines.length > 0 && (
            <p className="hint" style={{ marginTop: 6 }}>
              مجموع البنود: <b className="num">{fmt(lines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0))}</b> — يجب أن يساوي {fmt(previewedSettlement)}
            </p>
          )}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          تراجع
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          تأكيد الإلغاء
        </button>
      </div>
    </div>
  );
}

/**
 * Renewing produces a new contract — the expiring one is left untouched, with
 * its own schedule and payment history intact. The form defaults to the day
 * after the current term ends and to the same rent, which is the ordinary case;
 * everything else is an override.
 */
function RenewForm({ contract, onCancel, onSubmit }: { contract: Contract; onCancel: () => void; onSubmit: (dto: RenewContractInput) => Promise<void> }) {
  const dayAfter = (iso: string) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + 1);
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
  // تُعبّأ من الأصل ليُراجَعا — والخادمُ يوجبهما ولا يرثهما؛ وإن كان الأصلُ قديماً فلا قيمةَ مسبقة.
  const [classification, setClassification] = useState<DeclaredClassification | ''>(contract.classification === 'LEGACY_UNCLASSIFIED' ? '' : contract.classification);
  const [vatInclusion, setVatInclusion] = useState<DeclaredVatInclusion | ''>(contract.vatInclusion === 'LEGACY_UNDECLARED' ? '' : contract.vatInclusion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heldDeposits = contract.deposits.filter((d) => d.status === 'HELD');

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
        value: parseFloat(value) || undefined,
        no: no.trim() || undefined,
        ejarNo: ejarNo.trim() || undefined,
        carryDeposits,
      });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر تجديد العقد'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
      <div className="two-col">
        <div className="field">
          <label>بداية العقد الجديد</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>نهايته</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label>القيمة السنوية</label>
          <input className="num" value={value} onChange={(e) => setValue(e.target.value)} />
          <p className="hint">تركها كما هي يعني تجديداً بنفس الإيجار.</p>
        </div>
        <div className="field">
          <label>رقم العقد (اختياري)</label>
          <input value={no} onChange={(e) => setNo(e.target.value)} placeholder="يُولَّد تلقائياً إن تُرك فارغاً" />
        </div>
      </div>
      <div className="two-col">
        <div className="field">
          <label>تصنيف العقد الجديد للضريبة</label>
          <select value={classification} onChange={(e) => setClassification(e.target.value as DeclaredClassification | '')}>
            <option value="">— اختر —</option>
            {CLASSIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>قيمته والضريبة</label>
          <select value={vatInclusion} onChange={(e) => setVatInclusion(e.target.value as DeclaredVatInclusion | '')}>
            <option value="">— اختر —</option>
            {VAT_INCLUSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>رقم عقد إيجار (اختياري)</label>
        <input value={ejarNo} onChange={(e) => setEjarNo(e.target.value)} />
      </div>
      {heldDeposits.length > 0 && (
        <div className="field">
          <label>
            <input type="checkbox" checked={carryDeposits} onChange={(e) => setCarryDeposits(e.target.checked)} /> ترحيل التأمين المحتجز للعقد الجديد
          </label>
          {/* No cash moves either way — this only changes which lease the
              existing deposit secures. */}
          <p className="hint">
            {carryDeposits
              ? `سيُنقل ${heldDeposits.length} تأمين محتجز إلى العقد الجديد دون أي حركة نقدية.`
              : 'سيبقى التأمين على العقد الحالي ويحتاج تسوية منفصلة.'}
          </p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-ghost" onClick={onCancel}>
          تراجع
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          تأكيد التجديد
        </button>
      </div>
    </div>
  );
}

/**
 * عقدٌ سبق الهجرة يحمل قيمةً قديمةً معلَنة («غير مصنَّف» / «غير معلَن») — يُنقصها التاجرُ بيدٍ
 * هنا؛ ولا شيءَ يُفترض: الخياران فارغان حتى يُختارا (ق-٨٩٨).
 */
function LegacyDeclarationForm({ contract, onDeclared }: { contract: Contract; onDeclared: () => Promise<void> }) {
  const [classification, setClassification] = useState<DeclaredClassification | ''>(contract.classification === 'LEGACY_UNCLASSIFIED' ? '' : contract.classification);
  const [vatInclusion, setVatInclusion] = useState<DeclaredVatInclusion | ''>(contract.vatInclusion === 'LEGACY_UNDECLARED' ? '' : contract.vatInclusion);
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
      await updateContract(contract.id, { classification, vatInclusion });
      await onDeclared();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر حفظ التصنيف'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#fff8e6', marginBottom: 10 }}>
      <p className="hint" style={{ marginTop: 0 }}>عقدٌ سُجِّل قبل اعتماد التصنيف — اختر تصنيفه وهل قيمته شاملة للضريبة؛ لا يُعدَّل قبل ذلك.</p>
      <div className="two-col">
        <div className="field">
          <label>تصنيف العقد للضريبة</label>
          <select value={classification} onChange={(e) => setClassification(e.target.value as DeclaredClassification | '')}>
            <option value="">— اختر —</option>
            {CLASSIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>القيمة والضريبة</label>
          <select value={vatInclusion} onChange={(e) => setVatInclusion(e.target.value as DeclaredVatInclusion | '')}>
            <option value="">— اختر —</option>
            {VAT_INCLUSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
        <button className="btn btn-primary" onClick={declare} disabled={saving}>
          حفظ التصنيف
        </button>
      </div>
    </div>
  );
}

export function ContractDetailModal({ contract: initial, banks, onClose, onChanged }: { contract: Contract; banks: Bank[]; onClose: () => void; onChanged: () => void }) {
  const [contract, setContract] = useState(initial);
  const [payingInstallmentId, setPayingInstallmentId] = useState<string | null | 'free'>(null);
  const [cancelling, setCancelling] = useState(false);
  const [renewing, setRenewing] = useState(false);

  async function reload() {
    const fresh = await getContract(contract.id);
    setContract(fresh);
    onChanged();
  }

  async function handlePayment(dto: import('../../api/contracts').RecordPaymentInput) {
    await recordPayment(contract.id, { ...dto, installmentId: payingInstallmentId === 'free' ? undefined : (payingInstallmentId ?? undefined) });
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
            عقد {contract.no} — {contract.unit.property.name} / {contract.unit.unitNo}
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>المستأجر</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {contract.tenant} {contract.phone ? `— ${contract.phone}` : ''}
            </p>
          </div>
          <div className="field">
            <label>القيمة / الدورة</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {fmt(contract.value)} — {CYCLE_LABEL[contract.cycle]}
            </p>
          </div>
        </div>
        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>الفترة</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {dfmt(contract.start)} — {dfmt(contract.end)}
            </p>
          </div>
          <div className="field">
            <label>التأمين</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {fmt(contract.deposit)}
            </p>
          </div>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>التصنيف للضريبة</label>
            <p style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>{CLASSIFICATION_LABEL[contract.classification]}</p>
          </div>
          <div className="field">
            <label>القيمة والضريبة</label>
            <p style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>{VAT_INCLUSION_LABEL[contract.vatInclusion]}</p>
          </div>
        </div>
        {isLegacyContract(contract) && <LegacyDeclarationForm contract={contract} onDeclared={reload} />}

        {contract.status === 'CANCELLED' && (
          <p className="hint" style={{ color: 'var(--rose)', marginBottom: 10 }}>
            ملغى بتاريخ {contract.cancelDate ? dfmt(contract.cancelDate) : ''} — {contract.cancelReason}
          </p>
        )}

        <div className="card-title" style={{ marginBottom: 10 }}>
          جدول الأقساط ({contract.installments.length})
        </div>
        <table>
          <thead>
            <tr>
              <th>تاريخ الاستحقاق</th>
              <th>المبلغ</th>
              <th>الحالة</th>
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
                  {(i.status === 'DUE' || i.status === 'LATE' || i.status === 'PARTIAL') && contract.status !== 'CANCELLED' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setPayingInstallmentId(i.id)}>
                      تسجيل دفعة
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {payingInstallmentId && (
          <>
            {/* ⚠️ **حدُّ المحرّك يُعلَن حيث يُقرأ لا في وثيقته** (`ق-٤٤٩` · `ق-٤٧٣`).
                إيرادُ الإيجار يُقسَم على فترة خدمة القسط — **ودفعةٌ بلا قسطٍ لا
                فترةَ خدمةٍ تُعرف لها إطلاقاً**، فتُعترَف إيراداً فوراً. وهي
                **٢٩٪ من الدفعات المقيسة**، فليست حالةً نادرة تُترك بلا بيان. */}
            {payingInstallmentId === 'free' && (
              <p className="hint" style={{ marginTop: 4 }}>
                دفعة غير مرتبطة بقسط: لا تُعرف لها فترة خدمة، فتُعترف <strong>إيراداً فوراً</strong> ولا تمرّ بالإيراد المؤجَّل. اربطها بقسط
                ليُوزَّع إيرادها على أشهره.
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

        {!payingInstallmentId && contract.status !== 'CANCELLED' && (
          <button className="add-line" onClick={() => setPayingInstallmentId('free')}>
            + دفعة إيجار حرة (غير مرتبطة بقسط)
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
          سجل الدفعات ({contract.payments.length})
        </div>
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>المبلغ الصافي</th>
              <th>الطريقة</th>
            </tr>
          </thead>
          <tbody>
            {contract.payments.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <div className="empty-state">لا توجد دفعات مسجَّلة بعد</div>
                </td>
              </tr>
            )}
            {contract.payments.map((p) => (
              <tr key={p.id}>
                <td className="num">{dfmt(p.date)}</td>
                <td className="num">{fmt(p.netAmount)}</td>
                <td>{p.method === 'CASH' ? 'نقداً' : 'تحويل بنكي'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {cancelling && <CancelForm contract={contract} onCancel={() => setCancelling(false)} onSubmit={handleCancel} />}
        {renewing && <RenewForm contract={contract} onCancel={() => setRenewing(false)} onSubmit={handleRenew} />}

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          {/* A cancelled lease has no future to renew, and a draft isn't a
              tenancy yet. */}
          {contract.status !== 'CANCELLED' && contract.status !== 'DRAFT' && !renewing && !cancelling && (
            <button className="btn btn-ghost" onClick={() => setRenewing(true)}>
              تجديد العقد
            </button>
          )}
          {contract.status !== 'CANCELLED' && !cancelling && (
            <button className="btn btn-ghost" style={{ color: 'var(--rose)' }} onClick={() => setCancelling(true)}>
              إلغاء العقد
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
