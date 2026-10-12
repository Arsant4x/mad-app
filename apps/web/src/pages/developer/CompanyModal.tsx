import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Company, CompanyInput } from '../../api/companies';
import { companyTemplateChoices, type PermissionTemplate } from '../../api/templates';
import { today } from '../../lib/format';
import i18n from '../../i18n';

export function CompanyModal({
  templates,
  editing,
  onCancel,
  onSave,
}: {
  templates: PermissionTemplate[];
  editing: Company | null;
  onCancel: () => void;
  onSave: (data: Partial<CompanyInput>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [orgName, setOrgName] = useState(editing?.orgName ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // A company owner gets a full public template, so the choice is among those only. An existing
  // company on a narrower template still sees it listed, and it is not sent unless it changes.
  const choices = companyTemplateChoices(templates);
  const current = editing ? templates.find((tpl) => tpl.id === editing.permissionTemplateId) : undefined;
  const options = current && !choices.some((tpl) => tpl.id === current.id) ? [current, ...choices] : choices;
  const [permissionTemplateId, setPermissionTemplateId] = useState(editing?.permissionTemplateId ?? choices[0]?.id ?? '');
  const [subStart, setSubStart] = useState(editing?.subStart?.slice(0, 10) ?? today());
  const [subEnd, setSubEnd] = useState(editing?.subEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!orgName.trim() || (!editing && (!username.trim() || !password))) {
      setError(i18n.t('err_company_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        orgName: orgName.trim(),
        ...(username.trim() ? { username: username.trim() } : {}),
        ...(password ? { password } : {}),
        ...(permissionTemplateId !== editing?.permissionTemplateId ? { permissionTemplateId } : {}),
        subStart: subStart || undefined,
        subEnd: subEnd || undefined,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_account_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('developer.company_modal.title_edit') : t('developer.company_modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('developer.company_modal.org_name')}</label>
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={t('developer.company_modal.org_name_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('developer.company_modal.username')}</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={editing ? t('developer.company_modal.username_keep') : t('developer.company_modal.username_placeholder')} />
          </div>
          <div className="field">
            <label>{t('developer.company_modal.password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing ? t('developer.company_modal.password_keep') : t('developer.company_modal.password')} />
          </div>
        </div>
        <div className="field">
          <label>{t('developer.company_modal.template')}</label>
          <select value={permissionTemplateId} onChange={(e) => setPermissionTemplateId(e.target.value)}>
            {options.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('developer.company_modal.sub_start')}</label>
            <input type="date" value={subStart} onChange={(e) => setSubStart(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('developer.company_modal.sub_end')}</label>
            <input type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} />
          </div>
        </div>
        <p className="field hint">{t('developer.company_modal.hint')}</p>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('developer.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {t('developer.company_modal.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
