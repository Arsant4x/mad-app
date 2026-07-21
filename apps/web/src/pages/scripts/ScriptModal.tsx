import { useState } from 'react';
import type { MessageScript, ScriptAudience, ScriptInput } from '../../api/scripts';

const AUDIENCE_OPTIONS: { value: ScriptAudience; label: string }[] = [
  { value: 'TENANT', label: 'مستأجرون' },
  { value: 'CUSTOMER', label: 'عملاء' },
  { value: 'EMPLOYEE', label: 'موظفون' },
];

export function ScriptModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: MessageScript | null;
  onCancel: () => void;
  onSave: (data: ScriptInput) => Promise<void>;
}) {
  const [audience, setAudience] = useState<ScriptAudience>(editing?.audience ?? 'TENANT');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [text, setText] = useState(editing?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!title.trim() || !text.trim()) {
      setError('الرجاء تعبئة العنوان والنص');
      return;
    }
    setSaving(true);
    try {
      await onSave({ audience, title: title.trim(), text: text.trim() });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? 'تعذّر حفظ القالب');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل القالب' : 'قالب رسالة جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>الفئة المستهدفة</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value as ScriptAudience)}>
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>عنوان القالب</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تذكير بموعد السداد" />
        </div>
        <div className="field">
          <label>نص الرسالة</label>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="نص الرسالة الجاهزة..." />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة القالب'}
          </button>
        </div>
      </div>
    </div>
  );
}
