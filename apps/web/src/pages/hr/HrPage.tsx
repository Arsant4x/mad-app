import { badgeAltOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
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
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, today } from '../../lib/format';

const STATUS_META: Record<LeaveStatus, { label: string; badge: string }> = {
  PENDING: { label: 'معلّق', badge: 'draft' },
  APPROVED: { label: 'موافَق', badge: 'paid' },
  REJECTED: { label: 'مرفوض', badge: 'overdue' },
};

function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  return Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? fallback);
}

/**
 * شؤون الموظفين — ported from the v20 mockup's `screen-hr`: a KPI row over
 * cards, one card per area, rather than a standalone page per feature.
 *
 * Only areas that actually work are rendered — attendance and leaves today;
 * the payroll card arrives when payroll exists (a dead button would be the
 * hollow shell this project's rules forbid).
 */
export function HrPage() {
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

  // ---- الحضور والانصراف (SPEC 9.4) ----
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
      .catch(() => setError('تعذّر تحميل بيانات شؤون الموظفين'))
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
      setError('اختر الموظف.');
      return;
    }
    await run(async () => {
      await recordAttendance({ employeeId: attEmp, date: attDate, status: attStatus, checkIn: attCheckIn || undefined });
      await reloadAttendance();
      setAttAdding(false);
      setAttCheckIn('');
    }, 'تعذّر تسجيل الحضور');
  }

  /** انصراف الآن — يختم بوقت الساعة الحالي. */
  async function checkOutNow(rec: AttendanceRecord) {
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':'+ String(now.getMinutes()).padStart(2, '0');
    await run(async () => {
      await updateAttendance(rec.id, { checkOut: hhmm });
      await reloadAttendance();
    }, 'تعذّر تسجيل الانصراف');
  }

  async function submitRequest() {
    if (!reqEmp || !reqType) {
      setError('اختر الموظف ونوع الإجازة.');
      return;
    }
    await run(async () => {
      await createLeaveRequest({ employeeId: reqEmp, leaveTypeId: reqType, startDate: reqStart, endDate: reqEnd, reason: reqReason.trim() || undefined });
      setAdding(false);
      setReqReason('');
    }, 'تعذّر إنشاء الطلب');
  }

  async function submitType() {
    if (!typeName.trim()) {
      setError('اسم نوع الإجازة مطلوب.');
      return;
    }
    await run(async () => {
      await createLeaveType({ name: typeName.trim(), annualDays: parseInt(typeDays, 10) || 0, paid: typePaid });
      setTypeName('');
      setTypeDays('');
      setTypePaid(true);
    }, 'تعذّر حفظ نوع الإجازة');
  }

  async function showBalance(employeeId: string, name: string) {
    await run(async () => {
      const data = await getLeaveBalance(employeeId, new Date().getFullYear());
      setBalanceFor({ name, data });
    }, 'تعذّر تحميل الرصيد');
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    await run(async () => {
      if (kind === 'type') await deleteLeaveType(id);
      else await deleteLeaveRequest(id);
      setPendingDelete(null);
    }, 'تعذّر الحذف');
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">شؤون الموظفين</div>
          <div className="page-sub">الحضور والانصراف · الإجازات وأرصدتها — ومسيّر الرواتب عند بنائه</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="kpi-row">
        <div className="kpi-card neu">
          <div className="kpi-label">الموظفون</div>
          <div className="kpi-value">{employees.length}</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">إجازات معلّقة</div>
          <div className="kpi-value">{pending.length}</div>
        </div>
        <div className="kpi-card pos">
          <div className="kpi-label">أيام إجازة معتمدة</div>
          <div className="kpi-value">{approvedDays}</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">{attDate === today() ? 'حضور اليوم' : 'حضور اليوم المحدَّد'}</div>
          <div className="kpi-value">{attendance.filter((a) => a.status === 'PRESENT').length}</div>
        </div>
      </div>

      {/* ---------- الحضور والانصراف ---------- */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">الحضور والانصراف</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} style={{ width: 'auto' }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setAttAdding((v) => !v)}>
              {attAdding ? 'إلغاء' : '+ تسجيل حضور'}
            </button>
          </div>
        </div>

        {attAdding && (
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="two-col">
              <div className="field">
                <label>الموظف</label>
                <select value={attEmp} onChange={(e) => setAttEmp(e.target.value)}>
                  <option value="">— اختر —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>الحالة</label>
                <select value={attStatus} onChange={(e) => setAttStatus(e.target.value as AttendanceStatus)}>
                  <option value="PRESENT">حاضر</option>
                  <option value="ABSENT">غائب</option>
                </select>
              </div>
            </div>
            {attStatus === 'PRESENT' && (
              <div className="field">
                <label>وقت الحضور</label>
                <input type="time" value={attCheckIn} onChange={(e) => setAttCheckIn(e.target.value)} style={{ width: 'auto' }} />
              </div>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={submitAttendance}>حفظ</button>
          </div>
        )}

        {attendance.length === 0 ? (
          <p className="hint">لا سجلات لهذا اليوم.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الحالة</th>
                <th>حضور</th>
                <th>انصراف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((rec) => (
                <tr key={rec.id}>
                  <td>{rec.employee.fullName}</td>
                  <td><span className={`badge ${rec.status === 'PRESENT' ? 'paid' : 'overdue'}`}>{rec.status === 'PRESENT' ? 'حاضر' : 'غائب'}</span></td>
                  <td className="num">{rec.checkIn ?? '—'}</td>
                  <td className="num">{rec.checkOut ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {rec.status === 'PRESENT' && !rec.checkOut && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => checkOutNow(rec)}>انصراف الآن</button>
                    )}{' '}
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(async () => { await deleteAttendance(rec.id); await reloadAttendance(); }, 'تعذّر الحذف')}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---------- طلبات الإجازة ---------- */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">طلبات الإجازة ({requests.length})</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setManagingTypes((v) => !v)}>
              {managingTypes ? 'إخفاء الأنواع' : 'أنواع الإجازات'}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={types.length === 0} onClick={() => setAdding((v) => !v)}>
              {adding ? 'إلغاء' : '+ طلب إجازة'}
            </button>
          </div>
        </div>

        {types.length === 0 && <p className="hint">أضِف نوع إجازة واحداً على الأقل قبل إنشاء طلب — اضغط «أنواع الإجازات».</p>}

        {managingTypes && (
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="two-col">
              <div className="field">
                <label>اسم النوع</label>
                <input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="سنوية / مرضية / بدون راتب" />
              </div>
              <div className="field">
                <label>الاستحقاق السنوي (أيام)</label>
                <input className="num" value={typeDays} onChange={(e) => setTypeDays(e.target.value)} placeholder="0 = بلا حدّ ثابت" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={typePaid} onChange={(e) => setTypePaid(e.target.checked)} /> مدفوعة الأجر
            </label>
            <p className="hint" style={{ marginBottom: 8 }}>أنت من يحدّد الاستحقاق — النظام لا يفترض عدداً نظامياً.</p>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={submitType}>
              إضافة النوع
            </button>

            {types.length > 0 && (
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>النوع</th>
                    <th>الاستحقاق</th>
                    <th>مدفوعة؟</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td className="num">{t.annualDays > 0 ? `${t.annualDays} يوم` : 'بلا حدّ'}</td>
                      <td>{t.paid ? 'نعم' : 'لا'}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete({ kind: 'type', id: t.id, label: t.name })}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {adding && (
          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div className="two-col">
              <div className="field">
                <label>الموظف</label>
                <select value={reqEmp} onChange={(e) => setReqEmp(e.target.value)}>
                  <option value="">— اختر —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>نوع الإجازة</label>
                <select value={reqType} onChange={(e) => setReqType(e.target.value)}>
                  <option value="">— اختر —</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label>من</label>
                <input type="date" value={reqStart} onChange={(e) => setReqStart(e.target.value)} />
              </div>
              <div className="field">
                <label>إلى</label>
                <input type="date" value={reqEnd} onChange={(e) => setReqEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>السبب (اختياري)</label>
              <input value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="مثال: سفر عائلي" />
            </div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={submitRequest}>
              حفظ الطلب
            </button>
          </div>
        )}

        {requests.length === 0 ? (
          <div className="empty-state">لا طلبات إجازة.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>النوع</th>
                <th>من</th>
                <th>إلى</th>
                <th>الأيام</th>
                <th>الحالة</th>
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
                      title="عرض رصيد إجازاته"
                    >
                      {r.employee.fullName}
                    </button>
                  </td>
                  <td>{r.leaveType.name}</td>
                  <td className="num">{dfmt(r.startDate)}</td>
                  <td className="num">{dfmt(r.endDate)}</td>
                  <td className="num">{r.days}</td>
                  <td>
                    <span className={`badge ${badgeAltOf(STATUS_META, r.status).badge}`}>{badgeAltOf(STATUS_META, r.status).label}</span>
                    {/* ⭐ **من قرّر يُقرأ من الصفّ** (`ق-٦٢١`): كان الاسمُ في سجلّ
                        التدقيق وحدَه، **فـ«اعتمده فلان» تحتاج نبشاً بالمعرّف**.
                        وحين يكون المقرِّرُ هو من قدّم يُقال ذلك صراحةً — **فالتطابقُ
                        مرئيٌّ لمن يقرأ لا مدفونٌ في حقلين**. */}
                    {r.decidedByName && (
                      <div className="muted" style={{ fontSize: '0.85em', marginTop: 2 }}>
                        {r.decidedById && r.requestedById && r.decidedById === r.requestedById
                          ? `بتٌّ ذاتيّ — قدّمه وبتّ فيه ${r.decidedByName}`
                          : `بقرار ${r.decidedByName}`}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.status === 'PENDING' && (
                      <RowMenu
                        actions={[
                          { label: 'موافقة', onClick: () => run(() => approveLeaveRequest(r.id), 'تعذّرت الموافقة') },
                          { label: 'رفض', onClick: () => run(() => rejectLeaveRequest(r.id), 'تعذّر الرفض') },
                          '-',
                          { label: 'حذف الطلب', danger: true, onClick: () => setPendingDelete({ kind: 'request', id: r.id, label: 'طلب الإجازة' }) },
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
              <div className="modal-title">رصيد إجازات {balanceFor.name} — {balanceFor.data.year}</div>
              <button className="modal-close" onClick={() => setBalanceFor(null)}>
                ✕
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>الاستحقاق</th>
                  <th>المستخدم</th>
                  <th>المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {balanceFor.data.types.map((row) => (
                  <tr key={row.leaveTypeId}>
                    <td>{row.name}</td>
                    <td className="num">{row.entitlement > 0 ? `${row.entitlement} يوم` : 'بلا حدّ'}</td>
                    <td className="num">{row.used} يوم</td>
                    <td className="num">{row.remaining === null ? '—' : `${row.remaining} يوم`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="تأكيد الحذف"
          body={`سيُحذف "${pendingDelete.label}".`}
          confirmLabel="حذف"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
