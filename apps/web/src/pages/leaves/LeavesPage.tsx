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
  updateLeaveType,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from '../../api/leaves';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt } from '../../lib/format';

const STATUS_META: Record<LeaveStatus, { label: string; badge: string }> = {
  PENDING: { label: 'معلّق', badge: 'draft' },
  APPROVED: { label: 'موافَق', badge: 'paid' },
  REJECTED: { label: 'مرفوض', badge: 'overdue' },
};

type View = 'requests' | 'types' | 'balance';

function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  return Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? fallback);
}

export function LeavesPage() {
  const [view, setView] = useState<View>('requests');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Request filters + form
  const [filterEmployee, setFilterEmployee] = useState('');
  const [addingReq, setAddingReq] = useState(false);
  const [reqEmp, setReqEmp] = useState('');
  const [reqType, setReqType] = useState('');
  const [reqStart, setReqStart] = useState('');
  const [reqEnd, setReqEnd] = useState('');
  const [reqReason, setReqReason] = useState('');

  // Type form (create/edit)
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [addingType, setAddingType] = useState(false);
  const [typeName, setTypeName] = useState('');
  const [typeDays, setTypeDays] = useState('');
  const [typePaid, setTypePaid] = useState(true);

  // Balance
  const [balEmp, setBalEmp] = useState('');
  const [balYear, setBalYear] = useState(String(new Date().getFullYear()));
  const [balance, setBalance] = useState<LeaveBalance | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{ kind: 'type' | 'request'; id: string; label: string } | null>(null);

  async function reloadRequests(emp = filterEmployee) {
    setRequests(await listLeaveRequests(emp || undefined));
  }

  useEffect(() => {
    Promise.all([listEmployees().then(setEmployees), listLeaveTypes().then(setTypes), reloadRequests()])
      .catch(() => setError('تعذّر تحميل البيانات'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(apiError(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest() {
    if (!reqEmp || !reqType || !reqStart || !reqEnd) {
      setError('اختر الموظف والنوع وتاريخي البداية والنهاية.');
      return;
    }
    await run(async () => {
      await createLeaveRequest({ employeeId: reqEmp, leaveTypeId: reqType, startDate: reqStart, endDate: reqEnd, reason: reqReason.trim() || undefined });
      setAddingReq(false);
      setReqReason('');
      setReqStart('');
      setReqEnd('');
      await reloadRequests();
    }, 'تعذّر إنشاء الطلب');
  }

  function startEditType(t: LeaveType) {
    setEditingType(t);
    setAddingType(true);
    setTypeName(t.name);
    setTypeDays(String(t.annualDays));
    setTypePaid(t.paid);
  }

  async function submitType() {
    if (!typeName.trim()) {
      setError('اسم النوع مطلوب.');
      return;
    }
    const payload = { name: typeName.trim(), annualDays: parseInt(typeDays, 10) || 0, paid: typePaid };
    await run(async () => {
      if (editingType) await updateLeaveType(editingType.id, payload);
      else await createLeaveType(payload);
      setAddingType(false);
      setEditingType(null);
      setTypeName('');
      setTypeDays('');
      setTypePaid(true);
      setTypes(await listLeaveTypes());
    }, 'تعذّر حفظ النوع');
  }

  async function loadBalance() {
    if (!balEmp) {
      setError('اختر الموظف.');
      return;
    }
    await run(async () => setBalance(await getLeaveBalance(balEmp, parseInt(balYear, 10) || new Date().getFullYear())), 'تعذّر تحميل الرصيد');
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    await run(async () => {
      if (kind === 'type') {
        await deleteLeaveType(id);
        setTypes(await listLeaveTypes());
      } else {
        await deleteLeaveRequest(id);
        await reloadRequests();
      }
      setPendingDelete(null);
    }, 'تعذّر الحذف');
  }

  const filteredRequests = useMemo(() => requests, [requests]);

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الإجازات</div>
          <div className="page-sub">أنواع الإجازات باستحقاقات تحدّدها بنفسك، وطلبات بموافقة، ورصيد محسوب لكل موظف</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="chip-group" style={{ marginBottom: 12 }}>
        <button className={view === 'requests' ? 'chip active' : 'chip'} onClick={() => setView('requests')}>الطلبات</button>
        <button className={view === 'types' ? 'chip active' : 'chip'} onClick={() => setView('types')}>الأنواع</button>
        <button className={view === 'balance' ? 'chip active' : 'chip'} onClick={() => setView('balance')}>الأرصدة</button>
      </div>

      {/* ---------------- Requests ---------------- */}
      {view === 'requests' && (
        <div>
          <div className="toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <select
              value={filterEmployee}
              onChange={(e) => {
                setFilterEmployee(e.target.value);
                reloadRequests(e.target.value);
              }}
            >
              <option value="">كل الموظفين</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.fullName}</option>
              ))}
            </select>
            <button className="btn btn-primary" disabled={types.length === 0} onClick={() => setAddingReq((v) => !v)}>
              {addingReq ? 'إلغاء' : '+ طلب إجازة'}
            </button>
          </div>
          {types.length === 0 && <p className="hint">أضِف نوع إجازة واحداً على الأقل من تبويب «الأنواع» قبل إنشاء طلب.</p>}

          {addingReq && (
            <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
              <div className="two-col">
                <div className="field">
                  <label>الموظف</label>
                  <select value={reqEmp} onChange={(e) => setReqEmp(e.target.value)}>
                    <option value="">— اختر —</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>نوع الإجازة</label>
                  <select value={reqType} onChange={(e) => setReqType(e.target.value)}>
                    <option value="">— اختر —</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
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
              <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                <button className="btn btn-primary" disabled={busy} onClick={submitRequest}>حفظ الطلب</button>
              </div>
            </div>
          )}

          {filteredRequests.length === 0 ? (
            <div className="empty-state">لا طلبات إجازة.</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
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
                  {filteredRequests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.employee.fullName}</td>
                      <td>{r.leaveType.name}</td>
                      <td className="num">{dfmt(r.startDate)}</td>
                      <td className="num">{dfmt(r.endDate)}</td>
                      <td className="num">{r.days}</td>
                      <td><span className={`badge ${STATUS_META[r.status].badge}`}>{STATUS_META[r.status].label}</span></td>
                      <td>
                        {r.status === 'PENDING' && (
                          <RowMenu
                            actions={[
                              { label: 'موافقة', onClick: () => run(async () => { await approveLeaveRequest(r.id); await reloadRequests(); }, 'تعذّرت الموافقة') },
                              { label: 'رفض', onClick: () => run(async () => { await rejectLeaveRequest(r.id); await reloadRequests(); }, 'تعذّر الرفض') },
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
            </div>
          )}
        </div>
      )}

      {/* ---------------- Types ---------------- */}
      {view === 'types' && (
        <div>
          <div className="toolbar" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingType(null);
                setTypeName('');
                setTypeDays('');
                setTypePaid(true);
                setAddingType((v) => !v);
              }}
            >
              {addingType && !editingType ? 'إلغاء' : '+ نوع إجازة'}
            </button>
          </div>

          {addingType && (
            <div className="card" style={{ background: '#faf9f5', marginBottom: 10 }}>
              <div className="two-col">
                <div className="field">
                  <label>الاسم</label>
                  <input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="سنوية / مرضية / بدون راتب" />
                </div>
                <div className="field">
                  <label>الاستحقاق السنوي (أيام)</label>
                  <input className="num" value={typeDays} onChange={(e) => setTypeDays(e.target.value)} placeholder="0 = بلا حدّ ثابت" />
                </div>
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={typePaid} onChange={(e) => setTypePaid(e.target.checked)} /> مدفوعة الأجر
                </label>
                <p className="hint">أنت من يحدّد الاستحقاق — النظام لا يفترض عدداً نظامياً. اجعله 0 للإجازات بلا حدّ (كبدون راتب).</p>
              </div>
              <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                <button className="btn btn-primary" disabled={busy} onClick={submitType}>{editingType ? 'حفظ التعديل' : 'إضافة'}</button>
              </div>
            </div>
          )}

          {types.length === 0 ? (
            <div className="empty-state">لا أنواع إجازات بعد.</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الاستحقاق السنوي</th>
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
                        <RowMenu
                          actions={[
                            { label: 'تعديل', onClick: () => startEditType(t) },
                            { label: 'حذف', danger: true, onClick: () => setPendingDelete({ kind: 'type', id: t.id, label: t.name }) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------- Balance ---------------- */}
      {view === 'balance' && (
        <div>
          <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>الموظف</label>
              <select value={balEmp} onChange={(e) => setBalEmp(e.target.value)}>
                <option value="">— اختر —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, maxWidth: 120 }}>
              <label>السنة</label>
              <input className="num" value={balYear} onChange={(e) => setBalYear(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={loadBalance}>عرض الرصيد</button>
          </div>

          {balance && (
            <div className="card" style={{ padding: 0, marginTop: 10 }}>
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
                  {balance.types.map((row) => (
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
          )}
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
