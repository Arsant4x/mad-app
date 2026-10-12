import { badgeOf } from '../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { listInvoices, type Invoice } from '../api/invoices';
import { getDashboard, type DashboardSummary } from '../api/reports';
import { usePermissions } from '../auth/PermissionsContext';
import { dfmt, fmt } from '../lib/format';
import { num0 } from '../lib/money';
import { computeRange, type DashRange } from './dashboardRange';
import { STATUS_META } from './invoices/statusMeta';

/**
 * The dashboard reads and does not compute: every figure comes from
 * GET /reports/dashboard (ledger and allocations) as two-decimal text, shown with
 * fmt and read with num0 only where a comparison is needed.
 *
 * Each card belongs to whoever can see its screen: the server omits figure cards the
 * reader cannot see, and the recent invoices and the new invoice button follow the
 * invoices screen permission.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canSee, can, loading: permissionsLoading } = usePermissions();
  const showInvoices = canSee('invoice');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = useMemo(() => computeRange(range, customFrom, customTo), [range, customFrom, customTo]);

  useEffect(() => {
    if (permissionsLoading) return;
    // Without the invoices screen the list is not requested; the 403 would stop the page from rendering.
    if (!showInvoices) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    listInvoices()
      .then(setInvoices)
      .finally(() => setLoading(false));
  }, [permissionsLoading, showInvoices]);

  useEffect(() => {
    getDashboard({ from: from ?? undefined, to }).then(setSummary);
  }, [from, to]);

  function selectRange(r: DashRange) {
    setRange(r);
    if (r !== 'custom') {
      const computed = computeRange(r, customFrom, customTo);
      setCustomFrom(computed.from ?? '');
      setCustomTo(computed.to);
    }
  }

  const periodLabel = from ? t('dashboard.period_range', { from: dfmt(from), to: dfmt(to) }) : t('dashboard.period_until', { to: dfmt(to) });

  // Figures are shown as the server sends them; net is read as a number only to pick the colour.
  const net = num0(summary?.netProfit);
  // The monthly series arrives ready; a bar's relative height is layout, not a shown number.
  const months = useMemo(
    () =>
      (summary?.monthly ?? []).map((m) => {
        const monthNo = Number(m.month.slice(5, 7));
        return { label: monthNo >= 1 && monthNo <= 12 ? t(`dashboard.month_short_${monthNo}`) : m.month, revenue: m.revenue, value: num0(m.revenue) };
      }),
    [summary, t],
  );
  const maxMonth = Math.max(1, ...months.map((m) => m.value));

  const recentInvoices = useMemo(() => [...invoices].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).slice(0, 4), [invoices]);

  if (loading || !summary) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('dashboard.title')}</div>
          <div className="page-sub">
            {t('dashboard.sub', { period: periodLabel })}
            {summary.scope === 'ownBranches' && t('dashboard.own_branches')}
          </div>
        </div>
        {can('invoice', 'add') && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => navigate('/invoices', { state: { openBuilder: true } })}>
              {t('dashboard.new_invoice')}
            </button>
          </div>
        )}
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="chip-group">
          <button className={range === 'month' ? 'chip active' : 'chip'} onClick={() => selectRange('month')}>
            {t('dashboard.range_month')}
          </button>
          <button className={range === 'quarter' ? 'chip active' : 'chip'} onClick={() => selectRange('quarter')}>
            {t('dashboard.range_quarter')}
          </button>
          <button className={range === 'year' ? 'chip active' : 'chip'} onClick={() => selectRange('year')}>
            {t('dashboard.range_year')}
          </button>
          <button className={range === 'all' ? 'chip active' : 'chip'} onClick={() => selectRange('all')}>
            {t('dashboard.range_all')}
          </button>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="date" value={customFrom} onChange={(e) => { setRange('custom'); setCustomFrom(e.target.value); }} style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5 }} />
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t('dashboard.to')}</span>
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="date" value={customTo} onChange={(e) => { setRange('custom'); setCustomTo(e.target.value); }} style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5 }} />
        </div>
      </div>

      {/* A card the server did not send is not drawn, so no zero is read as a figure. */}
      {(summary.revenue !== undefined || summary.expenses !== undefined || summary.netProfit !== undefined || summary.receivables !== undefined) && (
        <div className="kpi-row">
          {summary.revenue !== undefined && (
            <div className="kpi-card pos">
              <div className="kpi-label">{t('dashboard.revenue')}</div>
              <div className="kpi-value num">{t('dashboard.amount_sar', { amount: fmt(summary.revenue) })}</div>
              <div className="kpi-delta">{t('dashboard.revenue_note')}</div>
            </div>
          )}
          {summary.expenses !== undefined && (
            <div className="kpi-card neg">
              <div className="kpi-label">{t('dashboard.expenses')}</div>
              <div className="kpi-value num">{t('dashboard.amount_sar', { amount: fmt(summary.expenses) })}</div>
              <div className="kpi-delta">{t('dashboard.expenses_note')}</div>
            </div>
          )}
          {summary.netProfit !== undefined && (
            <div className={`kpi-card ${net >= 0 ? 'pos' : 'neg'}`}>
              <div className="kpi-label">{t('dashboard.net_profit')}</div>
              <div className="kpi-value num">{t('dashboard.amount_sar', { amount: fmt(summary.netProfit) })}</div>
              <div className={`kpi-delta ${net >= 0 ? 'up' : 'down'}`}>{net >= 0 ? t('dashboard.profit_period') : t('dashboard.loss_period')}</div>
            </div>
          )}
          {summary.receivables !== undefined && (
            <div className="kpi-card neu">
              <div className="kpi-label">{t('dashboard.receivables')}</div>
              <div className="kpi-value num">{t('dashboard.amount_sar', { amount: fmt(summary.receivables) })}</div>
              <div className="kpi-delta">{summary.scope === 'ownBranches' ? t('dashboard.receivables_own') : t('dashboard.receivables_all')}</div>
            </div>
          )}
        </div>
      )}

      {summary.monthly !== undefined && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">{t('dashboard.monthly_title')}</div>
          </div>
          <div className="chart-wrap">
            {months.length === 0 && <div className="empty-state" style={{ width: '100%' }}>{t('dashboard.monthly_empty')}</div>}
            {months.map((m, i) => (
              <div key={i} className={`bar ${i === months.length - 1 ? 'now' : ''}`} style={{ height: `${Math.max(Math.round((m.value / maxMonth) * 100), 2)}%` }}>
                <em className="num">{fmt(m.revenue)}</em>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvoices && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">{t('dashboard.recent_invoices')}</div>
            <div className="card-link" style={{ cursor: 'pointer' }} onClick={() => navigate('/invoices')}>
              {t('dashboard.view_all')}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>{t('dashboard.col_customer')}</th>
                <th>{t('dashboard.col_invoice_no')}</th>
                <th>{t('dashboard.col_date')}</th>
                <th>{t('dashboard.col_status')}</th>
                <th>{t('dashboard.col_amount')}</th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">{t('dashboard.no_invoices')}</div>
                  </td>
                </tr>
              )}
              {recentInvoices.map((inv) => (
                <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/invoices')}>
                  <td>{inv.customer.name}</td>
                  <td className="num">{inv.no}</td>
                  <td className="num">{dfmt(inv.issueDate)}</td>
                  <td>
                    <span className={`badge ${badgeOf(STATUS_META, inv.status).badgeClass}`}>{badgeOf(STATUS_META, inv.status).label}</span>
                  </td>
                  <td className="num">{fmt(inv.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
