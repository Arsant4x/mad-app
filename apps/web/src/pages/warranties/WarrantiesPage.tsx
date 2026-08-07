import { useEffect, useMemo, useState } from 'react';
import { listProperties, type Property } from '../../api/properties';
import { listUnits, type Unit } from '../../api/units';
import { createWarranty, deleteWarranty, listWarranties, updateWarranty, type Warranty } from '../../api/warranties';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, today } from '../../lib/format';

/** قيم النموذج كما تُكتب — التحويل إلى DTO يحدث عند الحفظ. */
interface WarrantyFormValues {
  propertyId: string;
  unitId: string;
  subject: string;
  provider: string;
  startDate: string;
  endDate: string;
  reference: string;
  terms: string;
  notes: string;
}

/** عتبة «يوشك»: شهر يكفي لمطالبة الجهة الضامنة قبل أن يسقط الحق. */
const EXPIRING_SOON_DAYS = 30;

function expiryMeta(w: Warranty): { label: string; badgeClass: string } {
  if (w.expired) return { label: 'منتهٍ', badgeClass: 'overdue' };
  if (w.daysLeft <= EXPIRING_SOON_DAYS) return { label: 'يوشك', badgeClass: 'due' };
  return { label: 'ساري', badgeClass: 'paid' };
}

