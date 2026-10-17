import { badgeAltOf, type BadgeMetaAlt } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listEmployees, type Employee } from '../../api/employees';
import {
  approveLeaveRequest,
  createLeaveRequest,
  createLeaveType,
  deleteLeaveRequest,
  deleteLeaveType,
  getLeaveBalance,
  listLeaveRequests,
  listLeaveTypes,
  rejectLeaveRequest,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from '../../api/leaves';
import { deleteAttendance, listAttendance, recordAttendance, updateAttendance, type AttendanceRecord, type AttendanceStatus } from '../../api/attendance';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, today } from '../../lib/format';

// `label` holds a translation key; it is turned into text where rendered.
const STATUS_META: Record<LeaveStatus, BadgeMetaAlt> = {
  PENDING: { label: 'hr.leave_status.pending', badge: 'draft' },
  APPROVED: { label: 'hr.leave_status.approved', badge: 'paid' },
  REJECTED: { label: 'hr.leave_status.rejected', badge: 'overdue' },
};

function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  return Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? fallback);
}

/**
 * Human resources, ported from the v20 mockup's `screen-hr`: a KPI row over
 * cards, one card per area, rather than a standalone page per feature.
 *
 * Only areas that actually work are rendered — attendance and leaves today;
 * the payroll card arrives when payroll exists (a dead button would be the
 * hollow shell this project's rules forbid).
 */
