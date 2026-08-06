import { useState } from 'react';
import type { Branch, BranchInput } from '../../api/branches';
import type { Warehouse } from '../../api/warehouses';
import i18n from '../../i18n';

const BRANCH_TYPES = ['فرع', 'محل', 'مستودع', 'مكتب'];

export function BranchModal({
  editing,
  warehouses,
  onCancel,
  onSave,
}: {
  editing: Branch | null;
  warehouses: Warehouse[];
  onCancel: () => void;
  onSave: (data: BranchInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState(editing?.type ?? BRANCH_TYPES[0]);
  const [hours, setHours] = useState(editing?.hours ?? '');
  const [warehouseId, setWarehouseId] = useState(editing?.warehouseId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_branch_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        type: type || undefined,
        hours: hours.trim() || undefined,
        warehouseId: warehouseId || undefined,
      });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? i18n.t('err_branch_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل الفرع' : 'فرع جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم الفرع</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الفرع الرئيسي" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>النوع</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {BRANCH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>ساعات العمل</label>
            <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="9 ص - 10 م يومياً" />
          </div>
        </div>
        <div className="field">
          <label>المستودع الافتراضي</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">— لا يوجد —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة الفرع'}
          </button>
        </div>
      </div>
    </div>
  );
}
