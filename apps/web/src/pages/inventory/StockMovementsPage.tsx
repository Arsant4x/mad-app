import { useEffect, useState } from 'react';
import { createStockMovement, deleteStockMovement, listStockMovements, type StockMovement, type StockMovementInput } from '../../api/inventory';
import { listProducts, type Product } from '../../api/products';
import { listWarehouses, type Warehouse } from '../../api/warehouses';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { StockMovementModal } from './StockMovementModal';

const TYPE_META: Record<string, string> = {
  IN: '📥 إضافة',
  OUT: '📤 صرف',
  TRANSFER: '🔁 تحويل',
  ADJUSTMENT: '⚖ تسوية',
};

export function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StockMovement | null>(null);

  async function reload() {
    const [m, p, w] = await Promise.all([listStockMovements(), listProducts(), listWarehouses()]);
    setMovements(m);
    setProducts(p);
    setWarehouses(w);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleSave(data: StockMovementInput) {
    const result = await createStockMovement(data);
    await reload();
    return result;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteStockMovement(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">حركات المخزون</div>
          <div className="page-sub">سجل كل إضافة أو صرف أو تحويل أو تسوية للمخزون</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={products.length === 0 || warehouses.length === 0}>
            + حركة مخزون جديدة
          </button>
        </div>
      </div>

      {products.length === 0 || warehouses.length === 0 ? (
        <div className="empty-state">أضف منتجًا ومستودعًا أولاً قبل تسجيل حركات المخزون</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المنتج</th>
                <th>المستودع</th>
                <th>النوع</th>
                <th>الكمية</th>
                <th>السبب/ملاحظات</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">لا توجد حركات مخزون مسجَّلة بعد</div>
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="num">{dfmt(m.date)}</td>
                  <td>{m.product.name}</td>
                  <td>{m.type === 'TRANSFER' && m.toWarehouse ? `${m.warehouse.name} ← ${m.toWarehouse.name}` : m.warehouse.name}</td>
                  <td>{TYPE_META[m.type]}</td>
                  <td className="num">{fmt(m.qty)}</td>
                  <td>{m.reason || '—'}</td>
                  <td>
                    <RowMenu actions={[{ label: '🗑 حذف', onClick: () => setPendingDelete(m), danger: true }]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <StockMovementModal products={products} warehouses={warehouses} onCancel={() => setShowModal(false)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title="حذف الحركة"
          body="حذف هذه الحركة؟ سيؤثر ذلك على الرصيد المحسوب لهذا الصنف. لا يمكن التراجع عن هذا الإجراء."
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
