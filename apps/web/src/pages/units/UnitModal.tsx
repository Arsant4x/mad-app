import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Property } from '../../api/properties';
import type { Unit, UnitInput } from '../../api/units';
import { DEFAULT_UNIT_TYPE, storedUnitType, unitTypeLabel, unitTypeSuggestions } from './unitTypes';


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
  const { t } = useTranslation();
  const [propertyId, setPropertyId] = useState(editing?.propertyId ?? defaultPropertyId ?? properties[0]?.id ?? '');
  const [unitNo, setUnitNo] = useState(editing?.unitNo ?? '');
  const [floor, setFloor] = useState(editing?.floor ?? '');
  const [type, setType] = useState(unitTypeLabel(editing?.type ?? DEFAULT_UNIT_TYPE));
  const [subtype, setSubtype] = useState(editing?.subtype ?? '');
  const [rentMonthly, setRentMonthly] = useState(editing?.rentMonthly ?? '');
  const [underMaintenance, setUnderMaintenance] = useState(editing?.underMaintenance ?? false);
  const [roomDetails, setRoomDetails] = useState(editing?.roomDetails ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!propertyId || !unitNo.trim()) {
      setError(t('err_unit_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        propertyId,
        unitNo: unitNo.trim(),
        floor: floor.trim() || undefined,
        type: storedUnitType(type),
        subtype: subtype.trim() || undefined,
        rentMonthly: parseFloat(String(rentMonthly)) || 0,
        roomDetails: roomDetails.trim() || undefined,
        underMaintenance,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? t('err_unit_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('units.modal.title_edit') : t('units.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('units.modal.property')}</label>
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
            <label>{t('units.modal.unit_no')}</label>
            <input className="num" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} placeholder={t('units.modal.unit_no_placeholder')} disabled={!!editing} />
          </div>
          <div className="field">
            <label>{t('units.modal.floor')}</label>
            <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder={t('units.modal.floor_placeholder')} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('units.modal.type')}</label>
            <input list="unit-type-list" value={type} onChange={(e) => setType(e.target.value)} placeholder={t('units.modal.type_placeholder')} />
            <datalist id="unit-type-list">
              {unitTypeSuggestions().map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>{t('units.modal.subtype')}</label>
            <input value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder={t('units.modal.subtype_placeholder')} />
          </div>
        </div>
        <div className="field">
          <label>{t('units.modal.rooms')}</label>
          <textarea rows={3} value={roomDetails} onChange={(e) => setRoomDetails(e.target.value)} placeholder={t('units.modal.rooms_placeholder')} />
        </div>
        <div className="field">
          <label>{t('units.modal.rent_monthly')}</label>
          <input className="num" value={rentMonthly} onChange={(e) => setRentMonthly(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={underMaintenance} onChange={(e) => setUnderMaintenance(e.target.checked)} style={{ width: 'auto' }} />
            {t('units.modal.under_maintenance')}
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('units.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('units.modal.save_edit') : t('units.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
