import { useState } from 'react';
import type { Warehouse, WarehouseInput } from '../../api/warehouses';

export function WarehouseModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Warehouse | null;
  onCancel: () => void;
  onSave: (data: WarehouseInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [manager, setManager] = useState(editing?.manager ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('الرجاء إدخال اسم المستودع');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), location: location.trim() || undefined, manager: manager.trim() || undefined });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر حفظ المستودع');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل المستودع' : 'مستودع جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم المستودع</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="المستودع الرئيسي" />
        </div>
        <div className="field">
          <label>الموقع</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="المدينة / الحي" />
        </div>
        <div className="field">
          <label>المسؤول</label>
          <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="اسم المسؤول عن المستودع" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة المستودع'}
          </button>
        </div>
      </div>
    </div>
  );
}
