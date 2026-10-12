import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SECTOR_LABELS, SECTORS, type Sector } from '../../api/activities';
import {
  createFormType,
  createPublicFormTemplate,
  deletePublicFormTemplate,
  getPublicFormTemplate,
  listFormTypes,
  listPublicFormTemplates,
  newPublicFormTemplateVersion,
  publishPublicFormTemplate,
  updatePublicFormTemplate,
  type FormTemplate,
  type FormTemplateRow,
  type FormType,
} from '../../api/forms';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { apiErrorMessage } from '../../lib/apiError';
import { badgeOf } from '../../lib/statusBadge';
import { itemDraftOf } from '../forms/formItems';
import { TemplateEditorModal } from '../forms/TemplateEditorModal';
import { sortTemplateRows, TEMPLATE_STATUS_META } from '../forms/templateStatus';

type Editing = { mode: 'create' } | { mode: 'edit'; template: FormTemplate; readOnly: boolean };
type Pending = { kind: 'publish' | 'delete'; row: FormTemplateRow };

/**
 * Ready-made public templates: the platform owns the templates and a merchant edits their own copy.
 * The actor is the platform admin in the developer panel. The server enforces the role and
 * PlatformRoleGate only hides the section. This section does not read the current actor: the editor
 * edits content, and the gate sits around it.
 */
