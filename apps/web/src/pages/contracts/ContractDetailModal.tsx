import { useState } from 'react';
import type { Bank } from '../../api/banks';
import { cancelContract, getContract, recordPayment, type CancelContractInput, type Contract, type InstallmentStatus, type PaymentMethod, type RecordPaymentInput } from '../../api/contracts';
import { dfmt, fmt, today } from '../../lib/format';
import { CYCLE_LABEL } from './contractMeta';

const INSTALLMENT_STATUS_META: Record<InstallmentStatus, { label: string; badgeClass: string }> = {
  DUE: { label: 'مستحقة', badgeClass: 'due' },
  LATE: { label: 'متأخرة', badgeClass: 'overdue' },
  PAID: { label: 'مدفوعة', badgeClass: 'paid' },
  CANCELLED: { label: 'ملغية', badgeClass: 'draft' },
};

function PaymentForm({
  banks,
  defaultAmount,
  onCancel,
  onSubmit,
}: {
  banks: Bank[];
  defaultAmount: string;
  onCancel: () => void;
  onSubmit: (dto: RecordPaymentInput) => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(defaultAmount);
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [bankId, setBankId] = useState(banks[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (method === 'BANK' && !bankId) {
      setError('الرجاء اختيار الحساب البنكي');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ date, amount: parseFloat(amount) || 0, discount: parseFloat(discount) || undefined, method, bankId: method === 'BANK' ? bankId : undefined });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر تسجيل الدفعة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ background: '#faf9f5', marginTop: 10 }}>
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

function CancelForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (dto: CancelContractInput) => Promise<void> }) {
  const [cancelDate, setCancelDate] = useState(today());
  const [cancelReason, setCancelReason] = useState('');
  const [installmentDisposition, setInstallmentDisposition] = useState<'keep' | 'cancel'>('cancel');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!cancelReason.trim()) {
      setError('الرجاء إدخال سبب الإلغاء');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ cancelDate, cancelReason: cancelReason.trim(), installmentDisposition });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر إلغاء العقد');
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

export function ContractDetailModal({ contract: initial, banks, onClose, onChanged }: { contract: Contract; banks: Bank[]; onClose: () => void; onChanged: () => void }) {
  const [contract, setContract] = useState(initial);
  const [payingInstallmentId, setPayingInstallmentId] = useState<string | null | 'free'>(null);
  const [cancelling, setCancelling] = useState(false);

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
                  <span className={`badge ${INSTALLMENT_STATUS_META[i.status].badgeClass}`}>{INSTALLMENT_STATUS_META[i.status].label}</span>
                </td>
                <td>
                  {(i.status === 'DUE' || i.status === 'LATE') && contract.status !== 'CANCELLED' && (
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
          <PaymentForm
            banks={banks}
            defaultAmount={payingInstallmentId !== 'free' ? (contract.installments.find((i) => i.id === payingInstallmentId)?.amount ?? '') : ''}
            onCancel={() => setPayingInstallmentId(null)}
            onSubmit={handlePayment}
          />
        )}

        {!payingInstallmentId && contract.status !== 'CANCELLED' && (
          <button className="add-line" onClick={() => setPayingInstallmentId('free')}>
            + دفعة إيجار حرة (غير مرتبطة بقسط)
          </button>
        )}

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

        {cancelling && <CancelForm onCancel={() => setCancelling(false)} onSubmit={handleCancel} />}

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
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
