import { AssignTaskButton } from '../../components/AssignTaskButton';
import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { usePermissions } from '../../auth/PermissionsContext';
import { dfmt, fmt, today } from '../../lib/format';
import i18n from '../../i18n';

/** Built at render so the labels follow the current language. */
const priorityMeta = (): Record<MaintenancePriority, { label: string; badgeClass: string }> => ({
  URGENT: { label: i18n.t('maintenance.priority.URGENT'), badgeClass: 'overdue' },
  HIGH: { label: i18n.t('maintenance.priority.HIGH'), badgeClass: 'due' },
  NORMAL: { label: i18n.t('maintenance.priority.NORMAL'), badgeClass: '' },
});

const statusMeta = (): Record<MaintenanceStatus, { label: string; badgeClass: string }> => ({
  REPORTED: { label: i18n.t('maintenance.status.REPORTED'), badgeClass: 'due' },
  ASSIGNED: { label: i18n.t('maintenance.status.ASSIGNED'), badgeClass: 'due' },
  IN_PROGRESS: { label: i18n.t('maintenance.status.IN_PROGRESS'), badgeClass: 'due' },
  DONE: { label: i18n.t('maintenance.status.DONE'), badgeClass: 'paid' },
  CLOSED: { label: i18n.t('maintenance.status.CLOSED'), badgeClass: 'paid' },
  CANCELLED: { label: i18n.t('maintenance.status.CANCELLED'), badgeClass: 'draft' },
});

const PRIORITIES: MaintenancePriority[] = ['URGENT', 'HIGH', 'NORMAL'];

/** Open work, in the order the landlord should deal with it. */
const OPEN_STATUSES: MaintenanceStatus[] = ['REPORTED', 'ASSIGNED', 'IN_PROGRESS'];

