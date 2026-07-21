import { useState } from 'react';
import { ALLOWED_SCREENS, SCREEN_LABELS, type PermissionTemplate, type TemplateInput } from '../../api/templates';

export function TemplateModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: PermissionTemplate | null;
  onCancel: () => void;
  onSave: (data: TemplateInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [screens, setScreens] = useState<Set<string>>(new Set(editing?.allowedScreens ?? ['dashboard']));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setScreens((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    setScreens(checked ? new Set(ALLOWED_SCREENS) : new Set());
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('الرجاء إدخال اسم النموذج');
      return;
    }
    const finalScreens = new Set(screens);
    finalScreens.add('dashboard');
    if (finalScreens.size === 0) {
      setError('اختر قسماً واحداً على الأقل');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), isAllScreens: false, allowedScreens: [...finalScreens] });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر حفظ النموذج');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل النموذج' : 'نموذج جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم النموذج</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: محاسب خارجي، مدير مبيعات..." />
        </div>
        <p className="field hint" style={{ marginBottom: 10 }}>
          اختر الأقسام اللي يسمح لهذا النموذج بالوصول لها:
        </p>
        <div style={{ marginBottom: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => selectAll(true)}>
            تحديد الكل
          </button>{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => selectAll(false)}>
            إلغاء التحديد
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {ALLOWED_SCREENS.map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer', fontSize: 'calc(12px * var(--font-scale))' }}>
              <input type="checkbox" checked={screens.has(key)} onChange={() => toggle(key)} style={{ width: 'auto' }} />
              {SCREEN_LABELS[key]}
            </label>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            حفظ النموذج
          </button>
        </div>
      </div>
    </div>
  );
}
