import { useState } from 'react';
import { apiErrorMessage } from '../../lib/apiError';
import type { Branch } from '../../api/branches';
import { BranchPicker } from '../../components/BranchPicker';
import type { Bank } from '../../api/banks';
import type { BankTx, TransactionInput } from '../../api/transactions';
import { today } from '../../lib/format';
import i18n from '../../i18n';

export function TransactionModal({
  banks,
  editing,
  branches,
  onCancel,
  onSave,
}: {
  banks: Bank[];
  editing: BankTx | null;
  branches: Branch[];
  onCancel: () => void;
  onSave: (data: TransactionInput) => Promise<void>;
}) {
  const [bankId, setBankId] = useState(editing?.bankId ?? banks[0]?.id ?? '');
  const [date, setDate] = useState(editing ? editing.date.slice(0, 10) : today());
  const [amount, setAmount] = useState(editing?.amount ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [source, setSource] = useState(editing?.source ?? '');
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const amountNum = parseFloat(String(amount));
    if (!description.trim() || !amountNum) {
      setError(i18n.t('err_transaction_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        bankId,
        date,
        description: description.trim(),
        amount: amountNum,
        source: source.trim() || undefined,
        branchId: branchId || undefined,
      });
    } catch (e) {
      setError(apiErrorMessage(e, i18n.t('err_transaction_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل الحركة البنكية' : 'حركة بنكية جديدة'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        {/* (ق-٢٨٥) التاجرُ يرى ما تغيّر: كان هذا السطر يحرّك الرصيد بيدٍ بلا قيد،
            فصار سطرَ مطابقةٍ والرصيدُ يتبع الأستاذ. ومنعٌ بلا إعلانٍ يُقرأ عطلاً. */}
        <p className="hint" data-testid="tx-mirror-notice">
          هذا السطر <strong>للمطابقة مع كشف البنك</strong> — ولا يحرّك الرصيد.
          والرصيد يتبع القيود المحاسبية (الدفعات والإيجارات والقيود اليدوية).
        </p>
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
        <div className="two-col">
          <div className="field">
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>المبلغ (سالب للصادر)</label>
            <input className="num" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000.00 أو -500.00" />
          </div>
        </div>
        <div className="field">
          <label>البيان</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: تحويل وارد من عميل" />
        </div>
        <div className="field">
          <label>المصدر</label>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="مبيعات / دفعة مقدمة..." />
        </div>
        <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة الحركة'}
          </button>
        </div>
      </div>
    </div>
  );
}
