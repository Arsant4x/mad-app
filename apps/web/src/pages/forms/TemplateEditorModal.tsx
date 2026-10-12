import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
 * Template builder: edits a draft version, its name, description and ordered
 * items with type and range. One component for two actors: the platform owner in
 * the developer panel for public templates, and the company owner in the Forms
 * screen for their copy. A published version is shown, not edited (readOnly);
 * changing it means a new version. The server decides, and its message is shown.
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
  /** Shows the type picker when passed (a new public template). */
  formTypes?: FormType[];
  readOnly?: boolean;
  onCancel: () => void;
  onSave?: (value: TemplateEditorValue) => Promise<void>;
}) {
  const { t } = useTranslation();
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
    if (formTypes && !formTypeId) return setError(t('forms.editor.error_pick_type'));
    if (!name.trim()) return setError(t('forms.editor.error_name_required'));
    const built = itemInputsOf(items);
    if ('error' in built) return setError(built.error);
    setSaving(true);
    try {
      await onSave({ formTypeId: formTypes ? formTypeId : undefined, name: name.trim(), description: description.trim(), items: built.items });
    } catch (e) {
      setError(apiErrorMessage(e, t('forms.editor.save_failed')));
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
            <label>{t('forms.editor.form_type')}</label>
            <select value={formTypeId} onChange={(e) => setFormTypeId(e.target.value)} disabled={readOnly}>
              <option value="">{t('forms.editor.choose')}</option>
              {formTypes.map((ft) => (
                <option key={ft.id} value={ft.id}>
                  {ft.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="two-col">
          <div className="field">
            <label>{t('forms.editor.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>{t('forms.editor.description')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th style={{ width: '24%' }}>{t('forms.editor.col_item')}</th>
              <th>{t('forms.editor.col_type')}</th>
              <th>{t('forms.editor.col_required')}</th>
              <th>{t('forms.editor.col_min')}</th>
              <th>{t('forms.editor.col_max')}</th>
              <th>{t('forms.editor.col_unit')}</th>
              <th title={t('forms.editor.col_blocking_title')}>{t('forms.editor.col_blocking')}</th>
              <th>{t('forms.editor.col_help')}</th>
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
                    <input aria-label={t('forms.editor.item_name_aria', { n: i + 1 })} value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} disabled={readOnly} />
                  </td>
                  <td>
                    <select
                      aria-label={t('forms.editor.item_type_aria', { n: i + 1 })}
                      value={it.itemType}
                      onChange={(e) => setItem(i, { itemType: e.target.value as ItemDraft['itemType'] })}
                      disabled={readOnly}
                    >
                      {ITEM_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ITEM_TYPE_LABELS[type]}
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
                        aria-label={t('forms.editor.item_min_aria', { n: i + 1 })}
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
                        aria-label={t('forms.editor.item_max_aria', { n: i + 1 })}
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
                      <input aria-label={t('forms.editor.item_unit_aria', { n: i + 1 })} style={{ width: 64 }} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} disabled={readOnly} />
                    )}
                  </td>
                  <td>
                    {numeric && (
                      <input type="checkbox" checked={it.isBlocking} onChange={(e) => setItem(i, { isBlocking: e.target.checked })} disabled={readOnly} />
                    )}
                  </td>
                  <td>
                    <input aria-label={t('forms.editor.item_help_aria', { n: i + 1 })} style={{ width: 140 }} value={it.helpText} onChange={(e) => setItem(i, { helpText: e.target.value })} disabled={readOnly} />
                  </td>
                  {!readOnly && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('forms.editor.move_up')}>
                        ▲
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={t('forms.editor.move_down')}>
                        ▼
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                        disabled={items.length === 1}
                        aria-label={t('forms.editor.remove_item')}
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
            {t('forms.editor.add_item')}
          </button>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {readOnly ? t('forms.common.close') : t('forms.common.cancel')}
          </button>
          {!readOnly && onSave && (
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {t('forms.editor.save_draft')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
