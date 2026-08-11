import { badgeOf } from '../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInvoices, type Invoice } from '../api/invoices';
import { listPurchases, type Purchase } from '../api/purchases';
import { dfmt, fmt } from '../lib/format';
import { computeRange, inRange, type DashRange } from './dashboardRange';
import { STATUS_META } from './invoices/statusMeta';

const MONTH_NAMES = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];

export function DashboardPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    Promise.all([listInvoices(), listPurchases()])
      .then(([inv, pur]) => {
        setInvoices(inv);
        setPurchases(pur);
      })
      .finally(() => setLoading(false));
  }, []);

  const { from, to } = useMemo(() => computeRange(range, customFrom, customTo), [range, customFrom, customTo]);

  function selectRange(r: DashRange) {
    setRange(r);
    if (r !== 'custom') {
      const computed = computeRange(r, customFrom, customTo);
      setCustomFrom(computed.from ?? '');
      setCustomTo(computed.to);
    }
  }

  const periodLabel = from ? `من ${dfmt(from)} إلى ${dfmt(to)}` : `حتى ${dfmt(to)} (كل الفترات)`;

  // A credit note stores positive amounts (docType carries the direction), so
  // it enters revenue with a flipped sign rather than inflating it.
  const signedTotal = (i: Invoice) => (i.docType === 'CREDIT_NOTE' ? -1 : 1) * Number(i.total);
  const revenue = useMemo(() => invoices.filter((i) => inRange(i.issueDate, from, to)).reduce((s, i) => s + signedTotal(i), 0), [invoices, from, to]);
  const expense = useMemo(() => purchases.filter((p) => inRange(p.date, from, to)).reduce((s, p) => s + Number(p.total), 0), [purchases, from, to]);
  const net = revenue - expense;
  // Notes are issued as status PAID, so the receivables filter already skips them.
  const receivables = useMemo(() => invoices.filter((i) => i.status !== 'PAID').reduce((s, i) => s + Number(i.total), 0), [invoices]);

  const months = useMemo(() => {
    const toDate = to ? new Date(to) : new Date();
    let monthsBack = 6;
    if (from) {
      const fromDate = new Date(from);
      monthsBack = Math.max(1, Math.min(24, (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth()) + 1));
    }
    const result: { label: string; value: number }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(toDate.getFullYear(), toDate.getMonth() - i, 1);
      const mFrom = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const mToDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const mTo = `${mToDate.getFullYear()}-${String(mToDate.getMonth() + 1).padStart(2, '0')}-${String(mToDate.getDate()).padStart(2, '0')}`;
      const rv = invoices.filter((inv) => inRange(inv.issueDate, mFrom, mTo)).reduce((s, inv) => s + (inv.docType === 'CREDIT_NOTE' ? -1 : 1) * Number(inv.total), 0);
      result.push({ label: MONTH_NAMES[d.getMonth()], value: Math.round(rv / 1000) });
    }
    return result;
  }, [invoices, from, to]);
  const maxMonth = Math.max(1, ...months.map((m) => m.value));

  const recentInvoices = useMemo(() => [...invoices].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).slice(0, 4), [invoices]);

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">لوحة التحكم</div>
          <div className="page-sub">نظرة عامة على الوضع المالي — {periodLabel}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => navigate('/invoices', { state: { openBuilder: true } })}>
            + فاتورة جديدة
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="chip-group">
          <button className={range === 'month' ? 'chip active' : 'chip'} onClick={() => selectRange('month')}>
            هذا الشهر
          </button>
          <button className={range === 'quarter' ? 'chip active' : 'chip'} onClick={() => selectRange('quarter')}>
            هذا الربع
          </button>
          <button className={range === 'year' ? 'chip active' : 'chip'} onClick={() => selectRange('year')}>
            هذه السنة
          </button>
          <button className={range === 'all' ? 'chip active' : 'chip'} onClick={() => selectRange('all')}>
            كل الفترات
          </button>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="date" value={customFrom} onChange={(e) => { setRange('custom'); setCustomFrom(e.target.value); }} style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5 }} />
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>إلى</span>
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="date" value={customTo} onChange={(e) => { setRange('custom'); setCustomTo(e.target.value); }} style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5 }} />
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card pos">
          <div className="kpi-label">الإيرادات</div>
          <div className="kpi-value num">{fmt(revenue)} ر.س</div>
          <div className="kpi-delta">للفترة المحددة</div>
        </div>
        <div className="kpi-card neg">
          <div className="kpi-label">المصروفات</div>
          <div className="kpi-value num">{fmt(expense)} ر.س</div>
          <div className="kpi-delta">للفترة المحددة</div>
        </div>
        <div className={`kpi-card ${net >= 0 ? 'pos' : 'neg'}`}>
          <div className="kpi-label">صافي الربح</div>
          <div className="kpi-value num">{fmt(net)} ر.س</div>
          <div className={`kpi-delta ${net >= 0 ? 'up' : 'down'}`}>{net >= 0 ? 'ربح' : 'خسارة'} للفترة المحددة</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">الذمم المدينة المستحقة</div>
          <div className="kpi-value num">{fmt(receivables)} ر.س</div>
          <div className="kpi-delta">غير محصَّلة بعد</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">الإيرادات — اتجاه شهري</div>
        </div>
        <div className="chart-wrap">
          {months.length === 0 && <div className="empty-state" style={{ width: '100%' }}>لا توجد فواتير بعد لعرض الاتجاه</div>}
          {months.map((m, i) => (
            <div key={i} className={`bar ${i === months.length - 1 ? 'now' : ''}`} style={{ height: `${Math.max(Math.round((m.value / maxMonth) * 100), 2)}%` }}>
              <em className="num">{m.value}K</em>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">أحدث الفواتير</div>
          <div className="card-link" style={{ cursor: 'pointer' }} onClick={() => navigate('/invoices')}>
            عرض الكل ←
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>العميل</th>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {recentInvoices.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">لا توجد فواتير بعد</div>
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
    </div>
  );
}
