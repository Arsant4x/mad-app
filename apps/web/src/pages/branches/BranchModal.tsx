import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Branch, BranchInput } from '../../api/branches';
import type { Warehouse } from '../../api/warehouses';
import i18n from '../../i18n';

// The value is what the server stores; the key names its label.
const BRANCH_TYPES = [
  { value: 'فرع', key: 'branch' }, // i18n-exempt: stored branch type value
  { value: 'محل', key: 'shop' }, // i18n-exempt: stored branch type value
  { value: 'مستودع', key: 'warehouse' }, // i18n-exempt: stored branch type value
  { value: 'مكتب', key: 'office' }, // i18n-exempt: stored branch type value
];

/** Label of a stored branch type in the interface language; unknown values show as stored. */
export function branchTypeLabel(value: string): string {
  const known = BRANCH_TYPES.find((b) => b.value === value);
  return known ? i18n.t(`branches.types.${known.key}`) : value;
}

export function BranchModal({
  editing,
  warehouses,
  onCancel,
  onSave,
}: {
  editing: Branch | null;
  warehouses: Warehouse[];
  onCancel: () => void;
  onSave: (data: BranchInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState(editing?.type ?? BRANCH_TYPES[0].value);
  const [hours, setHours] = useState(editing?.hours ?? '');
  const [warehouseId, setWarehouseId] = useState(editing?.warehouseId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_branch_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        type: type || undefined,
        hours: hours.trim() || undefined,
        warehouseId: warehouseId || undefined,
      });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? i18n.t('err_branch_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('branches.modal.edit_title') : t('branches.modal.new_title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('branches.modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('branches.modal.name_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('branches.modal.type')}</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {BRANCH_TYPES.map((b) => (
                <option key={b.value} value={b.value}>
                  {t(`branches.types.${b.key}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('branches.modal.hours')}</label>
            <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder={t('branches.modal.hours_placeholder')} />
          </div>
        </div>
        <div className="field">
          <label>{t('branches.modal.default_warehouse')}</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">{t('branches.modal.no_warehouse')}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('branches.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('branches.modal.save_edit') : t('branches.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
