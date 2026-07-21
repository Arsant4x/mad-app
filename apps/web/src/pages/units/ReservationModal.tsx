import { useState } from 'react';
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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deposit, setDeposit] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !expiryDate) {
      setError('الرجاء إدخال اسم صاحب الحجز وتاريخ انتهاء الحجز');
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
      setError(message ?? 'تعذّر حجز الوحدة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">حجز الوحدة بعربون</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>الوحدة</label>
          <p style={{ fontSize: 'calc(12.5px * var(--font-scale))', padding: '9px 0' }}>{unitLabel}</p>
        </div>
        <div className="field">
          <label>اسم صاحب الحجز</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: خالد المطيري" />
        </div>
        <div className="field">
          <label>رقم الجوال</label>
          <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>مبلغ العربون</label>
            <input className="num" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>الحجز ساري حتى تاريخ</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            تأكيد الحجز
          </button>
        </div>
      </div>
    </div>
  );
}
