import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bulkCreateUnits } from '../../api/units';
import type { Property } from '../../api/properties';

/**
 * Bulk units: a prefix and a count, so "A-" and 12 make A-1 to A-12.
 * All or nothing: the server rejects any number clash and names the clashing units.
 */
export function BulkUnitsModal({ properties, onCancel, onDone }: { properties: Property[]; onCancel: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('10');
  const [startAt, setStartAt] = useState('1');
  const [type, setType] = useState('سكني'); // i18n-exempt: stored unit type value
  const [rentMonthly, setRentMonthly] = useState('');
  const [floor, setFloor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = (() => {
    const n = Number(count) || 0;
    const s = Number(startAt) || 1;
    if (!prefix || n < 1) return '';
    const first = `${prefix}${s}`;
    const last = `${prefix}${s + n - 1}`;
    return n === 1 ? first : `${first} … ${last}`;
  })();

  async function handleSubmit() {
    setError(null);
    if (!propertyId || !prefix.trim() || !Number(count) || !Number(rentMonthly)) {
      setError(t('units.bulk.err_required'));
      return;
    }
    setSaving(true);
    try {
      await bulkCreateUnits({
        propertyId,
        prefix: prefix.trim(),
        count: Number(count),
        startAt: Number(startAt) || 1,
        type: type.trim() || 'سكني', // i18n-exempt: stored unit type value
        rentMonthly: Number(rentMonthly),
        floor: floor.trim() || undefined,
      });
      await onDone();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('units.bulk.err_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <div className="modal-title">{t('units.bulk.title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('units.bulk.property')}</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>{t('units.bulk.prefix')}</label>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={t('units.bulk.prefix_placeholder')} />
          </div>
          <div className="field">
            <label>{t('units.bulk.count')}</label>
            <input type="number" min="1" max="500" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('units.bulk.start_at')}</label>
            <input type="number" min="1" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>{t('units.bulk.type')}</label>
            <input value={type} onChange={(e) => setType(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('units.bulk.rent_monthly')}</label>
            <input type="number" min="0" value={rentMonthly} onChange={(e) => setRentMonthly(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('units.bulk.floor_optional')}</label>
            <input value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
        </div>
        {preview && (
          <p className="hint">
            {t('units.bulk.preview')}<b className="num">{preview}</b>
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('units.bulk.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {t('units.bulk.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
