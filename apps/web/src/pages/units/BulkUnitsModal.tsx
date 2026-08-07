import { useState } from 'react';
import { bulkCreateUnits } from '../../api/units';
import type { Property } from '../../api/properties';

/**
 * وحدات بالجملة (§16): بادئة + عدد — «A-» و12 تنتج A-1 حتى A-12.
 * كلٌّ أو لا شيء: أي تصادم في الأرقام يرفضه الخادم مسمّياً المتصادمات.
 */
export function BulkUnitsModal({ properties, onCancel, onDone }: { properties: Property[]; onCancel: () => void; onDone: () => Promise<void> }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('10');
  const [startAt, setStartAt] = useState('1');
  const [type, setType] = useState('سكني');
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
      setError('العقار والبادئة والعدد والإيجار الشهري مطلوبة.');
      return;
    }
    setSaving(true);
    try {
      await bulkCreateUnits({
        propertyId,
        prefix: prefix.trim(),
        count: Number(count),
        startAt: Number(startAt) || 1,
        type: type.trim() || 'سكني',
        rentMonthly: Number(rentMonthly),
        floor: floor.trim() || undefined,
      });
      await onDone();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر الإنشاء بالجملة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <div className="modal-title">وحدات بالجملة</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>العقار</label>
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
            <label>البادئة</label>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="A-" />
          </div>
          <div className="field">
            <label>العدد</label>
            <input type="number" min="1" max="500" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="field">
            <label>يبدأ من</label>
            <input type="number" min="1" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>النوع</label>
            <input value={type} onChange={(e) => setType(e.target.value)} />
          </div>
          <div className="field">
            <label>الإيجار الشهري</label>
            <input type="number" min="0" value={rentMonthly} onChange={(e) => setRentMonthly(e.target.value)} />
          </div>
          <div className="field">
            <label>الدور (اختياري)</label>
            <input value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
        </div>
        {preview && (
          <p className="hint">
            سيُنشأ: <b className="num">{preview}</b>
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            إنشاء الوحدات
          </button>
        </div>
      </div>
    </div>
  );
}
