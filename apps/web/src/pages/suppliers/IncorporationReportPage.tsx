import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getIncorporationReport, type IncorporationReport } from '../../api/purchases';
import { fmt } from '../../lib/format';
import { Money } from '../../components/currency/Money';

/**
 * Establishment costs report, ported from the v20 mockup's
 * `screen-incorporation-report`: a KPI row over a table grouped by line item.
 *
 * Kept apart from the general expense report on purpose (the mockup does the
 * same): setting a business up is a one-off investment, and folding it into
 * running costs makes the first year's operating performance read far worse
 * than it actually is.
 */
export function IncorporationReportPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<IncorporationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIncorporationReport()
      .then(setData)
      .catch(() => setError(t('suppliers.incorporation.load_failed')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('suppliers.incorporation.title')}</div>
          <div className="page-sub">{t('suppliers.incorporation.subtitle')}</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="hint">{t('suppliers.common.loading')}</p>
      ) : !data || data.invoiceCount === 0 ? (
        <div className="empty-state">{t('suppliers.incorporation.empty')}</div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi-card neu">
              <div className="kpi-label">{t('suppliers.incorporation.kpi_total')}</div>
              <div className="kpi-value num"><Money value={fmt(data.total)} /></div>
            </div>
            <div className="kpi-card neu">
              <div className="kpi-label">{t('suppliers.incorporation.kpi_count')}</div>
              <div className="kpi-value num">{data.invoiceCount}</div>
            </div>
            <div className="kpi-card pos">
              <div className="kpi-label">{t('suppliers.incorporation.kpi_amortized')}</div>
              <div className="kpi-value num">{data.amortizedCount}</div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>{t('suppliers.incorporation.col_item')}</th>
                  <th>{t('suppliers.incorporation.col_count')}</th>
                  <th>{t('suppliers.incorporation.col_total')}</th>
                  <th>{t('suppliers.incorporation.col_method')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.item}>
                    <td>{row.item}</td>
                    <td className="num">{row.count}</td>
                    <td className="num"><Money value={fmt(row.total)} /></td>
                    <td>{row.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
