import { useEffect, useMemo, useState } from 'react';
import { getBalanceSheet, getCashFlow, getIncomeStatement, type BalanceSheet, type CashFlow, type IncomeStatement } from '../../api/reports';
import { dfmt, fmt } from '../../lib/format';
import { computeRange, type DashRange } from '../dashboardRange';

type ReportTab = 'income' | 'balance' | 'cash';

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('income');
  const [range, setRange] = useState<DashRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [income, setIncome] = useState<IncomeStatement | null>(null);
  const [balance, setBalance] = useState<BalanceSheet | null>(null);
  const [cash, setCash] = useState<CashFlow | null>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => computeRange(range, customFrom, customTo), [range, customFrom, customTo]);

  function selectRange(r: DashRange) {
    setRange(r);
    if (r !== 'custom') {
      const computed = computeRange(r, customFrom, customTo);
      setCustomFrom(computed.from ?? '');
      setCustomTo(computed.to);
    }
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([getIncomeStatement({ from: from ?? undefined, to }), getBalanceSheet(), getCashFlow({ from: from ?? undefined, to })])
      .then(([inc, bal, cf]) => {
        setIncome(inc);
        setBalance(bal);
        setCash(cf);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const periodLabel = from ? `عن الفترة من ${dfmt(from)} إلى ${dfmt(to)}` : `حتى ${dfmt(to)}`;

  if (loading || !income || !balance || !cash) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">التقارير المالية</div>
          <div className="page-sub">تقارير تُبنى مباشرة من دفتر الأستاذ</div>
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
          <input
            type="date"
            value={customFrom}
            onChange={(e) => {
              setRange('custom');
              setCustomFrom(e.target.value);
            }}
            style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5 }}
          />
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>إلى</span>
        <div className="field" style={{ marginBottom: 0 }}>
          <input
            type="date"
            value={customTo}
            onChange={(e) => {
              setRange('custom');
              setCustomTo(e.target.value);
            }}
            style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5 }}
          />
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'income' ? 'tab active' : 'tab'} onClick={() => setTab('income')}>
          قائمة الدخل
        </button>
        <button className={tab === 'balance' ? 'tab active' : 'tab'} onClick={() => setTab('balance')}>
          الميزانية العمومية
        </button>
        <button className={tab === 'cash' ? 'tab active' : 'tab'} onClick={() => setTab('cash')}>
          التدفقات النقدية
        </button>
      </div>

      <div className="card">
        {tab === 'income' && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              قائمة الدخل — {periodLabel}
            </div>
            <table>
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td>الإيرادات</td>
                  <td></td>
                </tr>
                {income.revenue.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingRight: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>إجمالي الإيرادات</td>
                  <td className="num">{fmt(income.totalRevenue)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>المصروفات</td>
                  <td></td>
                </tr>
                {income.expenses.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingRight: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>إجمالي المصروفات</td>
                  <td className="num">{fmt(income.totalExpenses)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700, color: 'var(--emerald)' }}>
                  <td>صافي الربح</td>
                  <td className="num">{fmt(income.netProfit)}</td>
                </tr>
              </tbody>
            </table>
            {!income.hasAnyPostedEntries && (
              <p className="hint" style={{ marginTop: 10 }}>
                لا توجد قيود مرحّلة بعد — القيم كلها صفر حتى تُرحَّل قيود فعلية
              </p>
            )}
          </>
        )}

        {tab === 'balance' && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              الميزانية العمومية — كما في {dfmt(to)}
            </div>
            <table>
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td>الأصول</td>
                  <td></td>
                </tr>
                {balance.assets.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingRight: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>إجمالي الأصول</td>
                  <td className="num">{fmt(balance.totalAssets)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>الخصوم</td>
                  <td></td>
                </tr>
                {balance.liabilities.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingRight: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td>حقوق الملكية</td>
                  <td></td>
                </tr>
                {balance.equity.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingRight: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700 }}>
                  <td>إجمالي الخصوم وحقوق الملكية</td>
                  <td className="num">{fmt(balance.totalLiabilitiesAndEquity)}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 10, color: balance.balanced ? 'var(--emerald)' : 'var(--rose)' }}>
              {balance.balanced ? '✓ الأصول = الخصوم + حقوق الملكية' : '⚠ الميزانية غير متوازنة — تحقق من القيود المرحّلة'}
            </p>
          </>
        )}

        {tab === 'cash' && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              قائمة التدفقات النقدية — {periodLabel}
            </div>
            {cash.missingAccounts.length > 0 && (
              <p className="hint" style={{ color: 'var(--rose)', marginBottom: 10 }}>
                ⚠ الحسابات التالية غير موجودة بدليل الحسابات فتظهر بصفر: {cash.missingAccounts.join('، ')}
              </p>
            )}
            <table>
              <tbody>
                <tr>
                  <td>صافي الربح</td>
                  <td className="num">{fmt(cash.netProfit)}</td>
                </tr>
                <tr>
                  <td>التغير في الذمم المدينة</td>
                  <td className="num">{fmt(-cash.receivablesChange)}</td>
                </tr>
                <tr>
                  <td>التغير في الذمم الدائنة</td>
                  <td className="num">{fmt(cash.payablesChange)}</td>
                </tr>
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>صافي التدفق من الأنشطة التشغيلية</td>
                  <td className="num">{fmt(cash.operatingCashFlow)}</td>
                </tr>
                <tr>
                  <td>شراء/بيع أصول ثابتة</td>
                  <td className="num">{fmt(-cash.fixedAssetChange)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700, color: 'var(--emerald)' }}>
                  <td>صافي التغير في النقدية</td>
                  <td className="num">{fmt(cash.netCashChange)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
