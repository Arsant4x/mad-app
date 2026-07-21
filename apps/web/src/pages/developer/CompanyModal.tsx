import { useState } from 'react';
import type { Company, CompanyInput } from '../../api/companies';
import type { PermissionTemplate } from '../../api/templates';
import { today } from '../../lib/format';

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
  const [orgName, setOrgName] = useState(editing?.orgName ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permissionTemplateId, setPermissionTemplateId] = useState(editing?.permissionTemplateId ?? templates[0]?.id ?? '');
  const [subStart, setSubStart] = useState(editing?.subStart?.slice(0, 10) ?? today());
  const [subEnd, setSubEnd] = useState(editing?.subEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!orgName.trim() || (!editing && (!username.trim() || !password))) {
      setError('أكمل الاسم واسم الدخول وكلمة المرور');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        orgName: orgName.trim(),
        ...(username.trim() ? { username: username.trim() } : {}),
        ...(password ? { password } : {}),
        permissionTemplateId,
        subStart: subStart || undefined,
        subEnd: subEnd || undefined,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر حفظ الحساب');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل الحساب' : 'حساب مستخدم جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم المنشأة / المستخدم</label>
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="مثال: شركة أفق العقارية" />
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
        <div className="two-col">
          <div className="field">
            <label>بداية الاشتراك</label>
            <input type="date" value={subStart} onChange={(e) => setSubStart(e.target.value)} />
          </div>
          <div className="field">
            <label>نهاية الاشتراك</label>
            <input type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} />
          </div>
        </div>
        <p className="field hint">بعد انتهاء الاشتراك: يتجمَّد الحساب تلقائياً لمدة 30 يوماً، ثم يتوقف نهائياً إن لم يُجدَّد. تجديد الاشتراك يكون بتعديل تاريخ النهاية لتاريخ مستقبلي.</p>
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
