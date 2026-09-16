import { ReceivablesAgingSection } from './ReceivablesAgingSection';
import { useEffect, useMemo, useState } from 'react';
import {
  getBalanceSheet,
  getCashFlow,
  getIncomeStatement,
  getPropertyKpis,
  type BalanceSheet,
  type CashFlow,
  type IncomeStatement,
  type PropertyKpis,
  getTrialBalance,
  downloadTrialBalanceCsv,
  type TrialBalance,
  getBankDifference,
  type BankDifference,
  getDeferredRevenue,
  type DeferredRevenue,
} from '../../api/reports';
import { dfmt, fmt } from '../../lib/format';
import { getBranchSummary, type BranchSummary } from '../../api/branches';
import { computeRange, type DashRange } from '../dashboardRange';

type ReportTab = 'income' | 'balance' | 'cash' | 'branch' | 'property' | 'trial' | 'aging' | 'bankdiff' | 'deferred';

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('income');
  const [range, setRange] = useState<DashRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [income, setIncome] = useState<IncomeStatement | null>(null);
  const [balance, setBalance] = useState<BalanceSheet | null>(null);
  const [cash, setCash] = useState<CashFlow | null>(null);
  const [branchSummary, setBranchSummary] = useState<BranchSummary | null>(null);
  const [kpis, setKpis] = useState<PropertyKpis | null>(null);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [bankDiff, setBankDiff] = useState<BankDifference | null>(null);
  const [deferred, setDeferred] = useState<DeferredRevenue | null>(null);
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
    Promise.all([
      getIncomeStatement({ from: from ?? undefined, to }),
      getBalanceSheet(),
      getCashFlow({ from: from ?? undefined, to }),
      getBranchSummary({ from: from ?? undefined, to }),
      // Point-in-time by design: occupancy and expiry are about today, not
      // about the selected reporting period.
      getPropertyKpis(),
      getTrialBalance({ from: from ?? undefined, to }),
      // خارج المدى عمداً: الفرقُ حالةٌ قائمة اليوم لا حركةُ فترة.
      getBankDifference(),
      // وكذلك الالتزام: رصيدٌ قائمٌ اليوم لا حركةُ فترة.
      getDeferredRevenue(),
    ])
      .then(([inc, bal, cf, br, pk, tb, bd, dr]) => {
        setIncome(inc);
        setBalance(bal);
        setCash(cf);
        setBranchSummary(br);
        setKpis(pk);
        setTrial(tb);
        setBankDiff(bd);
        setDeferred(dr);
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
        <button className={tab === 'trial' ? 'tab active' : 'tab'} onClick={() => setTab('trial')}>
          ميزان المراجعة
        </button>
        <button className={tab === 'aging' ? 'tab active' : 'tab'} onClick={() => setTab('aging')}>
          أعمار الذمم
        </button>
        {/* لا يُعرض لمن لا بنكَ له — تبويبٌ فارغ يسأل عن سؤالٍ لا يخصّه. */}
        {(bankDiff?.rows.length ?? 0) > 0 && (
          <button className={tab === 'bankdiff' ? 'tab active' : 'tab'} onClick={() => setTab('bankdiff')}>
            فروق البنوك
          </button>
        )}
        {/* لا يُعرض لمن لا التزامَ له ولا دفعةً حرّة — تبويبٌ فارغ يسأل عن سؤالٍ
            لا يخصّه، كسابقه في فروق البنوك. */}
        {((deferred?.outstanding.length ?? 0) > 0 || (deferred?.unlinked.length ?? 0) > 0) && (
          <button className={tab === 'deferred' ? 'tab active' : 'tab'} onClick={() => setTab('deferred')}>
            الإيراد المؤجَّل
          </button>
        )}
        {/* Only for landlords: a business with no properties has nothing here. */}
        {(kpis?.occupancy.length ?? 0) > 0 && (
          <button className={tab === 'property' ? 'tab active' : 'tab'} onClick={() => setTab('property')}>
            المؤشرات العقارية
          </button>
        )}
        {/* Only offered once branches exist — a single-location business has
            nothing to compare. */}
        {(branchSummary?.branches.length ?? 0) > 0 && (
          <button className={tab === 'branch' ? 'tab active' : 'tab'} onClick={() => setTab('branch')}>
            حسب الفرع
          </button>
        )}
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
                {/* ⭐ التزامان كانا خارج المعادلة (ق-٩٢٣ · ق-٩٢٥/③): قبضٌ يُؤجَّل، وضريبةٌ مستحقّة لم تُسدَّد — نقدٌ في اليد لم يمرّ بالربح. */}
                <tr>
                  <td>التغير في الإيراد المؤجَّل (قبضٌ عن خدمةٍ لم تُقدَّم)</td>
                  <td className="num">{fmt(cash.deferredRevenueChange)}</td>
                </tr>
                <tr>
                  <td>التغير في ضريبة القيمة المضافة المستحقة</td>
                  <td className="num">{fmt(cash.outputVatChange)}</td>
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

        {tab === 'branch' && branchSummary && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              الأداء حسب الفرع — {periodLabel}
            </div>
            <p className="hint" style={{ marginBottom: 10 }}>
              محسوب من القيود المرحَّلة بالعملة الأساسية، فتظهر الفروع التي تتعامل بعملة أخرى ضمن إجمالي واحد قابل للمقارنة.
            </p>
            <table>
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th>الإيرادات</th>
                  <th>المصروفات</th>
                  <th>صافي الدخل</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.branches.map((b) => (
                  <tr key={b.branchId}>
                    <td>{b.branchName}</td>
                    <td className="num">{fmt(b.revenue)}</td>
                    <td className="num">{fmt(b.expenses)}</td>
                    <td className="num" style={{ color: b.netIncome >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                      {fmt(b.netIncome)}
                    </td>
                  </tr>
                ))}
                {/* Its own row rather than folded away: company-wide documents
                    genuinely belong to no branch, and hiding them would stop
                    the rows adding up to the consolidated total. */}
                <tr style={{ color: 'var(--muted)' }}>
                  <td>{branchSummary.unassigned.branchName}</td>
                  <td className="num">{fmt(branchSummary.unassigned.revenue)}</td>
                  <td className="num">{fmt(branchSummary.unassigned.expenses)}</td>
                  <td className="num">{fmt(branchSummary.unassigned.netIncome)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700 }}>
                  <td>{branchSummary.consolidated.branchName}</td>
                  <td className="num">{fmt(branchSummary.consolidated.revenue)}</td>
                  <td className="num">{fmt(branchSummary.consolidated.expenses)}</td>
                  <td className="num" style={{ color: branchSummary.consolidated.netIncome >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                    {fmt(branchSummary.consolidated.netIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {tab === 'aging' && <ReceivablesAgingSection />}

        {/* الإيرادُ المؤجَّل (ق-٤٦٨): رصيدُ `2400` رقمٌ واحدٌ لا يقول ممّن تكوّن
            — فيُفصَّل بعقده وفترته. ومعه شرطُ المالك (ق-٤٧٣): «من يقرأ إيرادَه
            يعرف كم منه لم يمرّ بالالتزام». */}
        {tab === 'deferred' && deferred && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>
              الإيراد المؤجَّل — التزامٌ عن مدّة لم تُقدَّم بعد
            </div>
            <div className="page-sub" style={{ marginBottom: 14 }}>
              القسط يستحقّ في أوّل فترته، فما يُقبض عن مدّة لم تُقدَّم يبقى التزاماً ويتحوّل إيراداً شهراً بشهر. الإجمالي القائم:{' '}
              <strong>{fmt(deferred.totalDeferred)}</strong>
            </div>
            {deferred.outstanding.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>العقد</th>
                    <th>المستأجر</th>
                    <th>الوحدة</th>
                    <th>فترة الخدمة</th>
                    <th>المقبوض</th>
                    <th>المعترَف به</th>
                    <th>المتبقّي التزاماً</th>
                  </tr>
                </thead>
                <tbody>
                  {deferred.outstanding.map((r, idx) => (
                    <tr key={`${r.contractNo}-${idx}`}>
                      <td>{r.contractNo}</td>
                      <td>{r.tenant}</td>
                      <td>{r.unitNo ?? '—'}</td>
                      <td>
                        {dfmt(r.serviceStart)} — {dfmt(r.serviceEnd)}
                      </td>
                      <td>{fmt(r.collected)}</td>
                      <td>{fmt(r.recognized)}</td>
                      <td>
                        <strong>{fmt(r.deferred)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ⚠️ الحدُّ المعلَن — يُعرض ولو كان الجدولُ فارغاً، فالصفرُ خبرٌ أيضاً. */}
            <div className="card-title" style={{ marginTop: 20, marginBottom: 8 }}>
              دفعات لم تمرّ بالإيراد المؤجَّل
            </div>
            <div className="page-sub" style={{ marginBottom: 14 }}>
              {deferred.unlinkedNote}. الإجمالي: <strong>{fmt(deferred.totalUnlinked)}</strong>
            </div>
            {deferred.unlinked.length === 0 ? (
              <div className="page-sub">لا دفعات من هذا النوع.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>العقد</th>
                    <th>المستأجر</th>
                    <th>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {deferred.unlinked.map((r, idx) => (
                    <tr key={`${r.contractNo}-${r.date}-${idx}`}>
                      <td>{dfmt(r.date)}</td>
                      <td>{r.contractNo}</td>
                      <td>{r.tenant}</td>
                      <td>{fmt(r.baseNetAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* تقريرُ الفرق (ق-٢٨٥/٣): «الرصيدُ الدفتريّ مقابل ما كان يُعرض،
            فينتقل التاجرُ بلا صدمة» — ومعه إعلانُ ق-٢٨٣. */}
        {tab === 'bankdiff' && bankDiff && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>
              فروق البنوك — الرصيد الدفتري مقابل المعروض
            </div>
            <div className="page-sub" style={{ marginBottom: 14 }}>
              الرصيدُ الدفتري يأتي من دفتر الأستاذ. والحركة البنكية اليدوية للمطابقة ولا تُرحَّل، فلا تحرّك الرصيد — وما حرّكته قبل ذلك يظهر هنا فرقاً.
            </div>
            {bankDiff.bankCashSeparatedOn && (
              <div className="page-sub" style={{ marginBottom: 14 }}>
                ⚠ ما قبل {dfmt(bankDiff.bankCashSeparatedOn)} يشمل مقبوضات البنوك ضمن الصندوق — قبل ذلك التاريخ لم يكن للبنوك حساباتٌ في الدليل.
              </div>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>البنك</th>
                  <th>الحساب</th>
                  <th>الرصيد الدفتري</th>
                  <th>المعروض</th>
                  <th>الفرق</th>
                  <th>أسطر بلا قيد</th>
                </tr>
              </thead>
              <tbody>
                {bankDiff.rows.map((r) => (
                  <tr key={r.bankId}>
                    <td>{r.bankName}</td>
                    <td>{r.accountCode ?? '—'}</td>
                    <td>{fmt(r.ledgerBalance)}</td>
                    <td>{fmt(r.shownBalance)}</td>
                    <td>{r.difference === 0 ? '—' : <span className="badge overdue">{fmt(r.difference)}</span>}</td>
                    <td>{r.unpostedCount === 0 ? '—' : `${r.unpostedCount} بمجموع ${fmt(r.unpostedSum)}`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>الإجمالي</th>
                  <th>{fmt(bankDiff.totals.ledgerBalance)}</th>
                  <th>{fmt(bankDiff.totals.shownBalance)}</th>
                  <th>{fmt(bankDiff.totals.difference)}</th>
                  <th>{bankDiff.totals.unpostedCount || '—'}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {tab === 'trial' && trial && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <div className="card-title">ميزان المراجعة</div>
              {!trial.balanced && <span className="badge overdue" style={{ marginRight: 10 }}>⚠ غير متوازن — راجع القيود</span>}
              <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }} onClick={() => downloadTrialBalanceCsv({ from: from ?? undefined, to })}>
                ⬇ تصدير CSV
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>الحساب</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>رصيد مدين</th>
                  <th>رصيد دائن</th>
                </tr>
              </thead>
              <tbody>
                {trial.rows.length === 0 && (
                  <tr>
                    <td colSpan={6}><div className="empty-state">لا حركة في الفترة المحددة</div></td>
                  </tr>
                )}
                {trial.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="num">{r.code}</td>
                    <td>{r.name}</td>
                    <td className="num">{fmt(r.debitTotal)}</td>
                    <td className="num">{fmt(r.creditTotal)}</td>
                    <td className="num">{r.balanceDebit ? fmt(r.balanceDebit) : '—'}</td>
                    <td className="num">{r.balanceCredit ? fmt(r.balanceCredit) : '—'}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                  <td colSpan={2}>الإجمالي</td>
                  <td className="num">{fmt(trial.totalDebit)}</td>
                  <td className="num">{fmt(trial.totalCredit)}</td>
                  <td className="num">{fmt(trial.totalBalanceDebit)}</td>
                  <td className="num">{fmt(trial.totalBalanceCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {tab === 'property' && kpis && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              مؤشرات المحفظة العقارية — حتى اليوم
            </div>
            {/* Says the figures are live, unlike the tabs above which honour the
                period picker. Leaving that unsaid invites the wrong reading. */}
            <p className="hint" style={{ marginBottom: 10 }}>
              هذه المؤشرات لحظية ولا تتبع الفترة المختارة أعلاه: الإشغال والعقود المنتهية تُحسب من تاريخ اليوم.
            </p>

            <div className="two-col" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>معدل الإشغال</label>
                <p className="num" style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
                  {kpis.portfolio.occupancyRate}%
                </p>
                <p className="hint">
                  {kpis.portfolio.rented} من {kpis.portfolio.totalUnits} وحدة في {kpis.portfolio.totalProperties} عقاراً
                </p>
              </div>
              <div className="field">
                <label>التحصيل في الوقت المحدد</label>
                <p className="num" style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
                  {kpis.collection.onTimeRate}%
                </p>
                {/* Two different numbers, and the gap between them is the point. */}
                <p className="hint">
                  المحصَّل إجمالاً {kpis.collection.collectedRate}% من {fmt(kpis.collection.dueAmount)} مستحقة —{' '}
                  {kpis.collection.overdueCount} قسط متأخر
                </p>
              </div>
            </div>

            <div className="card-title" style={{ margin: '16px 0 8px' }}>
              العقود المنتهية قريباً
            </div>
            <div className="chip-group" style={{ marginBottom: 8 }}>
              <span className="chip">خلال 30 يوماً: {kpis.expiring.within30}</span>
              <span className="chip">خلال 60: {kpis.expiring.within60}</span>
              <span className="chip">خلال 90: {kpis.expiring.within90}</span>
              {kpis.expiring.alreadyRenewed > 0 && <span className="chip">مجدَّدة بالفعل: {kpis.expiring.alreadyRenewed}</span>}
            </div>
            <table>
              <thead>
                <tr>
                  <th>العقد</th>
                  <th>المستأجر</th>
                  <th>الموقع</th>
                  <th>الانتهاء</th>
                  <th>المتبقي</th>
                  <th>القيمة</th>
                </tr>
              </thead>
              <tbody>
                {kpis.expiring.contracts.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">لا توجد عقود تنتهي خلال 90 يوماً</div>
                    </td>
                  </tr>
                )}
                {kpis.expiring.contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="num">{c.no}</td>
                    <td>{c.tenant}</td>
                    <td>
                      {c.propertyName}
                      <div className="hint">وحدة {c.unitNo}</div>
                    </td>
                    <td className="num">{dfmt(c.end)}</td>
                    <td className="num" style={{ color: c.daysLeft <= 30 ? 'var(--rose)' : undefined }}>
                      {c.daysLeft} يوم
                    </td>
                    <td className="num">{fmt(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="card-title" style={{ margin: '16px 0 8px' }}>
              الإشغال حسب العقار
            </div>
            <table>
              <thead>
                <tr>
                  <th>العقار</th>
                  <th>الوحدات</th>
                  <th>مؤجَّرة</th>
                  <th>محجوزة</th>
                  <th>شاغرة</th>
                  <th>صيانة</th>
                  <th>الإشغال</th>
                </tr>
              </thead>
              <tbody>
                {kpis.occupancy.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">لا توجد عقارات</div>
                    </td>
                  </tr>
                )}
                {kpis.occupancy.map((o) => (
                  <tr key={o.propertyId}>
                    <td>{o.propertyName}</td>
                    <td className="num">{o.total}</td>
                    <td className="num">{o.rented}</td>
                    <td className="num">{o.reserved}</td>
                    <td className="num">{o.vacant}</td>
                    <td className="num">{o.maintenance}</td>
                    <td className="num">{o.occupancyRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