export function PublicFormTemplatesSection() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<FormType[]>([]);
  const [rows, setRows] = useState<FormTemplateRow[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState<{ code: string; name: string; sector: Sector | '' }>({ code: '', name: '', sector: '' });

  async function reload() {
    const [ft, r] = await Promise.all([listFormTypes(), listPublicFormTemplates()]);
    setTypes(ft);
    setRows(sortTemplateRows(r));
  }

  useEffect(() => {
    reload().catch((e) => setError(apiErrorMessage(e, t('developer.public_forms.err_load'))));
  }, []);

  async function addType() {
    setError(null);
    try {
      await createFormType({ code: newType.code.trim(), name: newType.name.trim(), sector: newType.sector || undefined });
      setNewType({ code: '', name: '', sector: '' });
      await reload();
    } catch (e) {
      setError(apiErrorMessage(e, t('developer.public_forms.err_add_type')));
    }
  }

  async function open(row: FormTemplateRow, readOnly: boolean) {
    setError(null);
    try {
      setEditing({ mode: 'edit', template: await getPublicFormTemplate(row.id), readOnly });
    } catch (e) {
      setError(apiErrorMessage(e, t('developer.public_forms.err_open')));
    }
  }

  async function newVersion(row: FormTemplateRow) {
    setError(null);
    try {
      const draft = await newPublicFormTemplateVersion(row.id);
      await reload();
      setEditing({ mode: 'edit', template: draft, readOnly: false });
    } catch (e) {
      setError(apiErrorMessage(e, t('developer.public_forms.err_new_version')));
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setError(null);
    try {
      if (pending.kind === 'publish') await publishPublicFormTemplate(pending.row.id);
      else await deletePublicFormTemplate(pending.row.id);
      setPending(null);
      await reload();
    } catch (e) {
      setPending(null);
      setError(apiErrorMessage(e, pending.kind === 'publish' ? t('developer.public_forms.err_publish') : t('developer.public_forms.err_delete')));
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-title">{t('developer.public_forms.title')}</div>
      <p className="hint">{t('developer.public_forms.hint')}</p>
      {error && <p className="error-text">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>{t('developer.public_forms.col_code')}</th>
            <th>{t('developer.public_forms.col_form_type')}</th>
            <th>{t('developer.public_forms.col_sector')}</th>
          </tr>
        </thead>
        <tbody>
          {types.map((ft) => (
            <tr key={ft.id} data-testid="form-type-row">
              <td className="num">{ft.code}</td>
              <td>{ft.name}</td>
              <td>{ft.sector ? SECTOR_LABELS[ft.sector as Sector] ?? ft.sector : t('developer.public_forms.all_sectors')}</td>
            </tr>
          ))}
          <tr>
            <td>
              <input aria-label={t('developer.public_forms.type_code_label')} placeholder={t('developer.public_forms.type_code_placeholder')} value={newType.code} onChange={(e) => setNewType((n) => ({ ...n, code: e.target.value }))} />
            </td>
            <td>
              <input aria-label={t('developer.public_forms.type_name_label')} placeholder={t('developer.public_forms.type_name_placeholder')} value={newType.name} onChange={(e) => setNewType((n) => ({ ...n, name: e.target.value }))} />
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <select aria-label={t('developer.public_forms.type_sector_label')} value={newType.sector} onChange={(e) => setNewType((n) => ({ ...n, sector: e.target.value as Sector | '' }))}>
                <option value="">{t('developer.public_forms.all_sectors')}</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {SECTOR_LABELS[s]}
                  </option>
                ))}
              </select>{' '}
              <button className="btn btn-ghost btn-sm" onClick={addType} disabled={!newType.code.trim() || !newType.name.trim()}>
                {t('developer.public_forms.add_type')}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0 6px' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ mode: 'create' })} disabled={types.length === 0}>
          {t('developer.public_forms.new_template')}
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t('developer.public_forms.col_template')}</th>
            <th>{t('developer.public_forms.col_type')}</th>
            <th>{t('developer.public_forms.col_sector')}</th>
            <th>{t('developer.public_forms.col_version')}</th>
            <th>{t('developer.common.status')}</th>
            <th>{t('developer.public_forms.col_items')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7}>
                <div className="empty-state">{t('developer.public_forms.empty')}</div>
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const meta = badgeOf(TEMPLATE_STATUS_META, r.status);
            const actions =
              r.status === 'DRAFT'
                ? [
                    { label: t('developer.public_forms.edit'), onClick: () => open(r, false) },
                    { label: t('developer.public_forms.publish'), onClick: () => setPending({ kind: 'publish', row: r }) },
                    { label: t('developer.public_forms.delete_draft'), onClick: () => setPending({ kind: 'delete', row: r }), danger: true },
                  ]
                : r.status === 'PUBLISHED'
                  ? [
                      { label: t('developer.public_forms.view'), onClick: () => open(r, true) },
                      { label: t('developer.public_forms.new_version'), onClick: () => newVersion(r) },
                    ]
                  : [{ label: t('developer.public_forms.view'), onClick: () => open(r, true) }];
            return (
              <tr key={r.id} data-testid="public-template-row">
                <td>{r.name}</td>
                <td>{r.formType.name}</td>
                <td>{r.formType.sector ? SECTOR_LABELS[r.formType.sector as Sector] ?? r.formType.sector : t('developer.public_forms.all_sectors')}</td>
                <td className="num">{r.version}</td>
                <td>
                  <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                </td>
                <td className="num">{r.itemCount}</td>
                <td>
                  <RowMenu actions={actions} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing?.mode === 'create' && (
        <TemplateEditorModal
          title={t('developer.public_forms.create_title')}
          initial={{ name: '', description: '', items: [] }}
          formTypes={types}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            await createPublicFormTemplate({ formTypeId: v.formTypeId ?? '', name: v.name, description: v.description || undefined, items: v.items });
            setEditing(null);
            await reload();
          }}
        />
      )}
      {editing?.mode === 'edit' && (
        <TemplateEditorModal
          title={
            editing.readOnly
              ? t('developer.public_forms.view_title', { name: editing.template.name, version: editing.template.version })
              : t('developer.public_forms.edit_title', { name: editing.template.name, version: editing.template.version })
          }
          initial={{ name: editing.template.name, description: editing.template.description ?? '', items: editing.template.items.map(itemDraftOf) }}
          readOnly={editing.readOnly}
          onCancel={() => setEditing(null)}
          onSave={
            editing.readOnly
              ? undefined
              : async (v) => {
                  await updatePublicFormTemplate(editing.template.id, { name: v.name, description: v.description || undefined, items: v.items });
                  setEditing(null);
                  await reload();
                }
          }
        />
      )}
      {pending && (
        <ConfirmModal
          title={pending.kind === 'publish' ? t('developer.public_forms.publish_title') : t('developer.public_forms.delete_draft')}
          body={
            pending.kind === 'publish'
              ? t('developer.public_forms.publish_body', { name: pending.row.name, version: pending.row.version })
              : t('developer.public_forms.delete_body', { name: pending.row.name, version: pending.row.version })
          }
          confirmLabel={pending.kind === 'publish' ? t('developer.public_forms.publish') : t('developer.common.delete')}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}
