import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getExpiringStock, type ExpiringBatch } from '../../api/inventory';
import { dfmt } from '../../lib/format';

const HORIZONS = [30, 60, 90, 180];

/**
 * Batches near expiry by what REMAINS, not what was received: each row is a batch
 * in one warehouse with what is left in its cost layers, so sold or written-off
 * stock does not show. Old movements with a text batch stay and are counted at
 * their received quantity, marked as such. The declared limits come from the
 * server and are shown here so the reader of the report sees its limits.
 */
export function ExpiringStockPage() {
  const { t } = useTranslation();
  const [withinDays, setWithinDays] = useState(90);
  const [rows, setRows] = useState<ExpiringBatch[]>([]);
  const [limits, setLimits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getExpiringStock(withinDays)
      .then((res) => {
        setRows(res.rows);
        setLimits(res.declaredLimits);
      })
      .finally(() => setLoading(false));
  }, [withinDays]);

  const legacyCount = rows.filter((r) => r.source === 'LEGACY_MOVEMENT').length;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('inventory.expiring.title')}</div>
          <div className="page-sub">{t('inventory.expiring.sub')}</div>
        </div>
      </div>

      {limits.length > 0 && (
        <ul className="hint" style={{ margin: '0 0 12px', paddingInlineStart: 18 }} aria-label={t('inventory.expiring.declared_limits')}>
          {limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      <div className="chip-group" style={{ marginBottom: 12 }}>
        {HORIZONS.map((d) => (
          <button key={d} className={withinDays === d ? 'chip active' : 'chip'} onClick={() => setWithinDays(d)}>
            {t('inventory.expiring.within_days', { n: d })}
          </button>
        ))}
      </div>

      {legacyCount > 0 && <p className="hint">{t('inventory.expiring.legacy_rows', { n: legacyCount })}</p>}

      {loading ? (
        <p className="hint">{t('inventory.expiring.loading')}</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">{t('inventory.expiring.empty', { n: withinDays })}</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>{t('inventory.expiring.col_product')}</th>
                <th>{t('inventory.expiring.col_batch')}</th>
                <th>{t('inventory.expiring.col_warehouse')}</th>
                <th>{t('inventory.expiring.col_qty')}</th>
                <th>{t('inventory.expiring.col_expiry')}</th>
                <th>{t('inventory.expiring.col_time_left')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.productName} {r.sku ? <span className="hint">({r.sku})</span> : null}
                  </td>
                  <td>
                    {r.batchNo ?? '—'}
                    {r.source === 'LEGACY_MOVEMENT' && (
                      <span className="badge draft" style={{ marginInlineStart: 6 }} title={t('inventory.expiring.legacy_badge_title')}>
                        {t('inventory.expiring.legacy_badge')}
                      </span>
                    )}
                  </td>
                  <td>{r.warehouseName}</td>
                  <td className="num" title={r.qtyKind === 'REMAINING' ? t('inventory.expiring.qty_remaining_title') : t('inventory.expiring.qty_received_title')}>
                    {r.qty}{' '}
                    {r.qtyKind === 'REMAINING' ? (
                      <span className="hint">{t('inventory.expiring.qty_remaining')}</span>
                    ) : (
                      <span className="hint">{t('inventory.expiring.qty_received')}</span>
                    )}
                  </td>
                  <td className="num">{dfmt(r.expiryDate)}</td>
                  <td>
                    {r.expired ? (
                      <span className="badge overdue">{t('inventory.expiring.expired_since', { n: Math.abs(r.daysLeft) })}</span>
                    ) : (
                      <span className={`badge ${r.daysLeft <= 30 ? 'due' : 'draft'}`}>{t('inventory.expiring.days_left', { n: r.daysLeft })}</span>
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
