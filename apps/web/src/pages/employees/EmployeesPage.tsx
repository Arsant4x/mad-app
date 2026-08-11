import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { createEmployee, deleteEmployee, listEmployees, setEmployeeArchived, updateEmployee, type Employee, type EmployeeInput, type EmployeeStatus } from '../../api/employees';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { EmployeeModal } from './EmployeeModal';

const STATUS_META: Record<EmployeeStatus, { label: string; badgeClass: string }> = {
  ACTIVE: { label: 'نشط', badgeClass: 'paid' },
  SUSPENDED: { label: 'موقوف', badgeClass: 'due' },
  TERMINATED: { label: 'منتهي', badgeClass: 'overdue' },
};

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default (gap-analysis §1).
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; employee: Employee } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);

  async function reload() {
    setEmployees(await listEmployees(showArchived));
  }

  useEffect(() => {
    // The picker options — filtered server-side to what this user may use.
    listBranches().then(setBranches);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        (e.jobTitle ?? '').toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q) ||
        (e.phone ?? '').includes(q),
    );
  }, [employees, search]);

  async function handleSave(data: EmployeeInput) {
    if (modal?.mode === 'edit') {
      await updateEmployee(modal.employee.id, data);
    } else {
      await createEmployee(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteEmployee(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الموظفون</div>
          <div className="page-sub">سجل الموارد البشرية والرواتب الأساسية</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + موظف جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بأي تفاصيل الموظف..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          عرض المؤرشفة
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الوظيفة</th>
              <th>القسم</th>
              <th>تاريخ التعيين</th>
              <th>الراتب الأساسي</th>
              <th>الجوال</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">لا يوجد موظفون مطابقون</div>
                </td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.fullName}{e.archived && <span className="badge draft" style={{ marginRight: 6 }}>مؤرشف</span>}</td>
                <td>{e.jobTitle || '—'}</td>
                <td>{e.department || '—'}</td>
                <td className="num">{dfmt(e.hireDate)}</td>
                <td className="num">{fmt(e.baseSalary)}</td>
                <td className="num">{e.phone || '—'}</td>
                <td>
                  <span className={`badge ${badgeOf(STATUS_META, e.status).badgeClass}`}>{badgeOf(STATUS_META, e.status).label}</span>
                </td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', employee: e }) },
                      { label: e.archived ? '📂 إلغاء الأرشفة' : '🗄 أرشفة', onClick: () => setEmployeeArchived(e.id, !e.archived).then(reload) },
                      '-',
                      { label: '🗑 حذف', onClick: () => setPendingDelete(e), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <EmployeeModal branches={branches} editing={modal.mode === 'edit' ? modal.employee : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title="حذف الموظف"
          body={`حذف "${pendingDelete.fullName}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
