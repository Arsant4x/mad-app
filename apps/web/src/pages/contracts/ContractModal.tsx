import { useState } from 'react';
import type { Property } from '../../api/properties';
import type { Unit } from '../../api/units';
import type { ContractCycle, CreateContractInput, Furnished } from '../../api/contracts';
import { today } from '../../lib/format';

const CYCLE_OPTIONS: { value: ContractCycle; label: string }[] = [
  { value: 'monthly', label: 'شهرية' },
  { value: 'quarterly', label: 'ربع سنوية' },
  { value: 'semiannual', label: 'نصف سنوية' },
  { value: 'annual', label: 'سنوية' },
];

const FURNISHED_OPTIONS: { value: Furnished; label: string }[] = [
  { value: 'unfurnished', label: 'غير مؤثثة' },
  { value: 'furnished', label: 'مؤثثة' },
  { value: 'partial', label: 'مفروشة جزئياً' },
];

export function ContractModal({
  units,
  properties,
  onCancel,
  onSave,
}: {
  units: Unit[];
  properties: Property[];
  onCancel: () => void;
  onSave: (data: CreateContractInput) => Promise<void>;
}) {
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [tenant, setTenant] = useState('');
  const [phone, setPhone] = useState('');
  const [value, setValue] = useState('');
  const [cycle, setCycle] = useState<ContractCycle>('monthly');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [deposit, setDeposit] = useState('');
  const [services, setServices] = useState('');
  const [furnished, setFurnished] = useState<Furnished | ''>('');
  const [ejarNo, setEjarNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(draft: boolean) {
    setError(null);
    if (!unitId || !tenant.trim() || !value) {
      setError('الرجاء اختيار الوحدة وإدخال اسم المستأجر والقيمة');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        unitId,
        tenant: tenant.trim(),
        phone: phone.trim() || undefined,
        value: parseFloat(value) || 0,
        cycle,
        start,
        end,
        deposit: parseFloat(String(deposit)) || undefined,
        services: services.trim() || undefined,
        furnished: furnished || undefined,
        ejarNo: ejarNo.trim() || undefined,
        draft,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر حفظ العقد');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">عقد إيجار جديد</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>الوحدة</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {propertyById.get(u.propertyId)?.name ?? '—'} — {u.unitNo}
              </option>
            ))}
          </select>
        </div>
        <div className="two-col">
          <div className="field">
            <label>اسم المستأجر</label>
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="اسم المستأجر" />
          </div>
          <div className="field">
            <label>الجوال</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>قيمة العقد</label>
            <input className="num" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>دورة السداد</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value as ContractCycle)}>
              {CYCLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>تاريخ البداية</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>تاريخ النهاية</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>مبلغ التأمين</label>
            <input className="num" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>الأثاث</label>
            <select value={furnished} onChange={(e) => setFurnished(e.target.value as Furnished | '')}>
              <option value="">—</option>
              {FURNISHED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>الخدمات المشمولة</label>
          <input value={services} onChange={(e) => setServices(e.target.value)} placeholder="كهرباء، صيانة، إنترنت..." />
        </div>
        <div className="field">
          <label>رقم العقد في إيجار (اختياري)</label>
          <input className="num" value={ejarNo} onChange={(e) => setEjarNo(e.target.value)} placeholder="رقم العقد بمنصة إيجار" />
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-ghost" onClick={() => submit(true)} disabled={saving}>
            حفظ كمسودة
          </button>
          <button className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
            إضافة العقد
          </button>
        </div>
      </div>
    </div>
  );
}