export function MaintenancePage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // A new request adds, assign and start edit, complete records, close reviews, cancel deletes: the server refuses them otherwise.
  const canAdd = can('maintenance', 'add');
  const canEdit = can('maintenance', 'edit');
  const canComplete = can('maintenance', 'record');
  const canClose = can('maintenance', 'review');
  const canCancel = can('maintenance', 'delete');
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
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('maintenance.page.err_failed')));
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

  const PRIORITY_META = priorityMeta();
  const STATUS_META = statusMeta();

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('maintenance.page.title')}</div>
          <div className="page-sub">{t('maintenance.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setAdding((v) => !v)} disabled={properties.length === 0}>
              {adding ? t('maintenance.page.cancel') : t('maintenance.page.new')}
            </button>
          )}
        </div>
      </div>

      {properties.length === 0 && <div className="empty-state">{t('maintenance.page.no_properties')}</div>}
      {error && <p className="error-text">{error}</p>}

      {canAdd && adding && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="two-col">
            <div className="field">
              <label>{t('maintenance.page.property')}</label>
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
              <label>{t('maintenance.page.unit')}</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">{t('maintenance.page.common_areas_option')}</option>
                {unitsOfProperty.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitNo}
                  </option>
                ))}
              </select>
              {/* Says why leaving it empty is a real choice, not a missing field. */}
              <p className="hint">{t('maintenance.page.unit_hint')}</p>
            </div>
          </div>
          <div className="field">
            <label>{t('maintenance.page.title_label')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('maintenance.page.title_placeholder')} />
          </div>
          <div className="field">
            <label>{t('maintenance.page.description')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="two-col">
            <div className="field">
              <label>{t('maintenance.page.priority')}</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {badgeOf(PRIORITY_META, p).label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('maintenance.page.reported_by')}</label>
              <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder={t('maintenance.page.reported_by_placeholder')} />
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
              {t('maintenance.page.submit')}
            </button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="chip-group">
          <button className={filter === 'open' ? 'chip active' : 'chip'} onClick={() => setFilter('open')}>
            {t('maintenance.page.filter_open', { n: requests.filter((r) => OPEN_STATUSES.includes(r.status)).length })}
          </button>
          <button className={filter === 'DONE' ? 'chip active' : 'chip'} onClick={() => setFilter('DONE')}>
            {t('maintenance.page.filter_done')}
          </button>
          <button className={filter === 'CLOSED' ? 'chip active' : 'chip'} onClick={() => setFilter('CLOSED')}>
            {t('maintenance.page.filter_closed')}
          </button>
          <button className={filter === 'all' ? 'chip active' : 'chip'} onClick={() => setFilter('all')}>
            {t('maintenance.page.filter_all')}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('maintenance.page.col_priority')}</th>
              <th>{t('maintenance.page.col_request')}</th>
              <th>{t('maintenance.page.col_location')}</th>
              <th>{t('maintenance.page.col_date')}</th>
              <th>{t('maintenance.page.col_status')}</th>
              <th>{t('maintenance.page.col_cost')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('maintenance.page.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className={`badge ${badgeOf(PRIORITY_META, r.priority).badgeClass}`}>{badgeOf(PRIORITY_META, r.priority).label}</span>
                </td>
                <td>
                  {r.title}
                  {r.description && <div className="hint">{r.description}</div>}
                  {r.assignedTo && <div className="hint">{t('maintenance.page.assigned_to', { name: r.assignedTo })}</div>}
                  {r.cancelReason && <div className="hint">{t('maintenance.page.cancel_reason', { reason: r.cancelReason })}</div>}
                </td>
                <td>
                  {r.property.name}
                  <div className="hint">{r.unit ? t('maintenance.page.unit_no', { unit: r.unit.unitNo }) : t('maintenance.page.common_areas')}</div>
                </td>
                <td className="num">{dfmt(r.reportedAt)}</td>
                <td>
                  <span className={`badge ${badgeOf(STATUS_META, r.status).badgeClass}`}>{badgeOf(STATUS_META, r.status).label}</span>
                </td>
                <td className="num">{r.cost ? fmt(r.cost) : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {/* Creates a follow-up task on the request (same component as in
                        contracts and invoices). Not the "assign" button below, which
                        sets the request's technician. */}
                    <AssignTaskButton screen="maintenance" entityId={r.id} />
                    {/* Only the moves the server would actually accept are
                        offered — a button that always 409s is worse than none. */}
                    {canEdit && r.status === 'REPORTED' && (
                      <button className="btn btn-ghost" onClick={() => openAction(r.id, 'assign')}>
                        {t('maintenance.page.action_assign')}
                      </button>
                    )}
                    {canEdit && (r.status === 'REPORTED' || r.status === 'ASSIGNED') && (
                      <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => startMaintenance(r.id, today()))}>
                        {t('maintenance.page.action_start')}
                      </button>
                    )}
                    {canComplete && r.status === 'IN_PROGRESS' && (
                      <button className="btn btn-ghost" onClick={() => openAction(r.id, 'complete')}>
                        {t('maintenance.page.action_complete')}
                      </button>
                    )}
                    {canClose && r.status === 'DONE' && (
                      <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => closeMaintenance(r.id, today()))}>
                        {t('maintenance.page.action_close')}
                      </button>
                    )}
                    {canCancel && OPEN_STATUSES.includes(r.status) && (
                      <button className="btn btn-ghost" style={{ color: 'var(--rose)' }} onClick={() => openAction(r.id, 'cancel')}>
                        {t('maintenance.page.action_cancel')}
                      </button>
                    )}
                  </div>

                  {action?.id === r.id && (
                    <div className="card" style={{ background: '#faf9f5', marginTop: 6 }}>
                      {action.kind === 'assign' && (
                        <div className="field">
                          <label>{t('maintenance.page.technician')}</label>
                          <input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder={t('maintenance.page.technician_placeholder')} />
                        </div>
                      )}
                      {action.kind === 'complete' && (
                        <div className="field">
                          <label>{t('maintenance.page.cost')}</label>
                          <input type="number" min="0" step="0.01" value={actionCost} onChange={(e) => setActionCost(e.target.value)} />
                          {/* Says exactly what will and won't be posted. */}
                          <p className="hint">{t('maintenance.page.cost_hint')}</p>
                        </div>
                      )}
                      {action.kind === 'cancel' && (
                        <div className="field">
                          <label>{t('maintenance.page.cancel_reason_label')}</label>
                          <input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder={t('maintenance.page.cancel_reason_placeholder')} />
                        </div>
                      )}
                      <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                        <button className="btn btn-ghost" onClick={() => setAction(null)}>
                          {t('maintenance.page.back')}
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
                          {t('maintenance.page.confirm')}
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
