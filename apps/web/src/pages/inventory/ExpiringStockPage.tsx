import { useEffect, useState } from 'react';
import { getExpiringStock, type ExpiringBatch } from '../../api/inventory';
import { dfmt } from '../../lib/format';

const HORIZONS = [30, 60, 90, 180];

/**
 * The perishable watch-list: batches expiring soon or already expired, so a
 * pharmacy pulls or discounts stock before it lapses. Shows received quantity
 * per batch (per-batch depletion is a later feature).
 */
export function ExpiringStockPage() {
  const [withinDays, setWithinDays] = useState(90);
  const [rows, setRows] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getExpiringStock(withinDays)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [withinDays]);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">قرب انتهاء الصلاحية</div>
          <div className="page-sub">دفعات بلغت أو تقترب من تاريخ انتهائها — الأقدم أولاً</div>
        </div>
      </div>

      <div className="chip-group" style={{ marginBottom: 12 }}>
        {HORIZONS.map((d) => (
          <button key={d} className={withinDays === d ? 'chip active' : 'chip'} onClick={() => setWithinDays(d)}>
            خلال {d} يوم
          </button>
        ))}
      </div>

      {loading ? (
        <p className="hint">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">لا دفعات تنتهي خلال {withinDays} يوم.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>التشغيلة</th>
                <th>المستودع</th>
                <th>الكمية الواردة</th>
                <th>تاريخ الانتهاء</th>
                <th>المتبقّي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.productName} {r.sku ? <span className="hint">({r.sku})</span> : null}
                  </td>
                  <td>{r.batchNo ?? '—'}</td>
                  <td>{r.warehouseName}</td>
                  <td className="num">{r.qty}</td>
                  <td className="num">{dfmt(r.expiryDate)}</td>
                  <td>
                    {r.expired ? (
                      <span className="badge overdue">منتهية منذ {Math.abs(r.daysLeft)} يوم</span>
                    ) : (
                      <span className={`badge ${r.daysLeft <= 30 ? 'due' : 'draft'}`}>{r.daysLeft} يوم</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
