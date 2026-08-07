import { useState } from 'react';
import {
  ACTION_LABELS,
  ALLOWED_SCREENS,
  SCREEN_ACTIONS,
  SCREEN_LABELS,
  type PermissionTemplate,
  type ScreenAction,
  type ScreenActionMap,
  type TemplateInput,
} from '../../api/templates';
import i18n from '../../i18n';

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
  // Per-screen actions. A screen missing from this map means "all actions",
  // which is exactly how the server reads it too.
  const [actions, setActions] = useState<ScreenActionMap>(editing?.screenActions ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScreen(key: string) {
    setScreens((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Dropping a screen drops its action detail with it.
        setActions((a) => {
          const copy = { ...a };
          delete copy[key];
          return copy;
        });
      } else next.add(key);
      return next;
    });
  }

  function toggleAction(screen: string, action: ScreenAction) {
    setActions((prev) => {
      // Undetailed means "all", so the first click starts from the full set and
      // removes one — otherwise ticking a box would silently *widen* nothing and
      // unticking would look like it did nothing.
      const current = prev[screen] ?? [...SCREEN_ACTIONS];
      const next = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
      return { ...prev, [screen]: next };
    });
  }

  function selectAllScreens(checked: boolean) {
    setScreens(checked ? new Set(ALLOWED_SCREENS) : new Set());
    if (!checked) setActions({});
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_template_name_required'));
      return;
    }
    const finalScreens = new Set(screens);
    finalScreens.add('dashboard');

    // Only send action detail for screens still selected, and drop entries that
    // grant everything anyway (keeps the stored map minimal and readable).
    const finalActions: ScreenActionMap = {};
    for (const [screen, list] of Object.entries(actions)) {
      if (!finalScreens.has(screen) || list.length === 0 || list.length === SCREEN_ACTIONS.length) continue;
      finalActions[screen] = list;
    }

    setSaving(true);
    try {
      await onSave({ name: name.trim(), isAllScreens: false, allowedScreens: [...finalScreens], screenActions: finalActions });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_template_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
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
          اختر الأقسام، ثم حدّد ما يُسمح به داخل كل قسم. قسم بلا تحديد أفعال = كل الصلاحيات عليه.
        </p>
        <div style={{ marginBottom: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => selectAllScreens(true)}>
            تحديد الكل
          </button>{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => selectAllScreens(false)}>
            إلغاء التحديد
          </button>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
          {ALLOWED_SCREENS.map((key) => {
            const on = screens.has(key);
            const granted = actions[key] ?? [...SCREEN_ACTIONS];
            return (
              <div key={key} style={{ borderBottom: '1px solid var(--line)', padding: '8px 10px', background: on ? 'transparent' : 'var(--paper)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: on ? 600 : 400 }}>
                  <input type="checkbox" checked={on} onChange={() => toggleScreen(key)} style={{ width: 'auto' }} />
                  {SCREEN_LABELS[key]}
                </label>
                {on && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, paddingRight: 22 }}>
                    {SCREEN_ACTIONS.map((action) => (
                      <label key={action} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 'calc(11.5px * var(--font-scale))', color: 'var(--muted)' }}>
                        <input type="checkbox" checked={granted.includes(action)} onChange={() => toggleAction(key, action)} style={{ width: 'auto' }} />
                        {ACTION_LABELS[action]}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
