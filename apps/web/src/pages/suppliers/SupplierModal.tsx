import { useState } from 'react';
import type { Supplier, SupplierInput } from '../../api/suppliers';

export function SupplierModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Supplier | null;
  onCancel: () => void;
  onSave: (data: SupplierInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('الرجاء إدخال اسم المورد');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        vatNumber: vatNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        category: category.trim() || undefined,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر حفظ المورد');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل المورد' : 'مورد جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم المورد</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: المورد التقني المتحد" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>الرقم الضريبي</label>
            <input className="num" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="301XXXXXXXXXXX" />
          </div>
          <div className="field">
            <label>رقم الجوال</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
          </div>
        </div>
        <div className="field">
          <label>الفئة</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثال: خدمات تقنية" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة المورد'}
          </button>
        </div>
      </div>
    </div>
  );
}
