import { useEffect, useMemo, useState } from 'react';
import {
  assignMaintenance,
  cancelMaintenance,
  closeMaintenance,
  completeMaintenance,
  createMaintenance,
  listMaintenance,
  startMaintenance,
  type MaintenancePriority,
  type MaintenanceRequest,
  type MaintenanceStatus,
} from '../../api/maintenance';
import { listProperties, type Property } from '../../api/properties';
import { listUnits, type Unit } from '../../api/units';
import { dfmt, fmt, today } from '../../lib/format';

const PRIORITY_META: Record<MaintenancePriority, { label: string; badgeClass: string }> = {
  URGENT: { label: 'عاجل', badgeClass: 'overdue' },
  HIGH: { label: 'مرتفع', badgeClass: 'due' },
  NORMAL: { label: 'عادي', badgeClass: '' },
};

const STATUS_META: Record<MaintenanceStatus, { label: string; badgeClass: string }> = {
  REPORTED: { label: 'بلاغ جديد', badgeClass: 'due' },
  ASSIGNED: { label: 'مُسنَد', badgeClass: 'due' },
  IN_PROGRESS: { label: 'قيد التنفيذ', badgeClass: 'due' },
  DONE: { label: 'منجز', badgeClass: 'paid' },
  CLOSED: { label: 'مغلق', badgeClass: 'paid' },
  CANCELLED: { label: 'ملغى', badgeClass: 'draft' },
};

const PRIORITIES = Object.keys(PRIORITY_META) as MaintenancePriority[];

/** Open work, in the order the landlord should deal with it. */
const OPEN_STATUSES: MaintenanceStatus[] = ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'];

