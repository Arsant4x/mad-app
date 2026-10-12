import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getStockLevels, type StockLevelRow, type StockStatus } from '../../api/inventory';
import { listWarehouses, type Warehouse } from '../../api/warehouses';
import { fmt } from '../../lib/format';

// Labels are translation keys, turned into text where rendered.
const STATUS_META: Record<StockStatus, { label: string; badgeClass: string }> = {
  out: { label: 'inventory.levels.status.out', badgeClass: 'overdue' },
  low: { label: 'inventory.levels.status.low', badgeClass: 'due' },
  available: { label: 'inventory.levels.status.available', badgeClass: 'paid' },
};

export function StockLevelsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<StockLevelRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');

  useEffect(() => {
    Promise.all([getStockLevels(), listWarehouses()])
      .then(([r, w]) => {
        setRows(r);
        setWarehouses(w);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesWarehouse = warehouseFilter === 'all' || r.warehouseId === warehouseFilter;
      const matchesQuery = !q || r.product.name.toLowerCase().includes(q) || (r.product.sku ?? '').toLowerCase().includes(q);
      return matchesWarehouse && matchesQuery;
    });
  }, [rows, search, warehouseFilter]);

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('inventory.levels.title')}</div>
          <div className="page-sub">{t('inventory.levels.sub')}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('inventory.levels.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
            <option value="all">{t('inventory.levels.all_warehouses')}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('inventory.levels.col_product')}</th>
              <th>{t('inventory.levels.col_sku')}</th>
              <th>{t('inventory.levels.col_warehouse')}</th>
              <th>{t('inventory.levels.col_qty')}</th>
              <th>{t('inventory.levels.col_min')}</th>
              <th>{t('inventory.levels.col_status')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">{t('inventory.levels.empty')}</div>
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={`${r.productId}-${r.warehouseId}`}>
                <td>{r.product.name}</td>
                <td className="num">{r.product.sku || '—'}</td>
                <td>{r.warehouse.name}</td>
                <td className="num">{fmt(r.qty)}</td>
                <td className="num">{fmt(r.product.minStock)}</td>
                <td>
                  <span className={`badge ${badgeOf(STATUS_META, r.status).badgeClass}`}>{t(badgeOf(STATUS_META, r.status).label)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
