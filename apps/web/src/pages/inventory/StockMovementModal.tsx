import { useState } from 'react';
import type { StockMovementInput, StockMovementType } from '../../api/inventory';
import type { Product } from '../../api/products';
import type { Warehouse } from '../../api/warehouses';
import { today } from '../../lib/format';
import { BATCH_FEFO_DECLARED_LIMITS } from '../../lib/batchLimits';
import i18n from '../../i18n';

const TYPE_OPTIONS: { value: StockMovementType; label: string }[] = [
  { value: 'IN', label: 'إضافة (وارد)' },
  { value: 'OUT', label: 'صرف (صادر)' },
  { value: 'TRANSFER', label: 'تحويل بين مستودعين' },
  { value: 'ADJUSTMENT', label: 'تسوية جرد' },
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
  // ٥+٦ الصنفُ المعلَنُ تتبّعُه يوجب الدفعةَ والانتهاءَ على الإدخال — والخادمُ يردّ بلا كتابة إن غابا (ق-١٠٨٦).
  const selectedTracked = products.find((p) => p.id === productId)?.expiryTracked === true;

  async function handleSubmit() {
    setError(null);
    setWarning(null);
    const qtyNum = parseFloat(qty);
    if (!productId || !warehouseId || !qtyNum) {
      setError(i18n.t('err_movement_fields'));
      return;
    }
    // ㉘ ما يدخل المخزونَ يحمل تكلفتَه المُدخَلة — لا تؤخذ من البطاقة، فصفرُها صفرٌ صامت (ق-١٠٦٣/٣).
    const entering = type === 'IN' || (type === 'ADJUSTMENT' && qtyNum > 0);
    const unitCostNum = parseFloat(unitCost);
    if (entering && (unitCost.trim() === '' || Number.isNaN(unitCostNum) || unitCostNum < 0)) {
      setError('تكلفة الوحدة مطلوبة للإدخال — لا تؤخذ من بطاقة الصنف');
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
        reason: reason.trim() || undefined,
        // Batch/expiry only apply to received stock.
        batchNo: type === 'IN' ? batchNo.trim() || undefined : undefined,
        expiryDate: type === 'IN' ? expiryDate || undefined : undefined,
      });
      if (result && result.resultingQty < 0) {
        // Keep the modal open so the user actually sees this — matches the
        // mockup's non-blocking "quantity exceeds balance, continue anyway?"
        // confirm, just surfaced after the fact instead of before.
        setWarning(`تنبيه: الرصيد الناتج سالب (${result.resultingQty}) — تحقق من صحة العملية`);
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
          <div className="modal-title">حركة مخزون جديدة</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>نوع الحركة</label>
          <select value={type} onChange={(e) => setType(e.target.value as StockMovementType)}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المنتج</label>
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
            <label>{type === 'TRANSFER' ? 'من مستودع' : 'المستودع'}</label>
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
              <label>إلى مستودع</label>
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
            <label>{type === 'ADJUSTMENT' ? 'الفرق (+ / -)' : 'الكمية'}</label>
            <input className="num" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={type === 'ADJUSTMENT' ? '+5 أو -5' : '0.00'} />
          </div>
          <div className="field">
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {(type === 'IN' || type === 'ADJUSTMENT') && (
          <div className="field">
            <label>تكلفة الوحدة — مطلوبة لما يدخل المخزون (لا تؤخذ من بطاقة الصنف)</label>
            <input className="num" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
          </div>
        )}
        {type === 'IN' && (
          <>
            <div className="two-col">
              <div className="field">
                <label>{selectedTracked ? 'رقم الدفعة — مطلوب لصنفٍ معلَنٍ تتبّعُه' : 'رقم الدفعة (اختياري — ومع تاريخ انتهائها)'}</label>
                <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="Batch / Lot" />
              </div>
              <div className="field">
                <label>{selectedTracked ? 'تاريخ الانتهاء — مطلوب' : 'تاريخ الانتهاء (مع رقم الدفعة)'}</label>
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
          <label>السبب / ملاحظات</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="استلام من مورد، بيع، جرد دوري..." />
        </div>

        {warning && (
          <p className="hint" style={{ color: 'var(--rose)' }}>
            {warning}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          {saved ? (
            <button className="btn btn-primary" onClick={onCancel}>
              إغلاق
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onCancel}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                حفظ الحركة
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
