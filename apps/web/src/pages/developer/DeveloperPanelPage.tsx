import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeletionRequestsSection } from './DeletionRequestsSection';
import { PublicFormTemplatesSection } from './PublicFormTemplatesSection';
import { SubProcessorsSection } from './SubProcessorsSection';
import { SupportAccessSection } from './SupportAccessSection';
import { createCompany, listCompanies, updateCompany, updateCompanySubscription, type Company, type CompanyInput } from '../../api/companies';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate, type PermissionTemplate, type TemplateInput } from '../../api/templates';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt } from '../../lib/format';
import { CompanyModal } from './CompanyModal';
import { TemplateModal } from './TemplateModal';
import { PlatformRoleGate } from './PlatformRoleGate';
import { DecisionsPanel } from './DecisionsPanel';
import i18n from '../../i18n';

const statusMeta = (): Record<Company['status'], { label: string; badgeClass: string }> => ({
  ACTIVE: { label: i18n.t('developer.panel.status.active'), badgeClass: 'paid' },
  FROZEN: { label: i18n.t('developer.panel.status.frozen'), badgeClass: 'due' },
  STOPPED: { label: i18n.t('developer.panel.status.stopped'), badgeClass: 'overdue' },
  CLOSED: { label: i18n.t('developer.panel.status.closed'), badgeClass: 'overdue' },
});

