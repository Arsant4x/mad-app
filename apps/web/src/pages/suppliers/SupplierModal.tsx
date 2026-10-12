import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Supplier, SupplierInput } from '../../api/suppliers';
import i18n from '../../i18n';

export function SupplierModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Supplier | null;
  onCancel: () => void;
  onSave: (data: SupplierInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_supplier_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        vatNumber: vatNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        category: category.trim() || undefined,
      });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_supplier_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('suppliers.supplier_form.title_edit') : t('suppliers.supplier_form.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('suppliers.supplier_form.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('suppliers.supplier_form.name_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('suppliers.supplier_form.vat_number')}</label>
            <input className="num" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder={t('suppliers.supplier_form.vat_placeholder')} />
          </div>
          <div className="field">
            <label>{t('suppliers.supplier_form.mobile')}</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('suppliers.supplier_form.mobile_placeholder')} />
          </div>
        </div>
        <div className="field">
          <label>{t('suppliers.supplier_form.category')}</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('suppliers.supplier_form.category_placeholder')} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('suppliers.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('suppliers.common.save_edit') : t('suppliers.supplier_form.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
