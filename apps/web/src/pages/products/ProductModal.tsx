import { useState } from 'react';
import { apiErrorMessage } from '../../lib/apiError';
import type { Product, ProductInput } from '../../api/products';
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
  const [name, setName] = useState(editing?.name ?? '');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [unit, setUnit] = useState(editing?.unit ?? '');
  const [price, setPrice] = useState(editing?.price ?? '');
  const [cost, setCost] = useState(editing?.cost ?? '');
  const [minStock, setMinStock] = useState(editing?.minStock ?? '');
  const [barcode, setBarcode] = useState(editing?.barcode ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_product_name_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        sku: sku.trim() || undefined,
        category: category.trim() || undefined,
        unit: unit.trim() || undefined,
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
          <div className="modal-title">{editing ? 'تعديل المنتج' : 'منتج / خدمة جديدة'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>الاسم</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: اشتراك شهري" />
        </div>
        <div className="two-col">
          <div className="field">
            <label>الرمز (SKU)</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SVC-002" />
          </div>
          <div className="field">
            <label>الفئة</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="خدمة / بضاعة" />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>الوحدة</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="خدمة / قطعة" />
          </div>
          <div className="field">
            <label>سعر الوحدة</label>
            <input className="num" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="field">
          <label>التكلفة</label>
          <input className="num" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label>الحد الأدنى للمخزون (تنبيه عند الانخفاض)</label>
          <input className="num" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="اختياري" />
        </div>
        <div className="field">
          <label>الباركود (اتركه فارغاً للتوليد التلقائي)</label>
          <input className="num" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="يُولَّد تلقائياً إن ترك فارغاً" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'إضافة المنتج'}
          </button>
        </div>
      </div>
    </div>
  );
}
