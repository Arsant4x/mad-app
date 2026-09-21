import { badgeOf } from '../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInvoices, type Invoice } from '../api/invoices';
import { getDashboard, type DashboardSummary } from '../api/reports';
import { dfmt, fmt } from '../lib/format';
import { num0 } from '../lib/money';
import { computeRange, type DashRange } from './dashboardRange';
import { STATUS_META } from './invoices/statusMeta';

const MONTH_NAMES = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];

/** تسميةُ شهرٍ من مفتاحه `YYYY-MM` — عرضٌ لا حساب. */
const monthLabel = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;

/**
 * لوحةُ التحكّم — **الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣`).
 *
 * كانت تجمع بنفسها من قائمتَي الفواتير والمشتريات: الإيرادَ شاملَ الضريبة، والمصروفَ إجماليَّ
 * الشراء بضريبته، والذممَ من فواتيرَ غيرِ `PAID` **بكامل إجماليها** (المسدَّدُ جزئياً كاملاً)،
 * والسلسلةَ الشهرية من الإجماليات. صارت كلُّها من `GET /reports/dashboard` — من الدفتر والتخصيصات —
 * وتصل نصّاً بخانتين فتُعرض بـ`fmt` وتُقرأ بـ`num0` حيث تلزم مقارنة.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = useMemo(() => computeRange(range, customFrom, customTo), [range, customFrom, customTo]);

  useEffect(() => {
    listInvoices()
      .then(setInvoices)
      .finally(() => setLoading(false));
  }, []);

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

  const periodLabel = from ? `من ${dfmt(from)} إلى ${dfmt(to)}` : `حتى ${dfmt(to)} (كل الفترات)`;

  // الأرقامُ من الخادم كما هي؛ والصافي يُقرأ رقماً لاختيار اللون فقط.
  const net = num0(summary?.netProfit);
  // السلسلةُ الشهرية تصل جاهزة؛ الارتفاعُ النسبيّ للعمود تخطيطٌ لا رقمٌ يُعرض.
  const months = useMemo(() => (summary?.monthly ?? []).map((m) => ({ label: monthLabel(m.month), revenue: m.revenue, value: num0(m.revenue) })), [summary]);
  const maxMonth = Math.max(1, ...months.map((m) => m.value));

  const recentInvoices = useMemo(() => [...invoices].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).slice(0, 4), [invoices]);

  if (loading || !summary) return null;

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
          <div className="kpi-value num">{fmt(summary.revenue)} ر.س</div>
          <div className="kpi-delta">صافيةً من الضريبة — للفترة المحددة</div>
        </div>
        <div className="kpi-card neg">
          <div className="kpi-label">المصروفات</div>
          <div className="kpi-value num">{fmt(summary.expenses)} ر.س</div>
          <div className="kpi-delta">من الدفتر — للفترة المحددة</div>
        </div>
        <div className={`kpi-card ${net >= 0 ? 'pos' : 'neg'}`}>
          <div className="kpi-label">صافي الربح</div>
          <div className="kpi-value num">{fmt(summary.netProfit)} ر.س</div>
          <div className={`kpi-delta ${net >= 0 ? 'up' : 'down'}`}>{net >= 0 ? 'ربح' : 'خسارة'} للفترة المحددة</div>
        </div>
        <div className="kpi-card neu">
          <div className="kpi-label">الذمم المدينة المستحقة</div>
          <div className="kpi-value num">{fmt(summary.receivables)} ر.س</div>
          <div className="kpi-delta">متبقّي الفواتير والأقساط بعد المقبوض</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">الإيرادات — اتجاه شهري</div>
        </div>
        <div className="chart-wrap">
          {months.length === 0 && <div className="empty-state" style={{ width: '100%' }}>لا توجد قيودُ إيرادٍ بعد لعرض الاتجاه</div>}
          {months.map((m, i) => (
            <div key={i} className={`bar ${i === months.length - 1 ? 'now' : ''}`} style={{ height: `${Math.max(Math.round((m.value / maxMonth) * 100), 2)}%` }}>
              <em className="num">{fmt(m.revenue)}</em>
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
