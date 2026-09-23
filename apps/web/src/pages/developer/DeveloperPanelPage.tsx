import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { DeletionRequestsSection } from './DeletionRequestsSection';
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
import i18n from '../../i18n';

const STATUS_META: Record<Company['status'], { label: string; badgeClass: string }> = {
  ACTIVE: { label: 'نشط', badgeClass: 'paid' },
  FROZEN: { label: 'مجمّد', badgeClass: 'due' },
  STOPPED: { label: 'متوقف', badgeClass: 'overdue' },
  CLOSED: { label: 'مغلق', badgeClass: 'overdue' },
};

export function DeveloperPanelPage() {
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
      // ⑪A2 (`ق-١٣١٧`): الاشتراكُ مسارٌ بدوره — **والمالُ لا يُرسل مع الاسم**.
      const { subStart, subEnd, ...profile } = data;
      await updateCompany(companyModal.company.id, profile);
      // **ولا يُنادى مسارُ المالية إلا إن تغيّر التاريخُ فعلاً**: من يعدّل الاسمَ وحدَه
      // بدور التشغيل لا يُردّ `403` على اشتراكٍ لم يمسّه.
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

  // ⛔ لا حذفَ مباشراً للحساب من هنا (ق-٥٤٨): المسارُ الوحيد طلبُ التاجر وموافقتُه في قسم الطلبات أدناه.

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
          <div className="page-title">لوحة المطوّر</div>
          <div className="page-sub">إدارة النماذج والحسابات والاشتراكات</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setCompanyModal({ mode: 'create' })}>
            + حساب جديد
          </button>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi-card pos">
          <div className="kpi-label">إجمالي الحسابات</div>
          <div className="kpi-value num">{summary.total}</div>
        </div>
        <div className="kpi-card pos">
          <div className="kpi-label">نشطة</div>
          <div className="kpi-value num">{summary.active}</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">مجمَّدة</div>
          <div className="kpi-value num">{summary.frozen}</div>
        </div>
        <div className="kpi-card neg">
          <div className="kpi-label">متوقفة</div>
          <div className="kpi-value num">{summary.stopped}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">النماذج</div>
          <button className="btn btn-sm btn-primary" onClick={() => setTemplateModal({ mode: 'create' })}>
            + إنشاء نموذج جديد
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>اسم النموذج</th>
              <th>عدد الأقسام المتاحة</th>
              <th>عدد الحسابات المستخدِمة له</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name}
                  {t.isSystem && <span className="badge draft"> ثابت — غير قابل للتعديل</span>}
                </td>
                <td className="num">{t.isAllScreens ? 'الكل' : t.allowedScreens.length}</td>
                <td className="num">{usageByTemplate.get(t.id) ?? 0}</td>
                <td>
                  {!t.isSystem && (
                    <RowMenu
                      actions={[
                        { label: '✎ تعديل', onClick: () => setTemplateModal({ mode: 'edit', template: t }) },
                        { label: '🗑 حذف', onClick: () => setPendingDeleteTemplate(t), danger: true },
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
              <th>المنشأة/المستخدم</th>
              <th>النموذج</th>
              <th>نهاية الاشتراك</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">لا توجد حسابات بعد</div>
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.orgName}</td>
                <td>{c.permissionTemplate.name}</td>
                <td className="num">{c.subEnd ? dfmt(c.subEnd) : '—'}</td>
                <td>
                  <span className={`badge ${badgeOf(STATUS_META, c.status).badgeClass}`}>{badgeOf(STATUS_META, c.status).label}</span>
                </td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setCompanyModal({ mode: 'edit', company: c }) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ⑪A2 (`ق-١٣١٢`): كلُّ قسمٍ لدوره — **والإخفاءُ كي لا يُقاد أحدٌ إلى بابٍ يُردّ منه**،
          والحكمُ في الخادم لا هنا. والبوّابةُ مكوِّنٌ مستقلّ **لأن هذه اللوحةَ لا تقرأ الفاعل
          إطلاقاً**: هي محرِّرُ نماذجَ، وخلطُ ذلك بسلطة المستخدم هو ما يمنعه حارسُ الواجهة. */}
      <PlatformRoleGate allow="SUPPORT">
        <SupportAccessSection />
      </PlatformRoleGate>
      <PlatformRoleGate allow="COMPLIANCE">
        <DeletionRequestsSection onExecuted={reload} />
      </PlatformRoleGate>
      <PlatformRoleGate allow="COMPLIANCE">
        <SubProcessorsSection />
      </PlatformRoleGate>

      {companyModal && (
        <CompanyModal
          templates={templates}
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
          title="حذف النموذج"
          body={deleteError ?? `حذف نموذج "${pendingDeleteTemplate.name}"؟`}
          confirmLabel="حذف"
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
