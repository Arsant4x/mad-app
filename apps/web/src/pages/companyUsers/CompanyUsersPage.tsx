import { useEffect, useState } from 'react';
import { createCompanyUser, deleteCompanyUser, listCompanyUsers, updateCompanyUser, type CompanyUser, type CompanyUserInput } from '../../api/companyUsers';
import { listTemplates, type PermissionTemplate } from '../../api/templates';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { CompanyUserModal } from './CompanyUserModal';

const STATUS_META: Record<CompanyUser['status'], { label: string; badgeClass: string }> = {
  ACTIVE: { label: 'نشط', badgeClass: 'paid' },
  FROZEN: { label: 'مجمّد', badgeClass: 'due' },
  STOPPED: { label: 'متوقف', badgeClass: 'overdue' },
};

export function CompanyUsersPage() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; user: CompanyUser } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CompanyUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [u, t] = await Promise.all([listCompanyUsers(), listTemplates()]);
    setUsers(u);
    setTemplates(t.filter((tpl) => !tpl.isSystem));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleSave(data: Partial<CompanyUserInput>) {
    if (modal?.mode === 'edit') {
      await updateCompanyUser(modal.user.id, data);
    } else {
      await createCompanyUser(data as CompanyUserInput);
    }
    setModal(null);
    await reload();
  }

  async function toggleStatus(user: CompanyUser) {
    await updateCompanyUser(user.id, { status: user.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE' });
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteCompanyUser(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? 'تعذّر حذف الحساب');
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">حسابات الموظفين</div>
          <div className="page-sub">حسابات دخول فرعية لموظفي المنشأة، بصلاحيات محدَّدة عبر نموذج</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })} disabled={templates.length === 0}>
            + حساب موظف جديد
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state">لا توجد نماذج صلاحيات متاحة — تواصل مع المطوّر لإنشاء نموذج</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>اسم الموظف</th>
                <th>النموذج</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">لا يوجد موظفون بحسابات دخول بعد</div>
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.permissionTemplate.name}</td>
                  <td>
                    <span className={`badge ${STATUS_META[u.status].badgeClass}`}>{STATUS_META[u.status].label}</span>
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', user: u }) },
                        { label: u.status === 'ACTIVE' ? '⏸ تجميد الحساب' : '✓ إعادة التفعيل', onClick: () => toggleStatus(u) },
                        '-',
                        { label: '🗑 حذف', onClick: () => setPendingDelete(u), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <CompanyUserModal templates={templates} editing={modal.mode === 'edit' ? modal.user : null} onCancel={() => setModal(null)} onSave={handleSave} />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="حذف حساب الموظف"
          body={deleteError ?? `حذف حساب "${pendingDelete.name}"؟ لن يستطيع تسجيل الدخول بعدها.`}
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
