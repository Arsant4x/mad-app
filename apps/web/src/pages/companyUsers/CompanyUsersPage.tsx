import { badgeOf, type BadgeMeta } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBranches, type Branch } from '../../api/branches';
import { createCompanyUser, deleteCompanyUser, listCompanyUsers, updateCompanyUser, type CompanyUser, type CompanyUserInput } from '../../api/companyUsers';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate, ACTION_LABELS, SCREEN_LABELS, type PermissionTemplate, type TemplateInput } from '../../api/templates';
import { OwnerTemplateModal } from './OwnerTemplateModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { CompanyUserModal } from './CompanyUserModal';
import { DelegationModal } from './DelegationModal';
import i18n from '../../i18n';

// Every value of the status column (`AccountStatus`); a missing one would show its raw code.
// `label` holds a translation key; it is turned into text where rendered.
const STATUS_META: Record<CompanyUser['status'], BadgeMeta> = {
  ACTIVE: { label: 'company_users.status.active', badgeClass: 'paid' },
  FROZEN: { label: 'company_users.status.frozen', badgeClass: 'due' },
  STOPPED: { label: 'company_users.status.stopped', badgeClass: 'overdue' },
  CLOSED: { label: 'company_users.status.closed', badgeClass: 'overdue' },
};

export function CompanyUsersPage() {
  const { t } = useTranslation();
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
    const [u, tpls, b] = await Promise.all([listCompanyUsers(), listTemplates(), listBranches()]);
    setUsers(u);
    setTemplates(tpls.filter((tpl) => !tpl.isSystem));
    setBranches(b);
  }

  /** "All branches" follows the explicit flag, not the absence of assignments. Names are resolved from the
   * branch list because the server returns assignment rows as ids only. */
  function describeBranches(u: CompanyUser): string {
    if (u.allBranches) return t('company_users.branches_all');
    if (!u.branches?.length) return t('company_users.branches_none');
    const nameById = new Map(branches.map((b) => [b.id, b.name]));
    return u.branches.map((r) => nameById.get(r.branchId) ?? '—').join(t('company_users.list_sep'));
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
      setTplError(d?.message ?? t('company_users.templates.err_delete'));
    }
  }

  /** A readable summary of what a template grants ("Contracts: view, add"), not JSON. */
  function describeTemplate(tpl: PermissionTemplate): string {
    if (tpl.isAllScreens) return t('company_users.templates.all_screens');
    return tpl.allowedScreens
      .map((sc) => {
        const label = SCREEN_LABELS[sc as keyof typeof SCREEN_LABELS] ?? sc;
        const acts = tpl.screenActions?.[sc];
        if (!acts) return label;
        return label + ': ' + acts.map((a) => ACTION_LABELS[a as keyof typeof ACTION_LABELS] ?? a).join(t('company_users.list_sep'));
      })
      .join(' · ');
  }

  const statusOf = (u: CompanyUser) => badgeOf(STATUS_META, u.status);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('company_users.title')}</div>
          <div className="page-sub">{t('company_users.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })} disabled={templates.length === 0}>
            {t('company_users.new_user')}
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state">{t('company_users.no_templates')}</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>{t('company_users.col_name')}</th>
                <th>{t('company_users.col_template')}</th>
                {/* The branches column shows only for a company with branches; for a single site it would read
                    "all branches" on every row: noise without information. */}
                {branches.length > 0 && <th>{t('company_users.col_branches')}</th>}
                <th>{t('company_users.col_status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={branches.length > 0 ? 5 : 4}>
                    <div className="empty-state">{t('company_users.empty')}</div>
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.permissionTemplate.name}</td>
                  {branches.length > 0 && <td style={{ fontSize: 12, color: 'var(--muted)' }}>{describeBranches(u)}</td>}
                  <td>
                    <span className={`badge ${statusOf(u).badgeClass}`}>{t(statusOf(u).label)}</span>
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        { label: t('company_users.menu.edit'), onClick: () => setModal({ mode: 'edit', user: u }) },
                        // Delegation opens from the employee, not a separate screen: it is a relation between two
                        // people, and a separate screen would first ask "to whom?", rebuilding this very list.
                        { label: t('company_users.menu.delegate'), onClick: () => setDelegating(u) },
                        { label: u.status === 'ACTIVE' ? t('company_users.menu.freeze') : t('company_users.menu.reactivate'), onClick: () => toggleStatus(u) },
                        '-',
                        { label: t('company_users.menu.delete'), onClick: () => setPendingDelete(u), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Permission templates are the owner's decision, in the owner's interface. Public platform templates
          show read only; the owner creates and edits their own with the screens by actions matrix. */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div className="card-title">{t('company_users.templates.title')}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setTplModal({ mode: 'create' })}>{t('company_users.templates.new')}</button>
        </div>
        {tplError && <p className="error-text">{tplError}</p>}
        <table>
          <thead>
            <tr>
              <th>{t('company_users.templates.col_name')}</th>
              <th>{t('company_users.templates.col_grants')}</th>
              <th>{t('company_users.templates.col_source')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.id}>
                <td>{tpl.name}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{describeTemplate(tpl)}</td>
                <td>{tpl.companyId ? <span className="badge paid">{t('company_users.templates.yours')}</span> : <span className="badge draft">{t('company_users.templates.public')}</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {tpl.companyId && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setTplModal({ mode: 'edit', template: tpl })}>{t('company_users.common.edit')}</button>{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => setPendingDeleteTpl(tpl)}>{t('company_users.common.delete')}</button>
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
          title={t('company_users.templates.delete_title')}
          body={tplError ?? t('company_users.templates.delete_body', { name: pendingDeleteTpl.name })}
          confirmLabel={t('company_users.common.delete')}
          onCancel={() => { setPendingDeleteTpl(null); setTplError(null); }}
          onConfirm={confirmDeleteTemplate}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('company_users.delete_title')}
          body={deleteError ?? t('company_users.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('company_users.common.delete')}
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
