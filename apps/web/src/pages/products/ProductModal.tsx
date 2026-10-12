import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '../../lib/apiError';
import type { Product, ProductInput } from '../../api/products';
import { UNITS_OF_MEASURE } from '../../lib/units';
import { BATCH_FEFO_DECLARED_LIMITS } from '../../lib/batchLimits';
import { buyerDependentLimit, draftTaxOf, lineTaxDraftError, productTaxPayload, STANDARD_VAT_RATE, TAX_CATEGORY_OPTIONS, type LineTaxDraft } from '../../lib/vat';
import { LineTaxPicker } from '../../components/LineTaxPicker';
import i18n from '../../i18n';

export function ProductModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: Product | null;
  onCancel: () => void;
  onSave: (data: ProductInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(editing?.name ?? '');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  // The unit is declared from the closed list, never free text or assumed; an existing item without one stays empty until declared.
  const [unitCode, setUnitCode] = useState(editing?.unitCode ?? '');
  // Batch and expiry tracking is declared (yes or no), never guessed; an existing item without a declaration stays empty.
  const [expiryTracked, setExpiryTracked] = useState<'' | 'yes' | 'no'>(editing?.expiryTracked === true ? 'yes' : editing?.expiryTracked === false ? 'no' : '');
  const [price, setPrice] = useState(editing?.price ?? '');
  const [cost, setCost] = useState(editing?.cost ?? '');
  const [minStock, setMinStock] = useState(editing?.minStock ?? '');
  const [barcode, setBarcode] = useState(editing?.barcode ?? '');
  // The tax category is declared, never assumed: a new item without one is refused, and an existing
  // LEGACY_STANDARD item (created before the field, sold at the standard rate) stays undeclared until declared here.
  const legacy = editing?.taxCategory === 'LEGACY_STANDARD';
  const [tax, setTax] = useState<LineTaxDraft | null>(editing && !legacy ? draftTaxOf(editing) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_product_name_required'));
      return;
    }
    if (!unitCode) {
      setError(t('products.modal.err_unit_required'));
      return;
    }
    if (!expiryTracked) {
      setError(t('products.modal.err_tracking_required'));
      return;
    }
    if (!editing && !tax) {
      setError(t('products.modal.err_tax_required'));
      return;
    }
    const taxProblem = tax ? lineTaxDraftError(tax) : null;
    if (taxProblem) {
      setError(taxProblem);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        sku: sku.trim() || undefined,
        category: category.trim() || undefined,
        unitCode,
        expiryTracked: expiryTracked === 'yes',
        // An undeclared existing item is left as it is (no tax fields sent), so editing never silently fixes old data.
        ...(tax ? productTaxPayload(tax) : {}),
        price: parseFloat(String(price)) || 0,
        cost: parseFloat(String(cost)) || 0,
        minStock: parseFloat(String(minStock)) || 0,
        barcode: barcode.trim() || undefined,
      });
    } catch (e) {
      setError(apiErrorMessage(e, i18n.t('err_product_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('products.modal.title_edit') : t('products.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('products.modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('products.modal.name_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('products.modal.sku')}</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder={t('products.modal.sku_placeholder')} />
          </div>
          <div className="field">
            <label>{t('products.modal.category')}</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('products.modal.category_placeholder')} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('products.modal.unit')}</label>
            <select value={unitCode} onChange={(e) => setUnitCode(e.target.value)} aria-label={t('products.modal.unit')}>
              <option value="">{t('products.modal.choose_from_list')}</option>
              {UNITS_OF_MEASURE.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.ar} ({u.code})
                </option>
              ))}
            </select>
            {editing && !editing.unitCode && (
              <div className="hint">
                {t('products.modal.unit_undeclared', { old: editing.unit ? t('products.modal.unit_old_text', { text: editing.unit }) : '' })}
              </div>
            )}
          </div>
          <div className="field">
            <label>{t('products.modal.price')}</label>
            <input className="num" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="field">
          <label>{t('products.modal.tracked')}</label>
          <select value={expiryTracked} onChange={(e) => setExpiryTracked(e.target.value as '' | 'yes' | 'no')} aria-label={t('products.modal.tracked_aria')}>
            <option value="">{t('products.modal.tracked_choose')}</option>
            <option value="yes">{t('products.modal.tracked_yes')}</option>
            <option value="no">{t('products.modal.tracked_no')}</option>
          </select>
          {editing && editing.expiryTracked === null && <div className="hint">{t('products.modal.tracked_undeclared')}</div>}
          {expiryTracked === 'yes' && (
            <ul className="hint" style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              {BATCH_FEFO_DECLARED_LIMITS.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="field">
          <label>{t('products.modal.tax')}</label>
          {tax ? (
            <LineTaxPicker value={tax} onChange={setTax} />
          ) : (
            <select value="" onChange={(e) => e.target.value && setTax({ taxCategory: e.target.value as LineTaxDraft['taxCategory'] })} aria-label={t('products.modal.tax_aria')}>
              <option value="">{t('products.modal.choose_from_list')}</option>
              {TAX_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {legacy && !tax && <div className="hint">{t('products.modal.legacy_panel', { rate: STANDARD_VAT_RATE })}</div>}
          {tax?.taxCategory !== 'Z' && <div className="hint">{buyerDependentLimit()}</div>}
        </div>
        <div className="field">
          <label>{t('products.modal.cost')}</label>
          <input className="num" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label>{t('products.modal.min_stock')}</label>
          <input className="num" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder={t('products.modal.min_stock_placeholder')} />
        </div>
        <div className="field">
          <label>{t('products.modal.barcode')}</label>
          <input className="num" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={t('products.modal.barcode_placeholder')} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('products.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('products.modal.save_edit') : t('products.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
