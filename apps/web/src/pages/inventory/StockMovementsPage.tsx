import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createStockMovement, listStockMovements, reverseStockMovement, type StockMovement, type StockMovementInput } from '../../api/inventory';
import { listProducts, type Product } from '../../api/products';
import { listWarehouses, type Warehouse } from '../../api/warehouses';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Pager } from '../../components/Pager';
import { RowMenu } from '../../components/RowMenu';
import { apiErrorMessage } from '../../lib/apiError';
import { dfmt, fmt } from '../../lib/format';
import { StockMovementModal } from './StockMovementModal';

// Labels are translation keys, turned into text where rendered.
const TYPE_META: Record<string, string> = {
  IN: 'inventory.movements.type_in',
  OUT: 'inventory.movements.type_out',
  TRANSFER: 'inventory.movements.type_transfer',
  ADJUSTMENT: 'inventory.movements.type_adjustment',
};

const PAGE_SIZE = 25;

export function StockMovementsPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // A new movement needs record and a reversal needs delete; the server refuses them otherwise.
  const canRecord = can('inventory', 'record');
  const canReverse = can('inventory', 'delete');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StockMovement | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);
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

  // A movement is never deleted: it is reversed by an opposite movement that points to it, and both stay.
  async function confirmReverse() {
    if (!pendingDelete) return;
    setReverseError(null);
    try {
      await reverseStockMovement(pendingDelete.id);
    } catch (e) {
      setReverseError(apiErrorMessage(e, t('inventory.movements.reverse_failed')));
      return;
    }
    setPendingDelete(null);
    await reloadPage(page, search);
  }

  function closeReverse() {
    setPendingDelete(null);
    setReverseError(null);
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('inventory.movements.title')}</div>
          <div className="page-sub">{t('inventory.movements.sub')}</div>
        </div>
        <div className="topbar-actions">
          {canRecord && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={products.length === 0 || warehouses.length === 0}>
              {t('inventory.movements.new')}
            </button>
          )}
        </div>
      </div>

      {products.length === 0 || warehouses.length === 0 ? (
        <div className="empty-state">{t('inventory.movements.needs_setup')}</div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <input placeholder={t('inventory.movements.search')} value={search} onChange={(e) => handleSearch(e.target.value)} />
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
                  <th>{t('inventory.movements.col_date')}</th>
                  <th>{t('inventory.movements.col_product')}</th>
                  <th>{t('inventory.movements.col_warehouse')}</th>
                  <th>{t('inventory.movements.col_type')}</th>
                  <th>{t('inventory.movements.col_qty')}</th>
                  <th>{t('inventory.movements.col_reason')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">{search.trim() ? t('inventory.movements.empty_search') : t('inventory.movements.empty')}</div>
                    </td>
                  </tr>
                )}
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="num">{dfmt(m.date)}</td>
                    <td>{m.product.name}</td>
                    <td>
                      {m.type === 'TRANSFER' && m.toWarehouse
                        ? t('inventory.movements.transfer_route', { from: m.warehouse.name, to: m.toWarehouse.name })
                        : m.warehouse.name}
                    </td>
                    <td>{TYPE_META[m.type] ? t(TYPE_META[m.type]) : undefined}</td>
                    <td className="num">{fmt(m.qty)}</td>
                    <td>{m.reason || '—'}</td>
                    <td>
                      {canReverse && <RowMenu actions={[{ label: t('inventory.movements.reverse_action'), onClick: () => setPendingDelete(m), danger: true }]} />}
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
          title={t('inventory.movements.reverse_title')}
          body={reverseError ?? t('inventory.movements.reverse_body')}
          confirmLabel={t('inventory.movements.reverse_confirm')}
          onCancel={closeReverse}
          onConfirm={confirmReverse}
        />
      )}
    </div>
  );
}
