import { useState } from 'react';
import type { Bank, BankInput } from '../../api/banks';
import { today } from '../../lib/format';

export function BankModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Bank | null;
  onCancel: () => void;
  onSave: (data: BankInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [iban, setIban] = useState(editing?.iban ?? '');
  const [openingBalance, setOpeningBalance] = useState(editing?.openingBalance ?? '');
  const [openingDate, setOpeningDate] = useState(editing ? editing.openingDate.slice(0, 10) : today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('الرجاء إدخال اسم الحساب');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        iban: iban.trim() || undefined,
        openingBalance: parseFloat(String(openingBalance)) || 0,
        openingDate,
      });
    } catch {
      setError('تعذّر حفظ الحساب البنكي');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل الحساب البنكي' : 'حساب بنكي جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم الحساب</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مصرف الراجحي — الحساب الرئيسي" />
        </div>
        <div className="field">
          <label>IBAN</label>
          <input className="num" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="SA0000000000000000000000" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>الرصيد الافتتاحي</label>
            <input className="num" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>تاريخ الافتتاح</label>
            <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة الحساب'}
          </button>
        </div>
      </div>
    </div>
  );
}
