import { useState } from 'react';
import type { Branch } from '../../api/branches';
import type { CompanyUser, CompanyUserInput } from '../../api/companyUsers';
import type { PermissionTemplate } from '../../api/templates';
import i18n from '../../i18n';

export function CompanyUserModal({
  templates,
  branches,
  editing,
  onCancel,
  onSave,
}: {
  templates: PermissionTemplate[];
  /** فروع المنشأة — فارغة لمنشأة بلا فروع فلا يظهر قسم الإسناد إطلاقاً
   * (نفس فلسفة BranchPicker: منشأة الموقع الواحد لا تُسأل عن فروع). */
  branches: Branch[];
  editing: CompanyUser | null;
  onCancel: () => void;
  onSave: (data: Partial<CompanyUserInput> & { canEditMasterData?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permissionTemplateId, setPermissionTemplateId] = useState(editing?.permissionTemplateId ?? templates[0]?.id ?? '');
  const [canEditMasterData, setCanEditMasterData] = useState(editing?.canEditMasterData ?? false);
  const [branchIds, setBranchIds] = useState<string[]>(editing?.branches.map((b) => b.branchId) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

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
        canEditMasterData,
        // تُرسل دائماً ما دامت للمنشأة فروع: القيمة هي المجموعة الكاملة
        // المطلوبة (استبدال كلي في الخادم)، وإفراغها يعيد الموظف بلا قيد.
        ...(branches.length > 0 ? { branchIds } : {}),
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
        {/* إسناد الفروع هنا مع بقية صلاحيات الموظف (قرار 6.8: الموظف يرى
            فرعه فقط) — يظهر فقط لمنشأة لديها فروع أصلاً. */}
        {branches.length > 0 && (
          <div className="field">
            <label>الفروع التي يراها</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
              {branches.map((b) => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                  {b.name}
                </label>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              {branchIds.length === 0 ? 'بلا تحديد = يرى كل الفروع والبيانات العامة.' : 'يرى الفروع المحددة والبيانات العامة (غير المسندة لفرع) فقط، ويسري فوراً دون إعادة دخول.'}
            </p>
          </div>
        )}
        {/* Sits with the rest of this employee's permissions — the natural
            place to ask "what may this person touch". */}
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={canEditMasterData} onChange={(e) => setCanEditMasterData(e.target.checked)} />
            استثناء من قفل البيانات الرئيسية
          </label>
          <p className="hint" style={{ marginTop: 4 }}>يسمح له بتعديل العقارات والعقود حتى عندما تكون مقفلة على بقية الموظفين.</p>
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
