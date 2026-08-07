import { useEffect, useState } from 'react';
import { getIncorporationReport, type IncorporationReport } from '../../api/purchases';
import { fmt } from '../../lib/format';

/**
 * تقرير مصاريف التأسيس — ported from the v20 mockup's
 * `screen-incorporation-report`: a KPI row over a table grouped by line item.
 *
 * Kept apart from the general expense report on purpose (the mockup does the
 * same): setting a business up is a one-off investment, and folding it into
 * running costs makes the first year's operating performance read far worse
 * than it actually is.
 */
export function IncorporationReportPage() {
  const [data, setData] = useState<IncorporationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIncorporationReport()
      .then(setData)
      .catch(() => setError('تعذّر تحميل التقرير'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">تقرير مصاريف التأسيس</div>
          <div className="page-sub">إجمالي مصاريف تأسيس النشاط، مقسمة حسب البند — منفصل عن تقرير المصروفات العام</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="hint">جارٍ التحميل…</p>
      ) : !data || data.invoiceCount === 0 ? (
        <div className="empty-state">
          لا مصاريف تأسيس مسجّلة. سجّل فاتورة شراء بفئة «مصروفات تأسيس» وحدّد بندها لتظهر هنا.
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi-card neu">
              <div className="kpi-label">إجمالي مصاريف التأسيس</div>
              <div className="kpi-value num">{fmt(data.total)} ر.س</div>
            </div>
            <div className="kpi-card neu">
              <div className="kpi-label">عدد الفواتير</div>
              <div className="kpi-value num">{data.invoiceCount}</div>
            </div>
            <div className="kpi-card pos">
              <div className="kpi-label">فواتير تُستهلك على فترة</div>
              <div className="kpi-value num">{data.amortizedCount}</div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>البند</th>
                  <th>عدد الفواتير</th>
                  <th>الإجمالي</th>
                  <th>طريقة الاحتساب</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.item}>
                    <td>{row.item}</td>
                    <td className="num">{row.count}</td>
                    <td className="num">{fmt(row.total)} ر.س</td>
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