export function WarrantiesPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; warranty: Warranty } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Warranty | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [ws, props, us] = await Promise.all([listWarranties(), listProperties(), listUnits()]);
    setWarranties(ws);
    setProperties(props);
    setUnits(us);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warranties;
    return warranties.filter(
      (w) =>
        w.subject.toLowerCase().includes(q) ||
        w.provider.toLowerCase().includes(q) ||
        w.property.name.toLowerCase().includes(q) ||
        (w.unit?.unitNo.toLowerCase().includes(q) ?? false) ||
        (w.reference?.toLowerCase().includes(q) ?? false),
    );
  }, [warranties, search]);

  async function handleSave(data: WarrantyFormValues) {
    if (modal?.mode === 'edit') {
      await updateWarranty(modal.warranty.id, {
        subject: data.subject,
        unitId: data.unitId || null,
        provider: data.provider,
        startDate: data.startDate,
        endDate: data.endDate,
        // النص الفارغ يمسح الحقل في الخادم — وهذا هو المقصود عند التعديل.
        reference: data.reference,
        terms: data.terms,
        notes: data.notes,
      });
    } else {
      await createWarranty({
        subject: data.subject,
        propertyId: data.propertyId,
        unitId: data.unitId || undefined,
        provider: data.provider,
        startDate: data.startDate,
        endDate: data.endDate,
        reference: data.reference || undefined,
        terms: data.terms || undefined,
        notes: data.notes || undefined,
      });
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteWarranty(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      // أبرز رفض متوقَّع: ضمان له مطالبات صيانة لا يُحذف — رسالة الخادم تشرح ذلك.
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? 'تعذّر حذف الضمان');
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الضمانات</div>
          <div className="page-sub">ضمانات ما هو مركَّب في العقارات — ومتى تنتهي تغطيتها</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })} disabled={properties.length === 0}>
            + ضمان جديد
          </button>
        </div>
      </div>

      {properties.length === 0 && <div className="empty-state">أضِف عقاراً أولاً حتى تتمكن من تسجيل الضمانات.</div>}

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بالاسم أو الجهة أو العقار أو المرجع..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الجهة</th>
              <th>الموقع</th>
              <th>من</th>
              <th>إلى</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">لا توجد ضمانات مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((w) => {
              const meta = expiryMeta(w);
              return (
                <tr key={w.id}>
                  <td>
                    {w.subject}
                    {w.reference && <div className="hint">مرجع: {w.reference}</div>}
                  </td>
                  <td>{w.provider}</td>
                  <td>
                    {w.property.name}
                    <div className="hint">{w.unit ? `وحدة ${w.unit.unitNo}` : 'العقار كله'}</div>
                  </td>
                  <td className="num">{dfmt(w.startDate)}</td>
                  <td className="num">{dfmt(w.endDate)}</td>
                  <td>
                    <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                    {!w.expired && w.daysLeft <= EXPIRING_SOON_DAYS && <div className="hint">متبقٍ {w.daysLeft} يوماً</div>}
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', warranty: w }) },
                        { label: '🗑 حذف', onClick: () => setPendingDelete(w), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <WarrantyModal
          editing={modal.mode === 'edit' ? modal.warranty : null}
          properties={properties}
          units={units}
          onCancel={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="حذف الضمان"
          body={deleteError ?? `حذف ضمان «${pendingDelete.subject}»؟`}
          confirmLabel="حذف"
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function WarrantyModal({
  editing,
  properties,
  units,
  onCancel,
  onSave,
}: {
  editing: Warranty | null;
  properties: Property[];
  units: Unit[];
  onCancel: () => void;
  onSave: (data: WarrantyFormValues) => Promise<void>;
}) {
  const [propertyId, setPropertyId] = useState(editing?.propertyId ?? properties[0]?.id ?? '');
  const [unitId, setUnitId] = useState(editing?.unitId ?? '');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [provider, setProvider] = useState(editing?.provider ?? '');
  const [startDate, setStartDate] = useState(editing ? editing.startDate.slice(0, 10) : today());
  const [endDate, setEndDate] = useState(editing ? editing.endDate.slice(0, 10) : '');
  const [reference, setReference] = useState(editing?.reference ?? '');
  const [terms, setTerms] = useState(editing?.terms ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitsOfProperty = units.filter((u) => u.propertyId === propertyId);

  async function handleSubmit() {
    setError(null);
    if (!subject.trim() || !provider.trim() || !propertyId || !startDate || !endDate) {
      setError('أكمل الحقول المطلوبة: الاسم والجهة والعقار وتاريخي البداية والنهاية');
      return;
    }
    // نفس فحص الخادم، لكن قبل الإرسال: نهاية قبل البداية خطأ كتابي مؤكد.
    if (endDate < startDate) {
      setError('تاريخ نهاية الضمان قبل بدايته');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        propertyId,
        unitId,
        subject: subject.trim(),
        provider: provider.trim(),
        startDate,
        endDate,
        reference: reference.trim(),
        terms: terms.trim(),
        notes: notes.trim(),
      });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر حفظ الضمان'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل الضمان' : 'ضمان جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="two-col">
          <div className="field">
            <label>العقار</label>
            {/* لا يقبل الخادم نقل الضمان بين العقارات — لذا يُقفل الحقل عند التعديل. */}
            <select
              value={propertyId}
              disabled={!!editing}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId('');
              }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>الوحدة</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">— العقار كله —</option>
              {unitsOfProperty.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNo}
                </option>
              ))}
            </select>
            <p className="hint">ضمان المصعد أو المولّد يخصّ العقار كله؛ ضمان مكيّف شقة يخصّ وحدتها.</p>
          </div>
        </div>
        <div className="field">
          <label>ما الذي يغطيه الضمان</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثال: مصعد المبنى الرئيسي" />
        </div>
        <div className="field">
          <label>الجهة الضامنة</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="اسم الشركة أو الوكيل الذي يلتزم بالضمان" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>بداية الضمان</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>نهاية الضمان</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>المرجع (اختياري)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="رقم الفاتورة أو العقد الذي نشأ عنه الضمان" />
        </div>
        <div className="field">
          <label>شروط التغطية (اختياري)</label>
          <textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="ما الذي يشمله الضمان وما الذي يستثنيه" />
        </div>
        <div className="field">
          <label>ملاحظات (اختياري)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة الضمان'}
          </button>
        </div>
      </div>
    </div>
  );
}
