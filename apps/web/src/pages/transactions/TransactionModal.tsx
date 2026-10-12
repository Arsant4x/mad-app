import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          <div className="modal-title">{editing ? t('transactions.modal.title_edit') : t('transactions.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        {/* This line used to move the balance by hand with no entry; it is now a matching line and the balance
            follows the ledger. A restriction with no notice reads as a fault, so the merchant is told. */}
        <p className="hint" data-testid="tx-mirror-notice">
          {t('transactions.modal.mirror_before')} <strong>{t('transactions.modal.mirror_strong')}</strong> {t('transactions.modal.mirror_after')}
        </p>
        <div className="field">
          <label>{t('transactions.modal.bank')}</label>
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
            <label>{t('transactions.modal.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('transactions.modal.amount')}</label>
            <input className="num" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('transactions.modal.amount_placeholder')} />
          </div>
        </div>
        <div className="field">
          <label>{t('transactions.modal.memo')}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('transactions.modal.memo_placeholder')} />
        </div>
        <div className="field">
          <label>{t('transactions.modal.source')}</label>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={t('transactions.modal.source_placeholder')} />
        </div>
        <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('transactions.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('transactions.modal.save_edit') : t('transactions.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
