import { useState } from 'react';
import type { Property } from '../../api/properties';
import type { Unit, UnitInput } from '../../api/units';
import i18n from '../../i18n';

const TYPE_OPTIONS = ['سكني', 'محل', 'معرض', 'مكتب', 'مخزن', 'أخرى'];

export function UnitModal({
  properties,
  editing,
  defaultPropertyId,
  onCancel,
  onSave,
}: {
  properties: Property[];
  editing: Unit | null;
  defaultPropertyId?: string;
  onCancel: () => void;
  onSave: (data: UnitInput) => Promise<void>;
}) {
  const [propertyId, setPropertyId] = useState(editing?.propertyId ?? defaultPropertyId ?? properties[0]?.id ?? '');
  const [unitNo, setUnitNo] = useState(editing?.unitNo ?? '');
  const [floor, setFloor] = useState(editing?.floor ?? '');
  const [type, setType] = useState(editing?.type ?? 'سكني');
  const [subtype, setSubtype] = useState(editing?.subtype ?? '');
  const [rentMonthly, setRentMonthly] = useState(editing?.rentMonthly ?? '');
  const [underMaintenance, setUnderMaintenance] = useState(editing?.underMaintenance ?? false);
  const [roomDetails, setRoomDetails] = useState(editing?.roomDetails ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!propertyId || !unitNo.trim()) {
      setError(i18n.t('err_unit_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        propertyId,
        unitNo: unitNo.trim(),
        floor: floor.trim() || undefined,
        type,
        subtype: subtype.trim() || undefined,
        rentMonthly: parseFloat(String(rentMonthly)) || 0,
        roomDetails: roomDetails.trim() || undefined,
        underMaintenance,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_unit_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل الوحدة' : 'وحدة جديدة'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>العقار</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} disabled={!!editing}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="two-col">
          <div className="field">
            <label>رقم الوحدة</label>
            <input className="num" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} placeholder="B-12" disabled={!!editing} />
          </div>
          <div className="field">
            <label>الطابق</label>
            <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="الأرضي / الطابق 1" />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>النوع</label>
            <input list="unit-type-list" value={type} onChange={(e) => setType(e.target.value)} placeholder="سكني" />
            <datalist id="unit-type-list">
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>الفئة / النشاط المسموح به</label>
            <input value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="عوائل / نشاط تجاري..." />
          </div>
        </div>
        <div className="field">
          <label>تفاصيل الغرف والمحتويات</label>
          <textarea rows={3} value={roomDetails} onChange={(e) => setRoomDetails(e.target.value)} placeholder="صالة + غرفتان، مطبخ راكب، مكيفات..." />
        </div>
        <div className="field">
          <label>الإيجار الشهري</label>
          <input className="num" value={rentMonthly} onChange={(e) => setRentMonthly(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={underMaintenance} onChange={(e) => setUnderMaintenance(e.target.checked)} style={{ width: 'auto' }} />
            تحت الصيانة حاليًا
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة الوحدة'}
          </button>
        </div>
      </div>
    </div>
  );
}
