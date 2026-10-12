import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Account, AccountInput, AccountType } from '../../api/accounts';
import i18n from '../../i18n';

const TYPE_OPTIONS: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export function AccountModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Account | null;
  onCancel: () => void;
  onSave: (data: AccountInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [type, setType] = useState<AccountType>(editing?.type ?? 'asset');
  const [openingBalance, setOpeningBalance] = useState(editing?.openingBalance ?? '');
  // A derived date shows in the field like a declared one, so the merchant sees
  // the same date; the difference is in the hint below, not the value.
  const [openingDate, setOpeningDate] = useState(editing?.openingDate?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !code.trim()) {
      setError(i18n.t('err_account_name_code_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        code: code.trim(),
        name: name.trim(),
        type,
        openingBalance: parseFloat(String(openingBalance)) || 0,
        // Send the date only when the merchant changed it: sending the derived
        // value back would turn it into a declaration they never made.
        ...(openingDate && openingDate !== editing?.openingDate?.slice(0, 10) ? { openingDate } : {}),
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_account_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('accounts.modal.title_edit') : t('accounts.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('accounts.modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accounts.modal.name_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('accounts.modal.code')}</label>
            <input className="num" value={code} onChange={(e) => setCode(e.target.value)} placeholder="1013" disabled={!!editing} />
          </div>
          <div className="field">
            <label>{t('accounts.modal.type')}</label>
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {TYPE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`accounts.types.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* The opening balance is a company-wide figure: a branch-restricted user does not receive it, so it is neither shown nor sent. */}
        {(!editing || editing.openingBalance !== undefined) && (
          <div className="field">
            <label>{t('accounts.modal.opening_balance')}</label>
            <input className="num" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
            <p className="hint" style={{ marginTop: 4 }}>
              {editing ? t('accounts.modal.opening_balance_hint_edit') : t('accounts.modal.opening_balance_hint_new')}
            </p>
          </div>
        )}
        {/* Opening date sits next to the balance, as on the banks screen. Empty means
            "not declared", so it is derived; a derived value is never written as a declaration. */}
        <div className="field">
          <label>{t('accounts.modal.opening_date')}</label>
          <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          <p className="hint" style={{ marginTop: 4 }}>
            {editing && !editing.openingDateDeclared ? t('accounts.modal.opening_date_derived') : t('accounts.modal.opening_date_hint')}
          </p>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('accounts.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('accounts.modal.save_edit') : t('accounts.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
