import { useState } from 'react';
import type { FormItemInput, FormType } from '../../api/forms';
import { apiErrorMessage } from '../../lib/apiError';
import { emptyItemDraft, ITEM_TYPE_LABELS, ITEM_TYPES, itemInputsOf, NUMERIC_TYPES, type ItemDraft } from './formItems';

export interface TemplateEditorValue {
  formTypeId?: string;
  name: string;
  description: string;
  items: FormItemInput[];
}

/**
 * ⚖️ **منشئُ القوالب** (الموجة ١ب · `ق-١٦٣٨`): يحرّر مسوّدةَ إصدار — الاسمَ والوصفَ والبنودَ بترتيبها ونوعِها ونطاقِها.
 * مكوِّنٌ واحد لفاعلَين (قرارُ الخطّة ٤٣): مالكُ المنصّة في لوحة المطوّر لقوالبها العامّة، ومالكُ المنشأة في شاشة «النماذج» لنسخته.
 * **والمنشورُ يُعرض ولا يُحرَّر** (`readOnly`): تعديلُه إصدارٌ جديد. والحكمُ في الخادم، ورسالتُه هي ما يظهر.
 */
export function TemplateEditorModal({
  title,
  initial,
  formTypes,
  readOnly = false,
  onCancel,
  onSave,
}: {
  title: string;
  initial: { formTypeId?: string; name: string; description: string; items: ItemDraft[] };
  /** يُعرض مُنتقي النوع حين يُمرَّر (قالبٌ عامٌّ جديد). */
  formTypes?: FormType[];
  readOnly?: boolean;
  onCancel: () => void;
  onSave?: (value: TemplateEditorValue) => Promise<void>;
}) {
  const [formTypeId, setFormTypeId] = useState(initial.formTypeId ?? '');
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [items, setItems] = useState<ItemDraft[]>(initial.items.length ? initial.items : [emptyItemDraft()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) =>
    setItems((xs) => {
      const j = i + by;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function handleSave() {
    if (!onSave) return;
    setError(null);
    if (formTypes && !formTypeId) return setError('اختر نوعَ النموذج.');
    if (!name.trim()) return setError('للقالب اسمٌ يُكتب.');
    const built = itemInputsOf(items);
    if ('error' in built) return setError(built.error);
    setSaving(true);
    try {
      await onSave({ formTypeId: formTypes ? formTypeId : undefined, name: name.trim(), description: description.trim(), items: built.items });
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر حفظ القالب'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }} role="dialog" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        {formTypes && (
          <div className="field">
            <label>نوعُ النموذج</label>
            <select value={formTypeId} onChange={(e) => setFormTypeId(e.target.value)} disabled={readOnly}>
              <option value="">اختر</option>
              {formTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="two-col">
          <div className="field">
            <label>اسمُ القالب</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>وصف (اختياريّ)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th style={{ width: '24%' }}>البند</th>
              <th>النوع</th>
              <th>إلزاميّ</th>
              <th>من</th>
              <th>إلى</th>
              <th>الوحدة</th>
              <th title="قيمةٌ خارج النطاق تمنع الختم">يمنع الختم</th>
              <th>إرشاد</th>
              {!readOnly && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const numeric = NUMERIC_TYPES.has(it.itemType);
              return (
                <tr key={i} data-testid="template-item-row">
                  <td className="num">{i + 1}</td>
                  <td>
                    <input aria-label={`اسم البند ${i + 1}`} value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} disabled={readOnly} />
                  </td>
                  <td>
                    <select
                      aria-label={`نوع البند ${i + 1}`}
                      value={it.itemType}
                      onChange={(e) => setItem(i, { itemType: e.target.value as ItemDraft['itemType'] })}
                      disabled={readOnly}
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {ITEM_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={it.required} onChange={(e) => setItem(i, { required: e.target.checked })} disabled={readOnly} />
                  </td>
                  <td>
                    {numeric && (
                      <input
                        aria-label={`أدنى البند ${i + 1}`}
                        className="num"
                        style={{ width: 64 }}
                        value={it.minValue}
                        onChange={(e) => setItem(i, { minValue: e.target.value })}
                        disabled={readOnly}
                      />
                    )}
                  </td>
                  <td>
                    {numeric && (
                      <input
                        aria-label={`أعلى البند ${i + 1}`}
                        className="num"
                        style={{ width: 64 }}
                        value={it.maxValue}
                        onChange={(e) => setItem(i, { maxValue: e.target.value })}
                        disabled={readOnly}
                      />
                    )}
                  </td>
                  <td>
                    {numeric && (
                      <input aria-label={`وحدة البند ${i + 1}`} style={{ width: 64 }} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} disabled={readOnly} />
                    )}
                  </td>
                  <td>
                    {numeric && (
                      <input type="checkbox" checked={it.isBlocking} onChange={(e) => setItem(i, { isBlocking: e.target.checked })} disabled={readOnly} />
                    )}
                  </td>
                  <td>
                    <input aria-label={`إرشاد البند ${i + 1}`} style={{ width: 140 }} value={it.helpText} onChange={(e) => setItem(i, { helpText: e.target.value })} disabled={readOnly} />
                  </td>
                  {!readOnly && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="أعلى">
                        ▲
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="أسفل">
                        ▼
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                        disabled={items.length === 1}
                        aria-label="حذف البند"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!readOnly && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setItems((xs) => [...xs, emptyItemDraft()])}>
            + بند
          </button>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {readOnly ? 'إغلاق' : 'إلغاء'}
          </button>
          {!readOnly && onSave && (
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              حفظُ المسوّدة
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
