import { useEffect, useRef, useState } from 'react';
import { createStockMovement, deleteStockMovement, listStockMovements, type StockMovement, type StockMovementInput } from '../../api/inventory';
import { listProducts, type Product } from '../../api/products';
import { listWarehouses, type Warehouse } from '../../api/warehouses';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Pager } from '../../components/Pager';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { StockMovementModal } from './StockMovementModal';

const TYPE_META: Record<string, string> = {
  IN: '📥 إضافة',
  OUT: '📤 صرف',
  TRANSFER: '🔁 تحويل',
  ADJUSTMENT: '⚖ تسوية',
};

const PAGE_SIZE = 25;

export function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StockMovement | null>(null);
  const searchDebounce = useRef<number | undefined>(undefined);

  async function reloadPage(p: number, q: string) {
    const res = await listStockMovements({ page: p, pageSize: PAGE_SIZE, search: q.trim() || undefined });
    setMovements(res.items);
    setTotal(res.total);
    setPage(res.page);
  }

  async function reloadAll() {
    const [, p, w] = await Promise.all([reloadPage(page, search), listProducts(), listWarehouses()]);
    setProducts(p);
    setWarehouses(w);
  }

  useEffect(() => {
    reloadAll().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search runs server-side now that the client only holds one page, debounced
  // so a keystroke burst becomes one request. Every new search restarts at
  // page 1 — the old page number is meaningless against a different filter.
  function handleSearch(q: string) {
    setSearch(q);
    window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => void reloadPage(1, q), 300);
  }

  async function handleSave(data: StockMovementInput) {
    const result = await createStockMovement(data);
    await reloadPage(page, search);
    return result;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteStockMovement(pendingDelete.id);
    setPendingDelete(null);
    await reloadPage(page, search);
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
        <>
          <div className="toolbar">
            <div className="search-box">
              <input placeholder="ابحث باسم المنتج أو المستودع أو السبب..." value={search} onChange={(e) => handleSearch(e.target.value)} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
            </div>
          </div>

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
                      <div className="empty-state">{search.trim() ? 'لا توجد حركات مطابقة' : 'لا توجد حركات مخزون مسجَّلة بعد'}</div>
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

          <Pager page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} onPage={(p) => void reloadPage(p, search)} />
        </>
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
