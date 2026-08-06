import { useState } from 'react';
import type { Customer, CustomerInput } from '../../api/customers';
import i18n from '../../i18n';

export function CustomerModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Customer | null;
  onCancel: () => void;
  onSave: (data: CustomerInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [creditLimit, setCreditLimit] = useState(editing?.creditLimit ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_customer_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        vatNumber: vatNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        creditLimit: parseFloat(creditLimit as string) || 0,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_customer_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل العميل' : 'عميل جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم العميل</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شركة الأفق التجارية" />
        </div>
        <div className="field">
          <label>الرقم الضريبي</label>
          <input className="num" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="300XXXXXXXXXXX" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>رقم الجوال</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
          </div>
          <div className="field">
            <label>حد الائتمان</label>
            <input className="num" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="50,000" />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة العميل'}
          </button>
        </div>
      </div>
    </div>
  );
}
