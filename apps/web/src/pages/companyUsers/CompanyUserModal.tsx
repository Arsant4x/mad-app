import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Branch } from '../../api/branches';
import type { CompanyUser, CompanyUserInput } from '../../api/companyUsers';
import { newEmployeeTemplateId, type PermissionTemplate } from '../../api/templates';
import i18n from '../../i18n';

export function CompanyUserModal({
  templates,
  branches,
  editing,
  onCancel,
  onSave,
}: {
  templates: PermissionTemplate[];
  /** The company's branches. Empty for a single-site company, so the assignment section is not asked about
   * (same idea as BranchPicker). */
  branches: Branch[];
  editing: CompanyUser | null;
  onCancel: () => void;
  onSave: (data: Partial<CompanyUserInput> & { canEditMasterData?: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // A new employee starts with the "no screens" template, not the first in the list; anything wider is an explicit choice.
  const [permissionTemplateId, setPermissionTemplateId] = useState(editing?.permissionTemplateId ?? newEmployeeTemplateId(templates));
  const chosen = templates.find((tpl) => tpl.id === permissionTemplateId);
  const [canEditMasterData, setCanEditMasterData] = useState(editing?.canEditMasterData ?? false);
  const [branchIds, setBranchIds] = useState<string[]>(editing?.branches.map((b) => b.branchId) ?? []);
  // "All branches" is an explicit choice, not inferred from an empty list; a new employee starts without it.
  const [allBranches, setAllBranches] = useState<boolean>(editing?.allBranches ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !permissionTemplateId || (!editing && (!username.trim() || !password))) {
      setError(i18n.t('err_company_user_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        ...(username.trim() ? { username: username.trim() } : {}),
        ...(password ? { password } : {}),
        permissionTemplateId,
        canEditMasterData,
        // The flag is always sent (a branch added later is governed by it). The list is sent while the company
        // has branches; it replaces the whole set and is emptied with "all". Empty without the flag means no branch.
        allBranches,
        ...(branches.length > 0 ? { branchIds: allBranches ? [] : branchIds } : {}),
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_company_user_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('company_users.modal.title_edit') : t('company_users.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('company_users.modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('company_users.modal.name_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('company_users.modal.username')}</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={editing ? t('company_users.modal.username_keep') : t('company_users.modal.username_placeholder')} />
          </div>
          <div className="field">
            <label>{t('company_users.modal.password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing ? t('company_users.modal.password_keep') : t('company_users.modal.password')} />
          </div>
        </div>
        <div className="field">
          <label>{t('company_users.modal.template')}</label>
          <select value={permissionTemplateId} onChange={(e) => setPermissionTemplateId(e.target.value)}>
            {!permissionTemplateId && <option value="">{t('company_users.modal.template_choose')}</option>}
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          {chosen?.isNewUserDefault && <p className="hint" style={{ marginTop: 4 }}>{t('company_users.modal.no_screens_hint')}</p>}
        </div>
        {/* Branch assignment sits with the rest of the employee's permissions (an employee sees only their branch).
            "All branches" always shows, so employees of a company without branches today are governed by the
            owner's choice when a branch is added. */}
        <div className="field">
          <label>{t('company_users.modal.branches')}</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
            {t('company_users.modal.all_branches')}
          </label>
          {branches.length > 0 && !allBranches && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4 }}>
              {branches.map((b) => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                  {b.name}
                </label>
              ))}
            </div>
          )}
          <p className="hint" style={{ marginTop: 4 }}>
            {allBranches
              ? t('company_users.modal.hint_all')
              : branchIds.length === 0
                ? t('company_users.modal.hint_none')
                : t('company_users.modal.hint_some')}
          </p>
        </div>
        {/* Sits with the rest of this employee's permissions — the natural
            place to ask "what may this person touch". */}
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={canEditMasterData} onChange={(e) => setCanEditMasterData(e.target.checked)} />
            {t('company_users.modal.master_data')}
          </label>
          <p className="hint" style={{ marginTop: 4 }}>{t('company_users.modal.master_data_hint')}</p>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('company_users.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {t('company_users.modal.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
