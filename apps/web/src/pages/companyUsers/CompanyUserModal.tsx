import { useState } from 'react';
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
  // ⚖️ ق-١٦٠١ — الجديدُ يبدأ «بلا شاشات» لا بأوّل القائمة (وكان أوّلُها الشامل)؛ والأوسعُ اختيارٌ صريح.
  const [permissionTemplateId, setPermissionTemplateId] = useState(editing?.permissionTemplateId ?? newEmployeeTemplateId(templates));
  const chosen = templates.find((t) => t.id === permissionTemplateId);
  const [canEditMasterData, setCanEditMasterData] = useState(editing?.canEditMasterData ?? false);
  const [branchIds, setBranchIds] = useState<string[]>(editing?.branches.map((b) => b.branchId) ?? []);
  // ⚖️ ق-١٤٦٨ — «كلُّ الفروع» اختيارٌ صريح لا يُستنتج من فراغ القائمة؛ والجديدُ يبدأ بلا اختيار.
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
        // ⚖️ ق-١٤٦٨ — العلَمُ يُرسل دائماً (ولو بلا فروع: فرعٌ يُضاف لاحقاً يحكمه العلَم)، والقائمةُ ما دامت
        // للمنشأة فروع — استبدالٌ كلّيّ، وتُفرَغ مع «الكلّ» فلا يتعارضان. وإفراغُها بلا العلَم **لا فرع**.
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
            {!permissionTemplateId && <option value="">اختر النموذج</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {chosen?.isNewUserDefault && <p className="hint" style={{ marginTop: 4 }}>لا يرى أي شاشة حتى تختار له نموذجاً أوسع. وما يراه لا يتجاوز ما تراه منشأتك.</p>}
        </div>
        {/* إسناد الفروع هنا مع بقية صلاحيات الموظف (قرار 6.8: الموظف يرى فرعه فقط). و«كلُّ الفروع» اختيارٌ
            صريحٌ يظهر دائماً (ق-١٤٦٨) — فمنشأةٌ بلا فروعٍ اليوم يُحكم موظّفوها في فرعٍ يُضاف غداً بما اختاره المالك. */}
        <div className="field">
          <label>الفروع التي يراها</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
            كل الفروع — ويشمل ما يُضاف لاحقاً
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
              ? 'يرى كل الفروع والبيانات العامة، ومنها كل فرعٍ يُضاف لاحقاً.'
              : branchIds.length === 0
                ? 'لا فرع — يرى البيانات العامة (غير المسندة لفرع) وحدَها.'
                : 'يرى الفروع المحددة والبيانات العامة (غير المسندة لفرع) فقط، ويسري فوراً دون إعادة دخول.'}
          </p>
        </div>
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