export function MaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all' | MaintenanceStatus>('open');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The row whose action form is open, and which action it is. */
  const [action, setAction] = useState<{ id: string; kind: 'assign' | 'complete' | 'cancel' } | null>(null);
  const [actionText, setActionText] = useState('');
  const [actionCost, setActionCost] = useState('');

  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenancePriority>('NORMAL');
  const [reportedBy, setReportedBy] = useState('');

  async function reload() {
    const [reqs, props, us] = await Promise.all([listMaintenance(), listProperties(), listUnits()]);
    setRequests(reqs);
    setProperties(props);
    setUnits(us);
    if (!propertyId && props.length > 0) setPropertyId(props[0].id);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (filter === 'all') return requests;
    if (filter === 'open') return requests.filter((r) => OPEN_STATUSES.includes(r.status));
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const unitsOfProperty = units.filter((u) => u.propertyId === propertyId);

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
      after?.();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إتمام العملية'));
    } finally {
      setBusy(false);
    }
  }

  function openAction(id: string, kind: 'assign' | 'complete' | 'cancel') {
    setAction(action?.id === id && action.kind === kind ? null : { id, kind });
    setActionText('');
    setActionCost('');
    setError(null);
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الصيانة</div>
          <div className="page-sub">بلاغات الصيانة من الاستلام حتى الإغلاق</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setAdding((v) => !v)} disabled={properties.length === 0}>
            {adding ? 'إلغاء' : '+ بلاغ جديد'}
          </button>
        </div>
      </div>

      {properties.length === 0 && <div className="empty-state">أضِف عقاراً أولاً حتى تتمكن من تسجيل بلاغات الصيانة.</div>}
      {error && <p className="error-text">{error}</p>}

      {adding && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>العقار</label>
              <select
                value={propertyId}
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
                <option value="">— مرافق مشتركة —</option>
                {unitsOfProperty.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitNo}
                  </option>
                ))}
              </select>
              {/* Says why leaving it empty is a real choice, not a missing field. */}
              <p className="hint">عطل في المصعد أو المولّد أو السطح يخصّ العقار كله، لا وحدة بعينها.</p>
            </div>
          </div>
          <div className="field">
            <label>عنوان البلاغ</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تسريب في سخان المياه" />
          </div>
          <div className="field">
            <label>الوصف</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="two-col">
            <div className="field">
              <label>الأولوية</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>مقدِّم البلاغ</label>
              <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="اسم المستأجر أو الحارس" />
            </div>
          </div>
          <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
            <button
              className="btn btn-primary"
              disabled={busy || !title.trim()}
              onClick={() =>
                run(
                  () =>
                    createMaintenance({
                      propertyId,
                      unitId: unitId || undefined,
                      title: title.trim(),
                      description: description.trim() || undefined,
                      priority,
                      reportedBy: reportedBy.trim() || undefined,
                      reportedAt: today(),
                    }),
                  () => {
                    setAdding(false);
                    setTitle('');
                    setDescription('');
                    setReportedBy('');
                    setPriority('NORMAL');
                  },
                )
              }
            >
              تسجيل البلاغ
            </button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="chip-group">
          <button className={filter === 'open' ? 'chip active' : 'chip'} onClick={() => setFilter('open')}>
            مفتوحة ({requests.filter((r) => OPEN_STATUSES.includes(r.status)).length})
          </button>
          <button className={filter === 'DONE' ? 'chip active' : 'chip'} onClick={() => setFilter('DONE')}>
            منجزة
          </button>
          <button className={filter === 'CLOSED' ? 'chip active' : 'chip'} onClick={() => setFilter('CLOSED')}>
            مغلقة
          </button>
          <button className={filter === 'all' ? 'chip active' : 'chip'} onClick={() => setFilter('all')}>
            الكل
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>الأولوية</th>
              <th>البلاغ</th>
              <th>الموقع</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>التكلفة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">لا توجد بلاغات</div>
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className={`badge ${PRIORITY_META[r.priority].badgeClass}`}>{PRIORITY_META[r.priority].label}</span>
                </td>
                <td>
                  {r.title}
                  {r.description && <div className="hint">{r.description}</div>}
                  {r.assignedTo && <div className="hint">مُسنَد إلى: {r.assignedTo}</div>}
                  {r.cancelReason && <div className="hint">سبب الإلغاء: {r.cancelReason}</div>}
                </td>
                <td>
                  {r.property.name}
                  <div className="hint">{r.unit ? `وحدة ${r.unit.unitNo}` : 'مرافق مشتركة'}</div>
                </td>
                <td className="num">{dfmt(r.reportedAt)}</td>
                <td>
                  <span className={`badge ${STATUS_META[r.status].badgeClass}`}>{STATUS_META[r.status].label}</span>
                </td>
                <td className="num">{r.cost ? fmt(r.cost) : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {/* Only the moves the server would actually accept are
                        offered — a button that always 409s is worse than none. */}
                    {r.status === 'REPORTED' && (
                      <button className="btn btn-ghost" onClick={() => openAction(r.id, 'assign')}>
                        إسناد
                      </button>
                    )}
                    {(r.status === 'REPORTED' || r.status === 'ASSIGNED') && (
                      <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => startMaintenance(r.id, today()))}>
                        بدء التنفيذ
                      </button>
                    )}
                    {r.status === 'IN_PROGRESS' && (
                      <button className="btn btn-ghost" onClick={() => openAction(r.id, 'complete')}>
                        إنجاز
                      </button>
                    )}
                    {r.status === 'DONE' && (
                      <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => closeMaintenance(r.id, today()))}>
                        إغلاق
                      </button>
                    )}
                    {OPEN_STATUSES.includes(r.status) && (
                      <button className="btn btn-ghost" style={{ color: 'var(--rose)' }} onClick={() => openAction(r.id, 'cancel')}>
                        إلغاء
                      </button>
                    )}
                  </div>

                  {action?.id === r.id && (
                    <div className="card" style={{ background: '#faf9f5', marginTop: 6 }}>
                      {action.kind === 'assign' && (
                        <div className="field">
                          <label>الفني أو المقاول</label>
                          <input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="اسم الفني أو المؤسسة" />
                        </div>
                      )}
                      {action.kind === 'complete' && (
                        <div className="field">
                          <label>التكلفة</label>
                          <input type="number" min="0" step="0.01" value={actionCost} onChange={(e) => setActionCost(e.target.value)} />
                          {/* Says exactly what will and won't be posted. */}
                          <p className="hint">
                            تُرحَّل مصروف صيانة مقابل النقدية. اتركها فارغة إن لم تكلّف الشركة شيئاً — لن يُسجَّل أي قيد. ولتحميلها على المستأجر
                            أنشئ مطالبة من شاشة العقد.
                          </p>
                        </div>
                      )}
                      {action.kind === 'cancel' && (
                        <div className="field">
                          <label>سبب الإلغاء</label>
                          <input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="مثال: أصلحه المستأجر" />
                        </div>
                      )}
                      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                        <button className="btn btn-ghost" onClick={() => setAction(null)}>
                          تراجع
                        </button>
                        <button
                          className="btn btn-primary"
                          disabled={busy || (action.kind !== 'complete' && !actionText.trim())}
                          onClick={() =>
                            run(() => {
                              if (action.kind === 'assign') return assignMaintenance(r.id, actionText.trim());
                              if (action.kind === 'cancel') return cancelMaintenance(r.id, actionText.trim());
                              return completeMaintenance(r.id, {
                                completedAt: today(),
                                cost: actionCost.trim() === '' ? undefined : Number(actionCost),
                              });
                            }, () => setAction(null))
                          }
                        >
                          تأكيد
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
