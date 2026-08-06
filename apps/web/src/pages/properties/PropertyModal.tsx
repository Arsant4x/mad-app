import { useState } from 'react';
import type { ActivityType, Ownership, Property, PropertyInput } from '../../api/properties';
import { today } from '../../lib/format';
import i18n from '../../i18n';

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'residential', label: 'سكني' },
  { value: 'shop', label: 'محل' },
  { value: 'showroom', label: 'معرض' },
  { value: 'office', label: 'مكتب' },
  { value: 'warehouse', label: 'مخزن' },
  { value: 'mixed', label: 'مختلط' },
];

const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: 'owned', label: 'ملك' },
  { value: 'leased', label: 'إيجار' },
  { value: 'managed', label: 'تشغيل' },
];

export function PropertyModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Property | null;
  onCancel: () => void;
  onSave: (data: PropertyInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [floors, setFloors] = useState(String(editing?.floors ?? 1));
  const [activityType, setActivityType] = useState<ActivityType | ''>(editing?.activityType ?? '');
  const [activitySubtype, setActivitySubtype] = useState(editing?.activitySubtype ?? '');
  const [ownership, setOwnership] = useState<Ownership>(editing?.ownership ?? 'owned');
  const [deedNo, setDeedNo] = useState(editing?.deedNo ?? '');
  // Kept as strings so a half-typed "24." doesn't collapse to NaN mid-edit.
  const [lat, setLat] = useState(editing?.lat != null ? String(editing.lat) : '');
  const [lng, setLng] = useState(editing?.lng != null ? String(editing.lng) : '');
  const [leaseValue, setLeaseValue] = useState(editing?.leaseValue ?? '');
  const [leaseCycle, setLeaseCycle] = useState(editing?.leaseCycle ?? '');
  const [leaseStart, setLeaseStart] = useState(editing?.leaseStart?.slice(0, 10) ?? today());
  const [leaseEnd, setLeaseEnd] = useState(editing?.leaseEnd?.slice(0, 10) ?? today());
  const [opRate, setOpRate] = useState(editing?.opRate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_property_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        address: address.trim() || undefined,
        floors: parseInt(floors, 10) || 1,
        activityType: activityType || undefined,
        activitySubtype: activityType === 'residential' ? activitySubtype.trim() || undefined : undefined,
        ownership,
        deedNo: ownership === 'owned' ? deedNo.trim() || undefined : undefined,
        leaseValue: ownership === 'leased' ? parseFloat(String(leaseValue)) || undefined : undefined,
        leaseCycle: ownership === 'leased' ? leaseCycle.trim() || undefined : undefined,
        leaseStart: ownership === 'leased' ? leaseStart : undefined,
        leaseEnd: ownership === 'leased' ? leaseEnd : undefined,
        opRate: ownership === 'managed' ? parseFloat(String(opRate)) || undefined : undefined,
        // `|| undefined` would swallow a legitimate 0, so emptiness is checked
        // explicitly — longitude 0 is a real place.
        lat: lat.trim() === '' ? undefined : Number(lat),
        lng: lng.trim() === '' ? undefined : Number(lng),
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_property_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل العقار' : 'عقار جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم العقار</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: برج النخيل" />
        </div>
        <div className="field">
          <label>العنوان</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة — الحي" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>خط العرض (Latitude)</label>
            <input className="num" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="24.7136" />
          </div>
          <div className="field">
            <label>خط الطول (Longitude)</label>
            <input className="num" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="46.6753" />
            {/* Says where to get them, since nobody knows their coordinates by
                heart — and a property without them simply won't appear on the map. */}
            <p className="hint">انسخهما من خرائط جوجل (اضغط مطوّلاً على الموقع). العقار بدونهما لا يظهر على الخريطة.</p>
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>عدد الطوابق</label>
            <input className="num" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="1" />
          </div>
          <div className="field">
            <label>نوع النشاط</label>
            <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType | '')}>
              <option value="">بدون تخصيص</option>
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {activityType === 'residential' && (
          <div className="field">
            <label>الفئة السكنية المستهدفة</label>
            <input value={activitySubtype} onChange={(e) => setActivitySubtype(e.target.value)} placeholder="عوائل / عزاب / طالبات..." />
          </div>
        )}

        <div className="field">
          <label>الملكية</label>
          <select value={ownership} onChange={(e) => setOwnership(e.target.value as Ownership)}>
            {OWNERSHIP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {ownership === 'owned' && (
          <div className="field">
            <label>رقم الصك</label>
            <input className="num" value={deedNo} onChange={(e) => setDeedNo(e.target.value)} placeholder="رقم صك الملكية" />
          </div>
        )}

        {ownership === 'leased' && (
          <>
            <div className="two-col">
              <div className="field">
                <label>قيمة الإيجار</label>
                <input className="num" value={leaseValue} onChange={(e) => setLeaseValue(e.target.value)} placeholder="0.00" />
              </div>
              <div className="field">
                <label>دورة السداد</label>
                <input value={leaseCycle} onChange={(e) => setLeaseCycle(e.target.value)} placeholder="سنوية" />
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label>بداية عقد الإيجار</label>
                <input type="date" value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} />
              </div>
              <div className="field">
                <label>نهاية عقد الإيجار</label>
                <input type="date" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {ownership === 'managed' && (
          <div className="field">
            <label>نسبة عمولة التشغيل %</label>
            <input className="num" value={opRate} onChange={(e) => setOpRate(e.target.value)} placeholder="0.00" />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة العقار'}
          </button>
        </div>
      </div>
    </div>
  );
}
