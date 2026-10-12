import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageScript, ScriptAudience, ScriptInput } from '../../api/scripts';
import i18n from '../../i18n';

const AUDIENCE_OPTIONS: ScriptAudience[] = ['TENANT', 'CUSTOMER', 'EMPLOYEE'];

export function ScriptModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: MessageScript | null;
  onCancel: () => void;
  onSave: (data: ScriptInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [audience, setAudience] = useState<ScriptAudience>(editing?.audience ?? 'TENANT');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [text, setText] = useState(editing?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!title.trim() || !text.trim()) {
      setError(i18n.t('err_script_fields'));
      return;
    }
    setSaving(true);
    try {
      await onSave({ audience, title: title.trim(), text: text.trim() });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_script_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('scripts.modal.edit_title') : t('scripts.modal.new_title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('scripts.modal.audience')}</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value as ScriptAudience)}>
            {AUDIENCE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`scripts.audience.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('scripts.modal.title')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('scripts.modal.title_placeholder')} />
        </div>
        <div className="field">
          <label>{t('scripts.modal.text')}</label>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('scripts.modal.text_placeholder')} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('scripts.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('scripts.modal.save_edit') : t('scripts.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
