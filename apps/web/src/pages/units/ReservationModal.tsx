import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReservationInput } from '../../api/reservations';

export function ReservationModal({
  unitLabel,
  onCancel,
  onSave,
}: {
  unitLabel: string;
  onCancel: () => void;
  onSave: (data: Omit<ReservationInput, 'unitId'>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deposit, setDeposit] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !expiryDate) {
      setError(t('err_reservation_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim() || undefined,
        deposit: parseFloat(deposit) || 0,
        expiryDate,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? t('err_reservation_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{t('units.reservation.title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('units.reservation.unit')}</label>
          <p style={{ fontSize: 'calc(12.5px * var(--font-scale))', padding: '9px 0' }}>{unitLabel}</p>
        </div>
        <div className="field">
          <label>{t('units.reservation.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('units.reservation.name_placeholder')} />
        </div>
        <div className="field">
          <label>{t('units.reservation.phone')}</label>
          <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('units.reservation.phone_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('units.reservation.deposit')}</label>
            <input className="num" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>{t('units.reservation.expiry')}</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('units.reservation.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {t('units.reservation.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
