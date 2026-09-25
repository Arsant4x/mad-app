import { useState } from 'react';
import { apiErrorMessage } from '../../lib/apiError';
import type { Branch } from '../../api/branches';
import { BranchPicker, BranchReadOnly } from '../../components/BranchPicker';
import { BANK_KIND_LABEL, type Bank, type BankInput, type BankKind, type BankUpdateInput, type DeclaredBankKind } from '../../api/banks';
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
  /** الإنشاءُ `BankInput` (النوعُ فيه إلزاميّ) والتعديلُ `BankUpdateInput` — والصفحةُ تفرّق بوضع النافذة. */
  onSave: (data: BankInput | BankUpdateInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  // ⚖️ ق-١٤٣١ — النوعُ معلَنٌ لا مستنبَط: لا افتراضَ في الإنشاء، و«غيرُ المعلَن» يبقى كذلك حتى يُعلَن.
  const [kind, setKind] = useState<BankKind | ''>(editing?.kind ?? '');
  const [iban, setIban] = useState(editing?.iban ?? '');
  const [openingBalance, setOpeningBalance] = useState(editing?.openingBalance ?? '');
  const [openingDate, setOpeningDate] = useState(editing ? editing.openingDate.slice(0, 10) : today());
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const declared: DeclaredBankKind | undefined = kind && kind !== 'LEGACY_UNDECLARED' ? kind : undefined;

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_bank_name_required'));
      return;
    }
    if (!editing && !declared) {
      setError(i18n.t('err_bank_kind_required'));
      return;
    }
    setSaving(true);
    try {
      const fields = {
        name: name.trim(),
        iban: iban.trim() || undefined,
        openingBalance: parseFloat(String(openingBalance)) || 0,
        openingDate,
      };
      // 🔴 ق-١٣٨٤: الفرعُ عند الإنشاء وحدَه — `UpdateBankDto` لا يقبله، وإرسالُه في التعديل كان يُردّ `400`.
      // والنوعُ في التعديل يُرسَل حين يُعلَن فقط — فـ«غيرُ المعلَن» الذي لم يُختر له نوعٌ يبقى كما هو.
      if (editing) await onSave(declared ? { ...fields, kind: declared } : fields);
      else await onSave({ ...fields, kind: declared!, branchId: branchId || undefined });
    } catch (e) {
      setError(apiErrorMessage(e, i18n.t('err_bank_save')));
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
          <label htmlFor="bank-kind">نوع الصفّ</label>
          <select id="bank-kind" value={declared ?? ''} onChange={(e) => setKind(e.target.value as DeclaredBankKind | '')}>
            <option value="">{editing?.kind === 'LEGACY_UNDECLARED' ? `${BANK_KIND_LABEL.LEGACY_UNDECLARED} — اختر نوعه` : '— اختر —'}</option>
            <option value="CASH_BOX">{BANK_KIND_LABEL.CASH_BOX}</option>
            <option value="BANK_ACCOUNT">{BANK_KIND_LABEL.BANK_ACCOUNT}</option>
          </select>
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
        {editing ? <BranchReadOnly branches={branches} branchId={editing.branchId} /> : <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />}
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
