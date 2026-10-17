import { badgeOf, type BadgeMeta } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBranches, type Branch } from '../../api/branches';
import { createEmployee, deleteEmployee, listEmployees, setEmployeeArchived, setEmployeeSalary, updateEmployee, type Employee, type EmployeeInput, type EmployeeStatus } from '../../api/employees';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt } from '../../lib/format';
import { EmployeeModal, type SalaryChange } from './EmployeeModal';

// `label` holds a translation key; it is turned into text where rendered.
const STATUS_META: Record<EmployeeStatus, BadgeMeta> = {
  ACTIVE: { label: 'employees.status.active', badgeClass: 'paid' },
  SUSPENDED: { label: 'employees.status.suspended', badgeClass: 'due' },
  TERMINATED: { label: 'employees.status.terminated', badgeClass: 'overdue' },
};

export function EmployeesPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canAdd = can('employees', 'add');
  const canEdit = can('employees', 'edit');
  const canDelete = can('employees', 'delete');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default.
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

  async function handleSave(data: EmployeeInput, salary?: SalaryChange) {
    let employeeId: string;
    if (modal?.mode === 'edit') {
      // The branch is never sent on update (the update type forbids it), so it is stripped here.
      const { branchId: _createOnly, ...update } = data;
      await updateEmployee(modal.employee.id, update);
      employeeId = modal.employee.id;
    } else {
      const created = await createEmployee(data);
      employeeId = created.id;
      // From here a retry edits this employee instead of creating a second one.
      setModal({ mode: 'edit', employee: created });
    }
    // The salary has its own path; it is sent only when the field was changed.
    if (salary) await setEmployeeSalary(employeeId, salary.baseSalary);
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
          <div className="page-title">{t('employees.title')}</div>
          <div className="page-sub">{t('employees.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              {t('employees.new')}
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('employees.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          {t('employees.show_archived')}
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('employees.col.name')}</th>
              <th>{t('employees.col.job')}</th>
              <th>{t('employees.col.department')}</th>
              <th>{t('employees.col.hire_date')}</th>
              <th>{t('employees.col.phone')}</th>
              <th>{t('employees.col.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('employees.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.fullName}{e.archived && <span className="badge draft" style={{ marginInlineStart: 6 }}>{t('employees.archived')}</span>}</td>
                <td>{e.jobTitle || '—'}</td>
                <td>{e.department || '—'}</td>
                <td className="num">{dfmt(e.hireDate)}</td>
                <td className="num">{e.phone || '—'}</td>
                <td>
                  <span className={`badge ${badgeOf(STATUS_META, e.status).badgeClass}`}>{t(badgeOf(STATUS_META, e.status).label)}</span>
                </td>
                <td>
                  <RowMenu
                    actions={[
                      canEdit && { label: t('employees.menu.edit'), onClick: () => setModal({ mode: 'edit', employee: e }) },
                      canEdit && { label: e.archived ? t('employees.menu.unarchive') : t('employees.menu.archive'), onClick: () => setEmployeeArchived(e.id, !e.archived).then(reload) },
                      '-',
                      canDelete && { label: t('employees.menu.delete'), onClick: () => setPendingDelete(e), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <EmployeeModal
          branches={branches}
          editing={modal.mode === 'edit' ? modal.employee : null}
          salaryAccess={can('employees', 'salaries')}
          onCancel={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('employees.delete_title')}
          body={t('employees.delete_body', { name: pendingDelete.fullName })}
          confirmLabel={t('employees.common.delete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
