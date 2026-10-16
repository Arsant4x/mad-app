import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StockMovementInput, StockMovementType } from '../../api/inventory';
import type { Product } from '../../api/products';
import type { Warehouse } from '../../api/warehouses';
import { usePermissions } from '../../auth/PermissionsContext';
import { today } from '../../lib/format';
import { BATCH_FEFO_DECLARED_LIMITS } from '../../lib/batchLimits';
import i18n from '../../i18n';

// Labels are translation keys, turned into text where rendered.
const TYPE_OPTIONS: { value: StockMovementType; label: string }[] = [
  { value: 'IN', label: 'inventory.movement_modal.type_in' },
  { value: 'OUT', label: 'inventory.movement_modal.type_out' },
  { value: 'TRANSFER', label: 'inventory.movement_modal.type_transfer' },
  { value: 'ADJUSTMENT', label: 'inventory.movement_modal.type_adjustment' },
];

export function StockMovementModal({
  products,
  warehouses,
  onCancel,
  onSave,
}: {
  products: Product[];
  warehouses: Warehouse[];
  onCancel: () => void;
  onSave: (data: StockMovementInput) => Promise<{ resultingQty: number } | void>;
}) {
  const { t } = useTranslation();
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? '');
  const [type, setType] = useState<StockMovementType>('IN');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // An item with declared tracking needs batch and expiry on receipt; the server rejects it without them.
  const selectedTracked = products.find((p) => p.id === productId)?.expiryTracked === true;
  // Same rule as the server: a stock out or a negative adjustment reduces inventory value and needs review too.
  const { can } = usePermissions();
  const reducesValue = type === 'OUT' || (type === 'ADJUSTMENT' && parseFloat(qty) < 0);
  const missingReview = reducesValue && !can('inventory', 'review');

  async function handleSubmit() {
    setError(null);
    setWarning(null);
    const qtyNum = parseFloat(qty);
    if (!productId || !warehouseId || !qtyNum) {
      setError(i18n.t('err_movement_fields'));
      return;
    }
    // Stock coming in carries its entered cost; taking it from the item card would hide a zero.
    const entering = type === 'IN' || (type === 'ADJUSTMENT' && qtyNum > 0);
    const unitCostNum = parseFloat(unitCost);
    if (entering && (unitCost.trim() === '' || Number.isNaN(unitCostNum) || unitCostNum < 0)) {
      setError(t('inventory.movement_modal.err_unit_cost'));
      return;
    }
    // The reason is required; the server rejects blanks too, this only warns before sending.
    if (!reason.trim()) {
      setError(t('inventory.movement_modal.err_reason'));
      return;
    }
    setSaving(true);
    try {
      const result = await onSave({
        productId,
        warehouseId,
        toWarehouseId: type === 'TRANSFER' ? toWarehouseId : undefined,
        type,
        qty: qtyNum,
        date,
        unitCost: entering ? unitCostNum : undefined,
        reason: reason.trim(),
        // Batch/expiry only apply to received stock.
        batchNo: type === 'IN' ? batchNo.trim() || undefined : undefined,
        expiryDate: type === 'IN' ? expiryDate || undefined : undefined,
      });
      if (result && result.resultingQty < 0) {
        // Keep the modal open so the user sees this non-blocking warning;
        // it is shown after saving rather than asked before.
        setWarning(t('inventory.movement_modal.negative_warning', { qty: result.resultingQty }));
        setSaved(true);
      } else {
        onCancel();
      }
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_movement_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{t('inventory.movement_modal.title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>{t('inventory.movement_modal.type')}</label>
          <select value={type} onChange={(e) => setType(e.target.value as StockMovementType)}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('inventory.movement_modal.product')}</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{type === 'TRANSFER' ? t('inventory.movement_modal.from_warehouse') : t('inventory.movement_modal.warehouse')}</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {type === 'TRANSFER' && (
            <div className="field">
              <label>{t('inventory.movement_modal.to_warehouse')}</label>
              <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="two-col">
          <div className="field">
            <label>{type === 'ADJUSTMENT' ? t('inventory.movement_modal.difference') : t('inventory.movement_modal.qty')}</label>
            <input
              className="num"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={type === 'ADJUSTMENT' ? t('inventory.movement_modal.difference_placeholder') : '0.00'}
            />
          </div>
          <div className="field">
            <label>{t('inventory.movement_modal.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {(type === 'IN' || type === 'ADJUSTMENT') && (
          <div className="field">
            <label>{t('inventory.movement_modal.unit_cost')}</label>
            <input className="num" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
          </div>
        )}
        {type === 'IN' && (
          <>
            <div className="two-col">
              <div className="field">
                <label>{selectedTracked ? t('inventory.movement_modal.batch_required') : t('inventory.movement_modal.batch_optional')}</label>
                <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder={t('inventory.movement_modal.batch_placeholder')} />
              </div>
              <div className="field">
                <label>{selectedTracked ? t('inventory.movement_modal.expiry_required') : t('inventory.movement_modal.expiry_optional')}</label>
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            </div>
            {selectedTracked && (
              <ul className="hint" style={{ margin: '0 0 8px', paddingInlineStart: 18 }}>
                {BATCH_FEFO_DECLARED_LIMITS.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="field">
          <label>{t('inventory.movement_modal.reason')}</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('inventory.movement_modal.reason_placeholder')} required />
        </div>

        {warning && (
          <p className="hint" style={{ color: 'var(--rose)' }}>
            {warning}
          </p>
        )}
        {missingReview && !saved && <p className="hint">{t('inventory.movement_modal.needs_review')}</p>}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          {saved ? (
            <button className="btn btn-primary" onClick={onCancel}>
              {t('inventory.movement_modal.close')}
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onCancel}>
                {t('inventory.movement_modal.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || missingReview}>
                {t('inventory.movement_modal.save')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
