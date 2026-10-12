import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SECTOR_LABELS } from '../../api/activities';
import {
  copyFormTemplate,
  deleteCompanyFormTemplate,
  formTemplateCatalog,
  getCompanyFormTemplate,
  listCompanyFormTemplates,
  newCompanyFormTemplateVersion,
  publishCompanyFormTemplate,
  updateCompanyFormTemplate,
  type FormTemplate,
  type FormTemplateRow,
} from '../../api/forms';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { apiErrorMessage } from '../../lib/apiError';
import { badgeOf } from '../../lib/statusBadge';
import { itemDraftOf } from './formItems';
import { TemplateEditorModal } from './TemplateEditorModal';
import { sortTemplateRows, TEMPLATE_STATUS_META } from './templateStatus';

type Pending = { kind: 'publish' | 'delete'; row: FormTemplateRow };

/**
 * Company templates. The actor is the company owner in the company screens: they
 * copy from the public templates, edit their copy's draft and publish it; a
 * published version is never edited, a new version is built after it. The owner
 * and anyone granted the Forms screen edit them, each button by its action as the
 * server rules: copy and new version are "add", editing is "edit", publishing is
 * "review" and deleting a draft is "delete"; others see without editing. "Newer
 * than your copy's source" marks a platform version newer than the one copied.
 */
