import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { getStockLevels, type StockLevelRow, type StockStatus } from '../../api/inventory';
import { listWarehouses, type Warehouse } from '../../api/warehouses';
import { fmt } from '../../lib/format';

const STATUS_META: Record<StockStatus, { label: string; badgeClass: string }> = {
  out: { label: 'نفدت الكمية', badgeClass: 'overdue' },
  low: { label: 'منخفض', badgeClass: 'due' },
  available: { label: 'متوفر', badgeClass: 'paid' },
};

export function StockLevelsPage() {
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
          <div className="page-title">مستويات المخزون</div>
          <div className="page-sub">الكمية المتوفرة من كل صنف بكل مستودع</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث باسم المنتج أو الرمز..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
            <option value="all">كل المستودعات</option>
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
              <th>المنتج</th>
              <th>الرمز</th>
              <th>المستودع</th>
              <th>الكمية الحالية</th>
              <th>الحد الأدنى</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">لا توجد بيانات مخزون مطابقة</div>
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
                  <span className={`badge ${badgeOf(STATUS_META, r.status).badgeClass}`}>{badgeOf(STATUS_META, r.status).label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
