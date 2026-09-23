import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { createCompanyUser, deleteCompanyUser, listCompanyUsers, updateCompanyUser, type CompanyUser, type CompanyUserInput } from '../../api/companyUsers';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate, ACTION_LABELS, SCREEN_LABELS, type PermissionTemplate, type TemplateInput } from '../../api/templates';
import { OwnerTemplateModal } from './OwnerTemplateModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { CompanyUserModal } from './CompanyUserModal';
import { DelegationModal } from './DelegationModal';
import i18n from '../../i18n';

// بكلِّ قيم عمود الحالة (`AccountStatus`) — `CLOSED` كان غائباً فيُعرض مفتاحُه (`ق-١٣٦٧`).
const STATUS_META: Record<CompanyUser['status'], { label: string; badgeClass: string }> = {
  ACTIVE: { label: 'نشط', badgeClass: 'paid' },
  FROZEN: { label: 'مجمّد', badgeClass: 'due' },
  STOPPED: { label: 'متوقف', badgeClass: 'overdue' },
  CLOSED: { label: 'مغلق', badgeClass: 'overdue' },
};

export function CompanyUsersPage() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tplModal, setTplModal] = useState<{ mode: 'create' } | { mode: 'edit'; template: PermissionTemplate } | null>(null);
  const [pendingDeleteTpl, setPendingDeleteTpl] = useState<PermissionTemplate | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; user: CompanyUser } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CompanyUser | null>(null);
  const [delegating, setDelegating] = useState<CompanyUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [u, t, b] = await Promise.all([listCompanyUsers(), listTemplates(), listBranches()]);
    setUsers(u);
    setTemplates(t.filter((tpl) => !tpl.isSystem));
    setBranches(b);
  }

  /** «كل الفروع» لغير المقيَّد — الأسماء تُحلّ من قائمة الفروع لأن الخادم
   * يعيد صفوف الإسناد كمعرّفات فقط (جدول الفروع محمي بـRLS هناك). */
  function describeBranches(u: CompanyUser): string {
    if (!u.branches?.length) return 'كل الفروع';
    const nameById = new Map(branches.map((b) => [b.id, b.name]));
    return u.branches.map((r) => nameById.get(r.branchId) ?? '—').join('، ');
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleSave(data: Partial<CompanyUserInput> & { canEditMasterData?: boolean }) {
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
      setDeleteError(message ?? i18n.t('err_account_delete'));
    }
  }

  if (loading) return null;

  async function handleSaveTemplate(data: TemplateInput) {
    if (tplModal?.mode === 'edit') await updateTemplate(tplModal.template.id, data);
    else await createTemplate(data);
    setTplModal(null);
    await reload();
  }

  async function confirmDeleteTemplate() {
    if (!pendingDeleteTpl) return;
    setTplError(null);
    try {
      await deleteTemplate(pendingDeleteTpl.id);
      setPendingDeleteTpl(null);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setTplError(d?.message ?? 'تعذّر حذف النموذج');
    }
  }

  /** وصف مقروء لما يمنحه النموذج — «العقود: اطلاع، إضافة» لا JSON. */
  function describeTemplate(t: PermissionTemplate): string {
    if (t.isAllScreens) return 'كل الشاشات، كل الصلاحيات';
    return t.allowedScreens
      .map((sc) => {
        const label = SCREEN_LABELS[sc as keyof typeof SCREEN_LABELS] ?? sc;
        const acts = t.screenActions?.[sc];
        if (!acts) return label;
        return label + ': ' + acts.map((a) => ACTION_LABELS[a as keyof typeof ACTION_LABELS] ?? a).join('، ');
      })
      .join(' · ');
  }

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
                {/* عمود الفروع يظهر فقط لمنشأة لديها فروع — لمنشأة الموقع
                    الواحد سيكون «كل الفروع» في كل صف: ضجيج بلا معلومة. */}
                {branches.length > 0 && <th>الفروع</th>}
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={branches.length > 0 ? 5 : 4}>
                    <div className="empty-state">لا يوجد موظفون بحسابات دخول بعد</div>
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.permissionTemplate.name}</td>
                  {branches.length > 0 && <td style={{ fontSize: 12, color: 'var(--muted)' }}>{describeBranches(u)}</td>}
                  <td>
                    <span className={`badge ${badgeOf(STATUS_META, u.status).badgeClass}`}>{badgeOf(STATUS_META, u.status).label}</span>
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', user: u }) },
                        // التفويض **من الموظف** لا من شاشة مستقلة: هو علاقةٌ
                        // بين شخصين لا إعداد نظام، وشاشةٌ مستقلة تسأل «لمن؟»
                        // أولاً — أي تعيد بناء هذه القائمة بعينها.
                        { label: '⇄ التفويض', onClick: () => setDelegating(u) },
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

      {/* نماذج الصلاحيات — قرار المالك، في واجهة المالك (قاعدة الفاعل §3.5).
          القوالب العامة من المنصة تظهر للقراءة؛ نماذجك أنت من ينشئها ويحرّرها
          بمصفوفة الشاشات × الأفعال. */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div className="card-title">نماذج الصلاحيات</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setTplModal({ mode: 'create' })}>+ نموذج جديد</button>
        </div>
        {tplError && <p className="error-text">{tplError}</p>}
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>ما يمنحه</th>
              <th>المصدر</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{describeTemplate(t)}</td>
                <td>{t.companyId ? <span className="badge paid">نموذجك</span> : <span className="badge draft">قالب عام</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {t.companyId && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setTplModal({ mode: 'edit', template: t })}>تعديل</button>{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => setPendingDeleteTpl(t)}>حذف</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <CompanyUserModal templates={templates} branches={branches} editing={modal.mode === 'edit' ? modal.user : null} onCancel={() => setModal(null)} onSave={handleSave} />
      )}

      {delegating && (
        <DelegationModal granteeId={delegating.id} granteeName={delegating.name} onClose={() => setDelegating(null)} />
      )}

      {tplModal && <OwnerTemplateModal editing={tplModal.mode === 'edit' ? tplModal.template : null} onCancel={() => setTplModal(null)} onSave={handleSaveTemplate} />}

      {pendingDeleteTpl && (
        <ConfirmModal
          title="حذف النموذج"
          body={tplError ?? `حذف نموذج "${pendingDeleteTpl.name}"؟ لا يمكن حذف نموذج مسنَد لموظف.`}
          confirmLabel="حذف"
          onCancel={() => { setPendingDeleteTpl(null); setTplError(null); }}
          onConfirm={confirmDeleteTemplate}
        />
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
