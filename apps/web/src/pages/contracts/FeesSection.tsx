import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addContractFee, endContractFee, type Contract } from '../../api/contracts';
import { usePermissions } from '../../auth/PermissionsContext';
import { dfmt, fmt, today } from '../../lib/format';

/**
 * Fee lines on top of the rent, invoiced with each installment.
 *
 * A named fee (parking, cleaning, services) is a separate supply taxed at 15%
 * even when the rent is exempt residential: every installment that falls due
 * raises its fees as a taxable claim shown under claims, to be collected or
 * waived. A line is ended, never deleted, so what was already claimed stays.
 */
export function FeesSection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const { t } = useTranslation();
  // Adding and ending a fee line both edit the contract.
  const canEdit = usePermissions().can('contracts', 'edit');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fees = contract.fees ?? [];

  async function run(action: () => Promise<Contract>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      onChanged(await action());
      after?.();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.fees.action_failed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t('contracts.fees.title', { n: fees.length })}</span>
        {canEdit && contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? t('contracts.fees.cancel') : t('contracts.fees.add')}
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {canEdit && adding && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label htmlFor="fee-label">{t('contracts.fees.name')}</label>
              <input id="fee-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('contracts.fees.name_placeholder')} />
            </div>
            <div className="field">
              <label htmlFor="fee-amount">{t('contracts.fees.amount')}</label>
              <input id="fee-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="fee-from">{t('contracts.fees.effective_from')}</label>
            <input id="fee-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <p className="hint">{t('contracts.fees.hint')}</p>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button
              className="btn btn-primary"
              disabled={busy || !label.trim() || !(Number(amount) > 0)}
              onClick={() =>
                run(
                  () => addContractFee(contract.id, { label: label.trim(), amount: Number(amount), effectiveFrom }),
                  () => {
                    setAdding(false);
                    setLabel('');
                    setAmount('');
                  },
                )
              }
            >
              {t('contracts.fees.save')}
            </button>
          </div>
        </div>
      )}
      {fees.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t('contracts.fees.col_fee')}</th>
              <th>{t('contracts.fees.col_per_installment')}</th>
              <th>{t('contracts.fees.col_effective')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id}>
                <td>{f.label}</td>
                <td className="num">{fmt(f.amount)}</td>
                <td className="num">
                  {dfmt(f.effectiveFrom)}
                  {f.endedAt ? t('contracts.fees.until', { date: dfmt(f.endedAt) }) : ''}
                </td>
                <td>
                  {canEdit && !f.endedAt && contract.status !== 'CANCELLED' && (
                    <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => endContractFee(contract.id, f.id, { endedAt: today() }))}>
                      {t('contracts.fees.end')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
