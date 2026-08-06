import { useState } from 'react';
import type { Branch } from '../../api/branches';
import { BranchPicker } from '../../components/BranchPicker';
import type { Bank, BankInput } from '../../api/banks';
import { today } from '../../lib/format';
import i18n from '../../i18n';

export function BankModal({
  editing,
  branches,
  onCancel,
  onSave,
}: {
  editing: Bank | null;
  branches: Branch[];
  onCancel: () => void;
  onSave: (data: BankInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [iban, setIban] = useState(editing?.iban ?? '');
  const [openingBalance, setOpeningBalance] = useState(editing?.openingBalance ?? '');
  const [openingDate, setOpeningDate] = useState(editing ? editing.openingDate.slice(0, 10) : today());
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_bank_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        iban: iban.trim() || undefined,
        openingBalance: parseFloat(String(openingBalance)) || 0,
        openingDate,
        branchId: branchId || undefined,
      });
    } catch {
      setError(i18n.t('err_bank_save'));
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
        <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />
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
