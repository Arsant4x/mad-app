import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendOwnerResetLink, type Company, type CompanyFormValues } from '../../api/companies';
import { companyTemplateChoices, type PermissionTemplate } from '../../api/templates';
import i18n from '../../i18n';

function serverMessage(e: unknown): string | undefined {
  const message = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(' · ') : message;
}

/**
 * The owner's login name and password are the owner's alone, so editing an account shows no field for
 * them. What the platform can do for an owner who cannot sign in is have a reset link mailed to the owner.
 */
function OwnerSignInPanel({ company }: { company: Company }) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setSentTo(null);
    setSending(true);
    try {
      setSentTo((await sendOwnerResetLink(company.id)).sentTo);
    } catch (e) {
      setError(serverMessage(e) ?? i18n.t('developer.company_modal.reset_link_failed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="field">
      <label>{t('developer.company_modal.sign_in_title')}</label>
      <p className="hint">{t('developer.company_modal.sign_in_hint')}</p>
      <p className="hint">{company.email ? t('developer.company_modal.owner_email', { email: company.email }) : t('developer.company_modal.owner_email_none')}</p>
      <button type="button" className="btn btn-sm btn-ghost" onClick={handleSend} disabled={sending || !company.email}>
        {sending ? t('developer.company_modal.sending_reset_link') : t('developer.company_modal.send_reset_link')}
      </button>
      {sentTo && <p className="hint">{t('developer.company_modal.reset_link_sent', { email: sentTo })}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function CompanyModal({
  templates,
  editing,
  onCancel,
  onSave,
}: {
  templates: PermissionTemplate[];
  editing: Company | null;
  onCancel: () => void;
  onSave: (data: CompanyFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [orgName, setOrgName] = useState(editing?.orgName ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  // A company owner gets a full public template, so the choice is among those only. An existing
  // company on a narrower template still sees it listed, and it is not sent unless it changes.
  const choices = companyTemplateChoices(templates);
  const current = editing ? templates.find((tpl) => tpl.id === editing.permissionTemplateId) : undefined;
  const options = current && !choices.some((tpl) => tpl.id === current.id) ? [current, ...choices] : choices;
  const [permissionTemplateId, setPermissionTemplateId] = useState(editing?.permissionTemplateId ?? choices[0]?.id ?? '');
  // The start date is the activation day and no route changes it, so it is shown and never sent.
  const subStart = editing?.subStart?.slice(0, 10) ?? '';
  const [subEnd, setSubEnd] = useState(editing?.subEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!orgName.trim() || (!editing && (!username.trim() || !password || !email.trim()))) {
      setError(i18n.t('err_company_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        orgName: orgName.trim(),
        // The owner's sign-in details and e-mail are set once, when the account is created.
        ...(editing ? {} : { username: username.trim(), password, email: email.trim() }),
        ...(permissionTemplateId !== editing?.permissionTemplateId ? { permissionTemplateId } : {}),
        // The end date belongs to the finance route of an existing company. A new company
        // subscribes like any merchant, so the server refuses dates on create.
        ...(editing ? { subEnd: subEnd || undefined } : {}),
      });
    } catch (e) {
      setError(serverMessage(e) ?? i18n.t('err_account_save'));
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
        {!editing && (
          <>
            <div className="two-col">
              <div className="field">
                <label htmlFor="company-username">{t('developer.company_modal.username')}</label>
                <input id="company-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('developer.company_modal.username_placeholder')} />
              </div>
              <div className="field">
                <label htmlFor="company-password">{t('developer.company_modal.password')}</label>
                <input id="company-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('developer.company_modal.password')} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="company-email">{t('developer.company_modal.email')}</label>
              <input id="company-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('developer.company_modal.email_placeholder')} />
              <p className="hint">{t('developer.company_modal.email_hint')}</p>
            </div>
          </>
        )}
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
        {editing ? (
          <>
            <div className="two-col">
              <div className="field">
                <label>{t('developer.company_modal.sub_start')}</label>
                <input type="date" value={subStart} readOnly disabled />
              </div>
              <div className="field">
                <label>{t('developer.company_modal.sub_end')}</label>
                <input type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} />
              </div>
            </div>
            <p className="field hint">{t('developer.company_modal.hint')}</p>
          </>
        ) : (
          <p className="field hint">{t('developer.company_modal.create_hint')}</p>
        )}
        {editing && <OwnerSignInPanel company={editing} />}
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
