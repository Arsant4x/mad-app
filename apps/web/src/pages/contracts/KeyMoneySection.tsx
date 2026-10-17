import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recordKeyMoney, type Contract, type KeyMoneyDirection } from '../../api/contracts';
import { usePermissions } from '../../auth/PermissionsContext';
import { dfmt, fmt, today } from '../../lib/format';
import i18n from '../../i18n';

const DIRECTION_LABEL: Record<KeyMoneyDirection, string> = {
  get RECEIVED() { return i18n.t('contracts.key_money.direction.received'); },
  get PAID() { return i18n.t('contracts.key_money.direction.paid'); },
};

/** Says where each direction lands, because "key money" alone doesn't tell the
 * user that one is income and the other an asset. */
const DIRECTION_EFFECT: Record<KeyMoneyDirection, string> = {
  get RECEIVED() { return i18n.t('contracts.key_money.effect.received'); },
  get PAID() { return i18n.t('contracts.key_money.effect.paid'); },
};

/**
 * Key money: the third kind of money a lease can carry, alongside rent and
 * deposit. Unlike a deposit it is never refunded, and unlike rent it is paid
 * once for the right to the location itself.
 */
export function KeyMoneySection({ contract, onChanged }: { contract: Contract; onChanged: (updated: Contract) => void }) {
  const { t } = useTranslation();
  const canRecord = usePermissions().can('contracts', 'record');
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<KeyMoneyDirection>('RECEIVED');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      onChanged(await recordKeyMoney(contract.id, { direction, amount: Number(amount), paidAt, note: note.trim() || undefined }));
      setAdding(false);
      setAmount('');
      setNote('');
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('contracts.key_money.record_failed')));
    } finally {
      setBusy(false);
    }
  }

  // Nothing to show and nothing to add on a cancelled lease — keep the modal
  // from carrying an empty section for the common residential case.
  if (contract.keyMoney.length === 0 && contract.status === 'CANCELLED') return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t('contracts.key_money.title', { n: contract.keyMoney.length })}</span>
        {canRecord && contract.status !== 'CANCELLED' && (
          <button className="btn btn-ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? t('contracts.key_money.cancel') : t('contracts.key_money.add')}
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {canRecord && adding && (
        <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>{t('contracts.key_money.direction_label')}</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as KeyMoneyDirection)}>
                {(Object.keys(DIRECTION_LABEL) as KeyMoneyDirection[]).map((d) => (
                  <option key={d} value={d}>
                    {DIRECTION_LABEL[d]}
                  </option>
                ))}
              </select>
              <p className="hint">{DIRECTION_EFFECT[direction]}</p>
            </div>
            <div className="field">
              <label>{t('contracts.key_money.amount')}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>{t('contracts.key_money.date')}</label>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('contracts.key_money.note')}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('contracts.key_money.note_placeholder')} />
            </div>
          </div>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={submit}>
              {t('contracts.key_money.save')}
            </button>
          </div>
        </div>
      )}

      {contract.keyMoney.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t('contracts.key_money.direction_label')}</th>
              <th>{t('contracts.key_money.amount')}</th>
              <th>{t('contracts.key_money.date')}</th>
              <th>{t('contracts.key_money.note')}</th>
            </tr>
          </thead>
          <tbody>
            {contract.keyMoney.map((k) => (
              <tr key={k.id}>
                <td>
                  <span className={`badge ${k.direction === 'RECEIVED' ? 'paid' : 'due'}`}>{DIRECTION_LABEL[k.direction]}</span>
                </td>
                <td className="num">{fmt(k.amount)}</td>
                <td className="num">{dfmt(k.paidAt)}</td>
                <td>{k.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
