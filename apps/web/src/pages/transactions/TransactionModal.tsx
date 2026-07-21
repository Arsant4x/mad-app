import { useState } from 'react';
import type { Bank } from '../../api/banks';
import type { BankTx, TransactionInput } from '../../api/transactions';
import { today } from '../../lib/format';

export function TransactionModal({
  banks,
  editing,
  onCancel,
  onSave,
}: {
  banks: Bank[];
  editing: BankTx | null;
  onCancel: () => void;
  onSave: (data: TransactionInput) => Promise<void>;
}) {
  const [bankId, setBankId] = useState(editing?.bankId ?? banks[0]?.id ?? '');
  const [date, setDate] = useState(editing ? editing.date.slice(0, 10) : today());
  const [amount, setAmount] = useState(editing?.amount ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [source, setSource] = useState(editing?.source ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const amountNum = parseFloat(String(amount));
    if (!description.trim() || !amountNum) {
      setError('الرجاء إدخال البيان والمبلغ');
      return;
    }
    setSaving(true);
    try {
      await onSave({ bankId, date, description: description.trim(), amount: amountNum, source: source.trim() || undefined });
    } catch {
      setError('تعذّر حفظ الحركة البنكية');
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
