import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  /** Create sends `BankInput` (kind required), edit sends `BankUpdateInput`; the page tells them apart by mode. */
  onSave: (data: BankInput | BankUpdateInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  // The kind is declared, never inferred: no default on create, and an undeclared row stays so until declared.
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
      // The branch is set on create only: `UpdateBankDto` rejects it with 400.
      // On edit the kind is sent only when declared, so an undeclared row with no choice stays as it is.
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
          <div className="modal-title">{editing ? t('banks.modal.title_edit') : t('banks.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('banks.modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('banks.modal.name_placeholder')} />
        </div>
        <div className="field">
          <label htmlFor="bank-kind">{t('banks.modal.kind')}</label>
          <select id="bank-kind" value={declared ?? ''} onChange={(e) => setKind(e.target.value as DeclaredBankKind | '')}>
            <option value="">{editing?.kind === 'LEGACY_UNDECLARED' ? t('banks.modal.kind_legacy_choose', { label: BANK_KIND_LABEL.LEGACY_UNDECLARED }) : t('banks.modal.choose')}</option>
            <option value="CASH_BOX">{BANK_KIND_LABEL.CASH_BOX}</option>
            <option value="BANK_ACCOUNT">{BANK_KIND_LABEL.BANK_ACCOUNT}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('banks.modal.iban')}</label>
          <input className="num" value={iban} onChange={(e) => setIban(e.target.value)} placeholder={t('banks.modal.iban_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('banks.modal.opening_balance')}</label>
            <input className="num" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>{t('banks.modal.opening_date')}</label>
            <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </div>
        </div>
        {editing ? <BranchReadOnly branches={branches} branchId={editing.branchId} /> : <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('banks.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('banks.modal.save_edit') : t('banks.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