export function CompanyTemplatesTab() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canAdd = can('forms', 'add');
  const canEdit = can('forms', 'edit');
  const canPublish = can('forms', 'review');
  const canDelete = can('forms', 'delete');
  const [rows, setRows] = useState<FormTemplateRow[]>([]);
  const [catalog, setCatalog] = useState<FormTemplateRow[]>([]);
  const [sources, setSources] = useState<Map<string, { name: string; version: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ template: FormTemplate; readOnly: boolean } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [mine, pub] = await Promise.all([listCompanyFormTemplates(), formTemplateCatalog()]);
    setRows(sortTemplateRows(mine));
    setCatalog(pub);
    // Each copy's source name and version, to compare with the platform's latest version.
    const ids = [...new Set(mine.map((r) => r.sourceTemplateId).filter((x): x is string => !!x))];
    const found = await Promise.all(ids.map((id) => getCompanyFormTemplate(id).then((tpl) => [id, { name: tpl.name, version: tpl.version }] as const).catch(() => null)));
    setSources(new Map(found.filter((x): x is readonly [string, { name: string; version: number }] => x !== null)));
  }

  useEffect(() => {
    reload()
      .catch((e) => setError(apiErrorMessage(e, t('forms.templates.load_failed'))))
      .finally(() => setLoading(false));
  }, []);

  const copiedFrom = useMemo(() => new Set(rows.map((r) => r.sourceTemplateId).filter(Boolean)), [rows]);

  async function open(row: FormTemplateRow, readOnly: boolean) {
    setError(null);
    try {
      setEditing({ template: await getCompanyFormTemplate(row.id), readOnly });
    } catch (e) {
      setError(apiErrorMessage(e, t('forms.templates.open_failed')));
    }
  }

  async function copy(source: FormTemplateRow) {
    setError(null);
    try {
      const created = await copyFormTemplate({ sourceTemplateId: source.id });
      await reload();
      setEditing({ template: created, readOnly: false });
    } catch (e) {
      setError(apiErrorMessage(e, t('forms.templates.copy_failed')));
    }
  }

  async function newVersion(row: FormTemplateRow) {
    setError(null);
    try {
      const draft = await newCompanyFormTemplateVersion(row.id);
      await reload();
      setEditing({ template: draft, readOnly: false });
    } catch (e) {
      setError(apiErrorMessage(e, t('forms.templates.new_version_failed')));
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setError(null);
    try {
      if (pending.kind === 'publish') await publishCompanyFormTemplate(pending.row.id);
      else await deleteCompanyFormTemplate(pending.row.id);
      setPending(null);
      await reload();
    } catch (e) {
      setPending(null);
      setError(apiErrorMessage(e, pending.kind === 'publish' ? t('forms.templates.publish_failed') : t('forms.templates.delete_failed')));
    }
  }

  if (loading) return null;

  return (
    <div>
      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        <div className="card-title" style={{ padding: '10px 12px' }}>
          {t('forms.templates.company_title')}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('forms.templates.col_template')}</th>
              <th>{t('forms.templates.col_type')}</th>
              <th>{t('forms.templates.col_version')}</th>
              <th>{t('forms.templates.col_status')}</th>
              <th>{t('forms.templates.col_items')}</th>
              <th>{t('forms.templates.col_copied_from')}</th>
              <th>{t('forms.templates.col_platform_latest')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{canAdd ? t('forms.templates.empty_can_add') : t('forms.templates.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const meta = badgeOf(TEMPLATE_STATUS_META, r.status);
              const source = r.sourceTemplateId ? sources.get(r.sourceTemplateId) : undefined;
              const newer = source && r.sourceLatestVersion !== null && r.sourceLatestVersion > source.version;
              const actions =
                r.status === 'DRAFT'
                  ? [
                      canEdit ? { label: t('forms.templates.action_edit'), onClick: () => open(r, false) } : { label: t('forms.templates.action_view'), onClick: () => open(r, true) },
                      ...(canPublish ? [{ label: t('forms.templates.action_publish'), onClick: () => setPending({ kind: 'publish', row: r }) }] : []),
                      ...(canDelete ? [{ label: t('forms.templates.action_delete_draft'), onClick: () => setPending({ kind: 'delete', row: r }), danger: true }] : []),
                    ]
                  : [
                      { label: t('forms.templates.action_view'), onClick: () => open(r, true) },
                      ...(canAdd && r.status === 'PUBLISHED' ? [{ label: t('forms.templates.action_new_version'), onClick: () => newVersion(r) }] : []),
                    ];
              return (
                <tr key={r.id} data-testid="company-template-row">
                  <td>{r.name}</td>
                  <td>{r.formType.name}</td>
                  <td className="num">{r.version}</td>
                  <td>
                    <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                  </td>
                  <td className="num">{r.itemCount}</td>
                  <td>{source ? t('forms.templates.source', { name: source.name, version: source.version }) : ''}</td>
                  <td>
                    {r.sourceLatestVersion !== null && <span className="num">{r.sourceLatestVersion}</span>}
                    {newer && <div className="hint">{t('forms.templates.newer_than_source')}</div>}
                  </td>
                  <td>
                    <RowMenu actions={actions} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canAdd && (
        <div className="card" style={{ padding: 0, marginTop: 14 }}>
          <div className="card-title" style={{ padding: '10px 12px' }}>
            {t('forms.templates.public_title')}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t('forms.templates.col_template')}</th>
                <th>{t('forms.templates.col_type')}</th>
                <th>{t('forms.templates.col_sector')}</th>
                <th>{t('forms.templates.col_version')}</th>
                <th>{t('forms.templates.col_items')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {catalog.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">{t('forms.templates.public_empty')}</div>
                  </td>
                </tr>
              )}
              {catalog.map((c) => (
                <tr key={c.id} data-testid="catalog-row">
                  <td>{c.name}</td>
                  <td>{c.formType.name}</td>
                  <td>{c.formType.sector ? SECTOR_LABELS[c.formType.sector as keyof typeof SECTOR_LABELS] ?? c.formType.sector : t('forms.templates.all_sectors')}</td>
                  <td className="num">{c.version}</td>
                  <td className="num">{c.itemCount}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => copy(c)}>
                      {copiedFrom.has(c.id) ? t('forms.templates.copy_again') : t('forms.templates.copy')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TemplateEditorModal
          title={
            editing.readOnly
              ? t('forms.templates.editor_title_view', { name: editing.template.name, version: editing.template.version })
              : t('forms.templates.editor_title_edit', { name: editing.template.name, version: editing.template.version })
          }
          initial={{ name: editing.template.name, description: editing.template.description ?? '', items: editing.template.items.map(itemDraftOf) }}
          readOnly={editing.readOnly}
          onCancel={() => setEditing(null)}
          onSave={
            editing.readOnly
              ? undefined
              : async (v) => {
                  await updateCompanyFormTemplate(editing.template.id, { name: v.name, description: v.description || undefined, items: v.items });
                  setEditing(null);
                  await reload();
                }
          }
        />
      )}

      {pending && (
        <ConfirmModal
          title={pending.kind === 'publish' ? t('forms.templates.confirm_publish_title') : t('forms.templates.confirm_delete_title')}
          body={
            pending.kind === 'publish'
              ? t('forms.templates.confirm_publish_body', { name: pending.row.name, version: pending.row.version })
              : t('forms.templates.confirm_delete_body', { name: pending.row.name, version: pending.row.version })
          }
          confirmLabel={pending.kind === 'publish' ? t('forms.templates.action_publish') : t('forms.common.delete')}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}
