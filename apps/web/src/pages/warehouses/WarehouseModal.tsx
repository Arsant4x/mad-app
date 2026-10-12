import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Warehouse, WarehouseInput } from '../../api/warehouses';
import i18n from '../../i18n';

export function WarehouseModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Warehouse | null;
  onCancel: () => void;
  onSave: (data: WarehouseInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [manager, setManager] = useState(editing?.manager ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_warehouse_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), location: location.trim() || undefined, manager: manager.trim() || undefined });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_warehouse_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('warehouses.modal.title_edit') : t('warehouses.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('warehouses.modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('warehouses.modal.name_placeholder')} />
        </div>
        <div className="field">
          <label>{t('warehouses.modal.location')}</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('warehouses.modal.location_placeholder')} />
        </div>
        <div className="field">
          <label>{t('warehouses.modal.manager')}</label>
          <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder={t('warehouses.modal.manager_placeholder')} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('warehouses.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('warehouses.modal.save_edit') : t('warehouses.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
