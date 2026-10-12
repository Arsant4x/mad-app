import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBranches, type Branch } from '../../api/branches';
import { listCustomers, type Customer } from '../../api/customers';
import { downloadReceivablesAgingCsv, getReceivablesAging, type AgingReport } from '../../api/reports';
import { fmt, today } from '../../lib/format';
import { num0 } from '../../lib/money';

/**
 * Customer receivables aging: who owes us, how much, and since when.
 *
 * Reconciliation with the trial balance runs on request only: scanning the ledger costs more
 * than the report itself, so it is not paid on every load.
 */
export function ReceivablesAgingSection() {
  const { t } = useTranslation();
  const [report, setReport] = useState<AgingReport | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [asOf, setAsOf] = useState(today());
  const [branchId, setBranchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = () => ({ asOf, branchId: branchId || undefined, customerId: customerId || undefined });

  async function load(reconcile = false) {
    setError(null);
    if (reconcile) setReconciling(true);
    try {
      setReport(await getReceivablesAging({ ...params(), ...(reconcile ? { reconcile: 'true' } : {}) }));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('reports.load_failed'));
    } finally {
      setLoading(false);
      setReconciling(false);
    }
  }

  useEffect(() => {
    listBranches().then(setBranches).catch(() => {});
    listCustomers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf, branchId, customerId]);

  if (loading || !report) return null;
  const totals = report.totals;
  const rec = report.reconciliation;
  // The difference arrives as two-decimal text; read it as a number before comparing.
  const matched = rec ? Math.abs(num0(rec.difference)) < 0.005 : false;

  return (
    <div>
      <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('reports.aging.as_of')}</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('reports.aging.branch')}</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">{t('reports.aging.all_branches')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('reports.aging.customer')}</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{t('reports.aging.all_customers')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-ghost" style={{ marginInlineStart: 'auto' }} onClick={() => load(true)} disabled={reconciling}>
          {reconciling ? t('reports.aging.reconciling') : t('reports.aging.reconcile')}
        </button>
        <button className="btn btn-ghost" onClick={() => downloadReceivablesAgingCsv(params())}>
          {t('reports.aging.export_csv')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('reports.aging.customer')}</th>
              <th>{t('reports.aging.current')}</th>
              <th>{t('reports.aging.d1_header')}</th>
              <th>{t('reports.aging.d31')}</th>
              <th>{t('reports.aging.d61')}</th>
              <th>{t('reports.aging.d90')}</th>
              <th>
                {t('reports.aging.unapplied')}
                <div className="hint" style={{ fontWeight: 400 }}>
                  {t('reports.aging.unapplied_hint')}
                </div>
              </th>
              <th>{t('reports.total')}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{t('reports.aging.no_rows')}</div>
                </td>
              </tr>
            )}
            {report.rows.map((r) => (
              <tr key={r.customerId}>
                <td>{r.customerName}</td>
                <td className="num">{fmt(r.current)}</td>
                <td className="num">{fmt(r.d1)}</td>
                <td className="num">{fmt(r.d31)}</td>
                <td className="num" style={{ color: num0(r.d61) > 0 ? 'var(--amber)' : undefined }}>
                  {fmt(r.d61)}
                </td>
                <td className="num" style={{ color: num0(r.d90) > 0 ? 'var(--rose)' : undefined }}>
                  {fmt(r.d90)}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {fmt(r.unapplied)}
                </td>
                <td className="num" style={{ fontWeight: 700 }}>
                  {fmt(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
          {report.rows.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700 }}>{t('reports.total')}</td>
                <td className="num">{fmt(totals.current)}</td>
                <td className="num">{fmt(totals.d1)}</td>
                <td className="num">{fmt(totals.d31)}</td>
                <td className="num">{fmt(totals.d61)}</td>
                <td className="num">{fmt(totals.d90)}</td>
                <td className="num">{fmt(totals.unapplied)}</td>
                <td className="num" style={{ fontWeight: 700 }}>
                  {fmt(totals.total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Rent installments accrued as receivables and not yet collected, one by one with their age.
          They are already inside their customer's buckets above and in the reconciliation; naming
          them keeps the report from showing them as an unattributed difference. */}
      <div className="card" style={{ padding: 0, marginTop: 12 }}>
        <div style={{ padding: '10px 12px', fontWeight: 600 }}>
          {t('reports.aging.rent_title')}
          <span className="hint" style={{ fontWeight: 400, marginInlineStart: 8 }}>{report.rentNote}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('reports.aging.tenant')}</th>
              <th>{t('reports.aging.contract')}</th>
              <th>{t('reports.aging.unit')}</th>
              <th>{t('reports.aging.due')}</th>
              <th>{t('reports.aging.accrued')}</th>
              <th>{t('reports.aging.paid')}</th>
              <th>{t('reports.aging.remaining')}</th>
              <th>{t('reports.aging.bucket')}</th>
            </tr>
          </thead>
          <tbody>
            {report.rentRows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{t('reports.aging.no_rent_rows')}</div>
                </td>
              </tr>
            )}
            {report.rentRows.map((r) => (
              <tr key={r.installmentId}>
                <td>{r.customerName}</td>
                <td>{r.contractNo}</td>
                <td>{r.unitNo ?? '—'}</td>
                <td>{r.dueDate.slice(0, 10)}</td>
                <td className="num">{fmt(r.accrued)}</td>
                <td className="num">{fmt(r.paid)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(r.remaining)}</td>
                <td>{t(`reports.aging.bucket_name.${r.bucket}`)}</td>
              </tr>
            ))}
          </tbody>
          {report.rentRows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ fontWeight: 700 }}>{t('reports.aging.rent_total')}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(totals.rent)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Reconciliation line, shown on request only. A match is shown as plainly as a
          difference: a difference is a fact to explain, not an error to warn about. */}
      {rec && (
        <div
          className="card"
          style={{
            marginTop: 12,
            borderInlineStart: `4px solid ${matched ? 'var(--emerald)' : 'var(--amber)'}`,
            background: matched ? undefined : 'rgba(245, 158, 11, 0.06)',
          }}
        >
          {matched ? (
            <div style={{ color: 'var(--emerald)', fontWeight: 600 }}>{t('reports.aging.matched')}</div>
          ) : (
            <>
              <div style={{ fontWeight: 600 }}>
                {t('reports.aging.unattributed')}<span className="num">{fmt(rec.difference)}</span>
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                {t('reports.aging.manual_entries')}
                {rec.accountMissing && t('reports.aging.account_missing')}
              </p>
            </>
          )}
          <p className="hint" style={{ marginTop: 6 }}>
            {t('reports.aging.ledger_balance')}<b className="num">{fmt(rec.ledgerBalance)}</b>{t('reports.aging.report_total')}<b className="num">{fmt(rec.reportTotal)}</b>
          </p>
        </div>
      )}
    </div>
  );
}