export function DeveloperPanelPage() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyModal, setCompanyModal] = useState<{ mode: 'create' } | { mode: 'edit'; company: Company } | null>(null);
  const [templateModal, setTemplateModal] = useState<{ mode: 'create' } | { mode: 'edit'; template: PermissionTemplate } | null>(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<PermissionTemplate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [c, t] = await Promise.all([listCompanies(), listTemplates()]);
    setCompanies(c);
    setTemplates(t);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const usageByTemplate = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of companies) m.set(c.permissionTemplateId, (m.get(c.permissionTemplateId) ?? 0) + 1);
    return m;
  }, [companies]);

  const summary = useMemo(
    () => ({
      total: companies.length,
      active: companies.filter((c) => c.status === 'ACTIVE').length,
      frozen: companies.filter((c) => c.status === 'FROZEN').length,
      stopped: companies.filter((c) => c.status === 'STOPPED').length,
    }),
    [companies],
  );

  async function handleSaveCompany(data: Partial<CompanyInput>) {
    if (companyModal?.mode === 'edit') {
      // The subscription has its own route and role, so money is never sent with the name. The owner's
      // sign-in details are never sent: the edit form has none.
      const { subStart, subEnd, orgName, permissionTemplateId } = data;
      await updateCompany(companyModal.company.id, { orgName, permissionTemplateId });
      // Call the billing route only when the date actually changed, so someone who edits the
      // name alone under an operations role is not refused on a subscription they did not touch.
      const current = companyModal.company.subEnd?.slice(0, 10) ?? '';
      if ((subEnd ?? '') !== current) await updateCompanySubscription(companyModal.company.id, { subStart, subEnd });
    } else {
      await createCompany(data as CompanyInput);
    }
    setCompanyModal(null);
    await reload();
  }

  async function handleSaveTemplate(data: TemplateInput) {
    if (templateModal?.mode === 'edit') {
      await updateTemplate(templateModal.template.id, data);
    } else {
      await createTemplate(data);
    }
    setTemplateModal(null);
    await reload();
  }

  // No direct account delete here: the only path is the merchant's request and its approval below.

  async function confirmDeleteTemplate() {
    if (!pendingDeleteTemplate) return;
    setDeleteError(null);
    try {
      await deleteTemplate(pendingDeleteTemplate.id);
      setPendingDeleteTemplate(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_template_delete'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('developer.panel.title')}</div>
          <div className="page-sub">{t('developer.panel.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setCompanyModal({ mode: 'create' })}>
            {t('developer.panel.new_account')}
          </button>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi-card pos">
          <div className="kpi-label">{t('developer.panel.kpi_total')}</div>
          <div className="kpi-value num">{summary.total}</div>
        </div>
        <div className="kpi-card pos">
          <div className="kpi-label">{t('developer.panel.kpi_active')}</div>
          <div className="kpi-value num">{summary.active}</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">{t('developer.panel.kpi_frozen')}</div>
          <div className="kpi-value num">{summary.frozen}</div>
        </div>
        <div className="kpi-card neg">
          <div className="kpi-label">{t('developer.panel.kpi_stopped')}</div>
          <div className="kpi-value num">{summary.stopped}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">{t('developer.panel.templates_title')}</div>
          <button className="btn btn-sm btn-primary" onClick={() => setTemplateModal({ mode: 'create' })}>
            {t('developer.panel.new_template')}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('developer.panel.col_template_name')}</th>
              <th>{t('developer.panel.col_screens')}</th>
              <th>{t('developer.panel.col_usage')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.id}>
                <td>
                  {tpl.name}
                  {tpl.isSystem && <span className="badge draft"> {t('developer.panel.system_badge')}</span>}
                </td>
                <td className="num">{tpl.isAllScreens ? t('developer.panel.all') : tpl.allowedScreens.length}</td>
                <td className="num">{usageByTemplate.get(tpl.id) ?? 0}</td>
                <td>
                  {!tpl.isSystem && (
                    <RowMenu
                      actions={[
                        { label: t('developer.panel.edit'), onClick: () => setTemplateModal({ mode: 'edit', template: tpl }) },
                        { label: t('developer.panel.delete'), onClick: () => setPendingDeleteTemplate(tpl), danger: true },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('developer.panel.col_company')}</th>
              <th>{t('developer.panel.col_template')}</th>
              <th>{t('developer.panel.col_sub_end')}</th>
              <th>{t('developer.common.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">{t('developer.panel.empty')}</div>
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.orgName}</td>
                <td>{c.permissionTemplate.name}</td>
                <td className="num">{c.subEnd ? dfmt(c.subEnd) : '—'}</td>
                <td>
                  <span className={`badge ${badgeOf(statusMeta(), c.status).badgeClass}`}>{badgeOf(statusMeta(), c.status).label}</span>
                </td>
                <td>
                  <RowMenu
                    actions={[
                      { label: t('developer.panel.edit'), onClick: () => setCompanyModal({ mode: 'edit', company: c }) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Each section shows only for its platform role, so nobody is led to a door that refuses them;
          the server decides. The gate is a separate component because this panel never reads the
          current actor: it edits templates, and mixing that with the user's own authority is what the
          UI guard forbids. Critical decisions are open to every platform role: the split is between
          two people, not two roles. */}
      <DecisionsPanel />

      <PlatformRoleGate allow="SUPPORT">
        <SupportAccessSection />
      </PlatformRoleGate>
      <PlatformRoleGate allow="COMPLIANCE">
        <DeletionRequestsSection onExecuted={reload} />
      </PlatformRoleGate>
      <PlatformRoleGate allow="COMPLIANCE">
        <SubProcessorsSection />
      </PlatformRoleGate>
      {/* Public form templates: the platform owner and the compliance role, matching the server. */}
      <PlatformRoleGate allow="COMPLIANCE">
        <PublicFormTemplatesSection />
      </PlatformRoleGate>

      {companyModal && (
        <CompanyModal
          // A company uses a public, non-system template, and the server refuses any other. Listing only
          // those keeps the modal from preselecting one the server would reject.
          templates={templates.filter((tpl) => tpl.companyId === null && !tpl.isSystem)}
          editing={companyModal.mode === 'edit' ? companyModal.company : null}
          onCancel={() => setCompanyModal(null)}
          onSave={handleSaveCompany}
        />
      )}

      {templateModal && (
        <TemplateModal editing={templateModal.mode === 'edit' ? templateModal.template : null} onCancel={() => setTemplateModal(null)} onSave={handleSaveTemplate} />
      )}

      {pendingDeleteTemplate && (
        <ConfirmModal
          title={t('developer.panel.delete_template_title')}
          body={deleteError ?? t('developer.panel.delete_template_body', { name: pendingDeleteTemplate.name })}
          confirmLabel={t('developer.common.delete')}
          onCancel={() => {
            setPendingDeleteTemplate(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDeleteTemplate}
        />
      )}
    </div>
  );
}