export function HrPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // Each control follows the action its route checks on the employees screen.
  const canAdd = can('employees', 'add');
  const canEdit = can('employees', 'edit');
  const canDelete = can('employees', 'delete');
  const canRecord = can('employees', 'record');
  const canReview = can('employees', 'review');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [managingTypes, setManagingTypes] = useState(false);
  const [reqEmp, setReqEmp] = useState('');
  const [reqType, setReqType] = useState('');
  const [reqStart, setReqStart] = useState(today());
  const [reqEnd, setReqEnd] = useState(today());
  const [reqReason, setReqReason] = useState('');

  const [typeName, setTypeName] = useState('');
  const [typeDays, setTypeDays] = useState('');
  const [typePaid, setTypePaid] = useState(true);

  // Attendance (SPEC 9.4)
  const [attDate, setAttDate] = useState(today());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attAdding, setAttAdding] = useState(false);
  const [attEmp, setAttEmp] = useState('');
  const [attStatus, setAttStatus] = useState<AttendanceStatus>('PRESENT');
  const [attCheckIn, setAttCheckIn] = useState('');

  const [balanceFor, setBalanceFor] = useState<{ name: string; data: LeaveBalance } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'type' | 'request'; id: string; label: string } | null>(null);

  async function reload() {
    const [emps, tps, reqs] = await Promise.all([listEmployees(), listLeaveTypes(), listLeaveRequests()]);
    setEmployees(emps);
    setTypes(tps);
    setRequests(reqs);
  }

  useEffect(() => {
    listAttendance(attDate).then(setAttendance).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attDate]);

  useEffect(() => {
    reload()
      .catch(() => setError(t('hr.err_load')))
      .finally(() => setLoading(false));
  }, []);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(apiError(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function reloadAttendance() {
    setAttendance(await listAttendance(attDate));
  }

  const pending = useMemo(() => requests.filter((r) => r.status === 'PENDING'), [requests]);
  const approvedDays = useMemo(() => requests.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + r.days, 0), [requests]);

  async function submitAttendance() {
    if (!attEmp) {
      setError(t('hr.attendance.err_employee'));
      return;
    }
    await run(async () => {
      await recordAttendance({ employeeId: attEmp, date: attDate, status: attStatus, checkIn: attCheckIn || undefined });
      await reloadAttendance();
      setAttAdding(false);
      setAttCheckIn('');
    }, t('hr.attendance.err_record'));
  }

  /** Check out now, stamped with the current clock time. */
  async function checkOutNow(rec: AttendanceRecord) {
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':'+ String(now.getMinutes()).padStart(2, '0');
    await run(async () => {
      await updateAttendance(rec.id, { checkOut: hhmm });
      await reloadAttendance();
    }, t('hr.attendance.err_checkout'));
  }

  async function submitRequest() {
    if (!reqEmp || !reqType) {
      setError(t('hr.requests.err_fields'));
      return;
    }
    await run(async () => {
      await createLeaveRequest({ employeeId: reqEmp, leaveTypeId: reqType, startDate: reqStart, endDate: reqEnd, reason: reqReason.trim() || undefined });
      setAdding(false);
      setReqReason('');
    }, t('hr.requests.err_create'));
  }

  async function submitType() {
    if (!typeName.trim()) {
      setError(t('hr.types.err_name'));
      return;
    }
    await run(async () => {
      await createLeaveType({ name: typeName.trim(), annualDays: parseInt(typeDays, 10) || 0, paid: typePaid });
      setTypeName('');
      setTypeDays('');
      setTypePaid(true);
    }, t('hr.types.err_save'));
  }

  async function showBalance(employeeId: string, name: string) {
    await run(async () => {
      const data = await getLeaveBalance(employeeId, new Date().getFullYear());
      setBalanceFor({ name, data });
    }, t('hr.balance.err_load'));
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    await run(async () => {
      if (kind === 'type') await deleteLeaveType(id);
      else await deleteLeaveRequest(id);
      setPendingDelete(null);
    }, t('hr.err_delete'));
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('hr.title')}</div>
          <div className="page-sub">{t('hr.subtitle')}</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="kpi-row">
        <div className="kpi-card neu">
          <div className="kpi-label">{t('hr.kpi.employees')}</div>
          <div className="kpi-value">{employees.length}</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">{t('hr.kpi.pending_leaves')}</div>
          <div className="kpi-value">{pending.length}</div>
        </div>
        <div className="kpi-card pos">
          <div className="kpi-label">{t('hr.kpi.approved_days')}</div>
          <div className="kpi-value">{approvedDays}</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">{attDate === today() ? t('hr.kpi.present_today') : t('hr.kpi.present_on_day')}</div>
          <div className="kpi-value">{attendance.filter((a) => a.status === 'PRESENT').length}</div>
        </div>
      </div>

      {/* Attendance */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">{t('hr.attendance.title')}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} style={{ width: 'auto' }} />
            {canRecord && (
              <button className="btn btn-ghost btn-sm" onClick={() => setAttAdding((v) => !v)}>
                {attAdding ? t('hr.common.cancel') : t('hr.attendance.add')}
              </button>
            )}
          </div>
        </div>

        {canRecord && attAdding && (
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="two-col">
              <div className="field">
                <label>{t('hr.common.employee')}</label>
                <select value={attEmp} onChange={(e) => setAttEmp(e.target.value)}>
                  <option value="">{t('hr.common.choose')}</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('hr.common.status')}</label>
                <select value={attStatus} onChange={(e) => setAttStatus(e.target.value as AttendanceStatus)}>
                  <option value="PRESENT">{t('hr.attendance.present')}</option>
                  <option value="ABSENT">{t('hr.attendance.absent')}</option>
                </select>
              </div>
            </div>
            {attStatus === 'PRESENT' && (
              <div className="field">
                <label>{t('hr.attendance.check_in_time')}</label>
                <input type="time" value={attCheckIn} onChange={(e) => setAttCheckIn(e.target.value)} style={{ width: 'auto' }} />
              </div>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={submitAttendance}>{t('hr.common.save')}</button>
          </div>
        )}

        {attendance.length === 0 ? (
          <p className="hint">{t('hr.attendance.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('hr.common.employee')}</th>
                <th>{t('hr.common.status')}</th>
                <th>{t('hr.attendance.col_in')}</th>
                <th>{t('hr.attendance.col_out')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((rec) => (
                <tr key={rec.id}>
                  <td>{rec.employee.fullName}</td>
                  <td><span className={`badge ${rec.status === 'PRESENT' ? 'paid' : 'overdue'}`}>{rec.status === 'PRESENT' ? t('hr.attendance.present') : t('hr.attendance.absent')}</span></td>
                  <td className="num">{rec.checkIn ?? '—'}</td>
                  <td className="num">{rec.checkOut ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {/* The current clock time belongs to today only; a past day would get the wrong time. */}
                    {canEdit && attDate === today() && rec.status === 'PRESENT' && !rec.checkOut && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => checkOutNow(rec)}>{t('hr.attendance.check_out_now')}</button>
                    )}{' '}
                    {canDelete && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(async () => { await deleteAttendance(rec.id); await reloadAttendance(); }, t('hr.err_delete'))}>{t('hr.common.delete')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Leave requests */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">{t('hr.requests.title', { n: requests.length })}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setManagingTypes((v) => !v)}>
              {managingTypes ? t('hr.types.hide') : t('hr.types.show')}
            </button>
            {canAdd && (
              <button className="btn btn-ghost btn-sm" disabled={types.length === 0} onClick={() => setAdding((v) => !v)}>
                {adding ? t('hr.common.cancel') : t('hr.requests.add')}
              </button>
            )}
          </div>
        </div>

        {types.length === 0 && <p className="hint">{t('hr.types.none_hint')}</p>}

        {managingTypes && (
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            {canAdd && (
              <>
                <div className="two-col">
                  <div className="field">
                    <label>{t('hr.types.name')}</label>
                    <input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder={t('hr.types.name_placeholder')} />
                  </div>
                  <div className="field">
                    <label>{t('hr.types.annual_days')}</label>
                    <input className="num" value={typeDays} onChange={(e) => setTypeDays(e.target.value)} placeholder={t('hr.types.annual_days_placeholder')} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={typePaid} onChange={(e) => setTypePaid(e.target.checked)} /> {t('hr.types.paid_label')}
                </label>
                <p className="hint" style={{ marginBottom: 8 }}>{t('hr.types.entitlement_hint')}</p>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={submitType}>
                  {t('hr.types.add')}
                </button>
              </>
            )}

            {types.length > 0 && (
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>{t('hr.common.type')}</th>
                    <th>{t('hr.common.entitlement')}</th>
                    <th>{t('hr.types.col_paid')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((lt) => (
                    <tr key={lt.id}>
                      <td>{lt.name}</td>
                      <td className="num">{lt.annualDays > 0 ? t('hr.common.days', { n: lt.annualDays }) : t('hr.common.no_limit')}</td>
                      <td>{lt.paid ? t('hr.types.yes') : t('hr.types.no')}</td>
                      <td>
                        {canDelete && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete({ kind: 'type', id: lt.id, label: lt.name })}>
                            {t('hr.common.delete')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {canAdd && adding && (
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="two-col">
              <div className="field">
                <label>{t('hr.common.employee')}</label>
                <select value={reqEmp} onChange={(e) => setReqEmp(e.target.value)}>
                  <option value="">{t('hr.common.choose')}</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('hr.requests.leave_type')}</label>
                <select value={reqType} onChange={(e) => setReqType(e.target.value)}>
                  <option value="">{t('hr.common.choose')}</option>
                  {types.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label>{t('hr.common.from')}</label>
                <input type="date" value={reqStart} onChange={(e) => setReqStart(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('hr.common.to')}</label>
                <input type="date" value={reqEnd} onChange={(e) => setReqEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>{t('hr.requests.reason')}</label>
              <input value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder={t('hr.requests.reason_placeholder')} />
            </div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={submitRequest}>
              {t('hr.requests.save')}
            </button>
          </div>
        )}

        {requests.length === 0 ? (
          <div className="empty-state">{t('hr.requests.empty')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('hr.common.employee')}</th>
                <th>{t('hr.common.type')}</th>
                <th>{t('hr.common.from')}</th>
                <th>{t('hr.common.to')}</th>
                <th>{t('hr.requests.col_days')}</th>
                <th>{t('hr.common.status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      onClick={() => showBalance(r.employee.id, r.employee.fullName)}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--accent, #2b6cb0)', textDecoration: 'underline', cursor: 'pointer' }}
                      title={t('hr.requests.show_balance')}
                    >
                      {r.employee.fullName}
                    </button>
                  </td>
                  <td>{r.leaveType.name}</td>
                  <td className="num">{dfmt(r.startDate)}</td>
                  <td className="num">{dfmt(r.endDate)}</td>
                  <td className="num">{r.days}</td>
                  <td>
                    <span className={`badge ${badgeAltOf(STATUS_META, r.status).badge}`}>{t(badgeAltOf(STATUS_META, r.status).label)}</span>
                    {/* Who decided is read from the row, not dug out of the audit log by id. When the decider is
                        also the requester it is said plainly, so the match is visible to the reader. */}
                    {r.decidedByName && (
                      <div className="muted" style={{ fontSize: '0.85em', marginTop: 2 }}>
                        {r.decidedById && r.requestedById && r.decidedById === r.requestedById
                          ? t('hr.requests.self_decided', { name: r.decidedByName })
                          : t('hr.requests.decided_by', { name: r.decidedByName })}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.status === 'PENDING' && (
                      <RowMenu
                        actions={[
                          canReview && { label: t('hr.requests.approve'), onClick: () => run(() => approveLeaveRequest(r.id), t('hr.requests.err_approve')) },
                          canReview && { label: t('hr.requests.reject'), onClick: () => run(() => rejectLeaveRequest(r.id), t('hr.requests.err_reject')) },
                          '-',
                          canDelete && { label: t('hr.requests.delete'), danger: true, onClick: () => setPendingDelete({ kind: 'request', id: r.id, label: t('hr.requests.delete_label') }) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {balanceFor && (
        <div className="overlay" onClick={() => setBalanceFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{t('hr.balance.title', { name: balanceFor.name, year: balanceFor.data.year })}</div>
              <button className="modal-close" onClick={() => setBalanceFor(null)}>
                ✕
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('hr.common.type')}</th>
                  <th>{t('hr.common.entitlement')}</th>
                  <th>{t('hr.balance.col_used')}</th>
                  <th>{t('hr.balance.col_remaining')}</th>
                </tr>
              </thead>
              <tbody>
                {balanceFor.data.types.map((row) => (
                  <tr key={row.leaveTypeId}>
                    <td>{row.name}</td>
                    <td className="num">{row.entitlement > 0 ? t('hr.common.days', { n: row.entitlement }) : t('hr.common.no_limit')}</td>
                    <td className="num">{t('hr.common.days', { n: row.used })}</td>
                    <td className="num">{row.remaining === null ? '—' : t('hr.common.days', { n: row.remaining })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('hr.delete_title')}
          body={t('hr.delete_body', { label: pendingDelete.label })}
          confirmLabel={t('hr.common.delete')}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
