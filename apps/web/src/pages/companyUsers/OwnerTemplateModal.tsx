import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACTION_LABELS,
  ALLOWED_SCREENS,
  SCREEN_ACTIONS,
  SCREEN_LABELS,
  isScreenKey,
  type PermissionTemplate,
  type ScreenActionMap,
  type TemplateInput,
} from '../../api/templates';

/**
 * The owner's permission template editor: a screens by actions matrix.
 *
 * One row per granted screen, with its seven actions in front of it; "write contracts" is add on the
 * contracts screen, "edit contracts" is edit on it, and any number of permissions can be combined.
 */
export function OwnerTemplateModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: PermissionTemplate | null;
  onCancel: () => void;
  onSave: (data: TemplateInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [screens, setScreens] = useState<string[]>(editing?.allowedScreens ?? []);
  const [actions, setActions] = useState<ScreenActionMap>(() => {
    if (!editing) return {};
    // A screen with no stored entry means "every action" — surface that
    // honestly as all boxes checked.
    const map: ScreenActionMap = {};
    for (const s of editing.allowedScreens) map[s] = editing.screenActions?.[s] ?? [...SCREEN_ACTIONS];
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScreen(screen: string) {
    setScreens((prev) => {
      if (prev.includes(screen)) {
        setActions((a) => {
          const next = { ...a };
          delete next[screen];
          return next;
        });
        return prev.filter((s) => s !== screen);
      }
      // A newly-granted screen starts with every action — the owner narrows
      // from there, which reads better than granting a screen that can do
      // nothing until seven boxes are ticked.
      setActions((a) => ({ ...a, [screen]: [...SCREEN_ACTIONS] }));
      return [...prev, screen];
    });
  }

  function toggleAction(screen: string, action: (typeof SCREEN_ACTIONS)[number]) {
    setActions((prev) => {
      const current = prev[screen] ?? [];
      const next = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
      return { ...prev, [screen]: next };
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(t('company_users.template_modal.err_name'));
      return;
    }
    if (screens.length === 0) {
      setError(t('company_users.template_modal.err_screens'));
      return;
    }
    const emptyScreen = screens.find((s) => (actions[s] ?? []).length === 0);
    if (emptyScreen) {
      setError(t('company_users.template_modal.err_empty_screen', { screen: SCREEN_LABELS[emptyScreen as keyof typeof SCREEN_LABELS] }));
      return;
    }

    setSaving(true);
    try {
      await onSave({ name: name.trim(), isAllScreens: false, allowedScreens: screens.filter(isScreenKey), screenActions: actions });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('company_users.template_modal.err_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('company_users.template_modal.title_edit') : t('company_users.template_modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>{t('company_users.template_modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('company_users.template_modal.name_placeholder')} />
        </div>

        <p className="hint" style={{ marginBottom: 8 }}>
          {t('company_users.template_modal.hint')}
        </p>

        <div style={{ maxHeight: '46vh', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
          <table>
            <thead>
              <tr>
                <th>{t('company_users.template_modal.col_screen')}</th>
                {SCREEN_ACTIONS.map((a) => (
                  <th key={a} style={{ textAlign: 'center', fontSize: 11 }}>
                    {ACTION_LABELS[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALLOWED_SCREENS.map((screen) => {
                const granted = screens.includes(screen);
                return (
                  <tr key={screen} style={{ opacity: granted ? 1 : 0.55 }}>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={granted} onChange={() => toggleScreen(screen)} />
                        {SCREEN_LABELS[screen]}
                      </label>
                    </td>
                    {SCREEN_ACTIONS.map((a) => (
                      <td key={a} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          disabled={!granted}
                          checked={granted && (actions[screen] ?? []).includes(a)}
                          onChange={() => toggleAction(screen, a)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('company_users.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('company_users.template_modal.save_edit') : t('company_users.template_modal.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
