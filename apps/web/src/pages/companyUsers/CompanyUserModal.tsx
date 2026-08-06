import { useState } from 'react';
import type { CompanyUser, CompanyUserInput } from '../../api/companyUsers';
import type { PermissionTemplate } from '../../api/templates';
import i18n from '../../i18n';

export function CompanyUserModal({
  templates,
  editing,
  onCancel,
  onSave,
}: {
  templates: PermissionTemplate[];
  editing: CompanyUser | null;
  onCancel: () => void;
  onSave: (data: Partial<CompanyUserInput>) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permissionTemplateId, setPermissionTemplateId] = useState(editing?.permissionTemplateId ?? templates[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || (!editing && (!username.trim() || !password))) {
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
          <div className="modal-title">{editing ? 'تعديل حساب الموظف' : 'حساب موظف جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم الموظف</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: خالد المطيري" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>اسم الدخول</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={editing ? 'اتركه فارغاً للإبقاء عليه' : 'username'} />
          </div>
          <div className="field">
            <label>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing ? 'اتركها فارغة للإبقاء عليها' : 'كلمة المرور'} />
          </div>
        </div>
        <div className="field">
          <label>النموذج</label>
          <select value={permissionTemplateId} onChange={(e) => setPermissionTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            حفظ الحساب
          </button>
        </div>
      </div>
    </div>
  );
}
