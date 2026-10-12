import { ReceivablesAgingSection } from './ReceivablesAgingSection';
import { NumberGapsSection } from './NumberGapsSection';
import { LedgerSection } from './LedgerSection';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { num0 } from '../../lib/money';
import { getBranchSummary, type BranchSummary } from '../../api/branches';
import { computeRange, type DashRange } from '../dashboardRange';

type ReportTab = 'income' | 'balance' | 'cash' | 'branch' | 'property' | 'trial' | 'ledger' | 'aging' | 'bankdiff' | 'deferred' | 'gaps';

export function ReportsPage() {
  const { t } = useTranslation();
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
      // Dated for real, so "as at" on screen matches what the server reads.
      getBalanceSheet(to),
      getCashFlow({ from: from ?? undefined, to }),
      getBranchSummary({ from: from ?? undefined, to }),
      // Point-in-time by design: occupancy and expiry are about today, not
      // about the selected reporting period.
      getPropertyKpis(),
      getTrialBalance({ from: from ?? undefined, to }),
      // Outside the range on purpose: the difference is a standing state today, not period movement.
      getBankDifference(),
      // Same for the liability: a balance standing today, not period movement.
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

  const periodLabel = from
    ? t('reports.page.period_from_to', { from: dfmt(from), to: dfmt(to) })
    : t('reports.page.period_until', { to: dfmt(to) });

  if (loading || !income || !balance || !cash) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('reports.page.title')}</div>
          <div className="page-sub">{t('reports.page.subtitle')}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="chip-group">
          <button className={range === 'month' ? 'chip active' : 'chip'} onClick={() => selectRange('month')}>
            {t('reports.range.month')}
          </button>
          <button className={range === 'quarter' ? 'chip active' : 'chip'} onClick={() => selectRange('quarter')}>
            {t('reports.range.quarter')}
          </button>
          <button className={range === 'year' ? 'chip active' : 'chip'} onClick={() => selectRange('year')}>
            {t('reports.range.year')}
          </button>
          <button className={range === 'all' ? 'chip active' : 'chip'} onClick={() => selectRange('all')}>
            {t('reports.range.all')}
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
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t('reports.page.to')}</span>
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
          {t('reports.tabs.income')}
        </button>
        <button className={tab === 'balance' ? 'tab active' : 'tab'} onClick={() => setTab('balance')}>
          {t('reports.tabs.balance')}
        </button>
        <button className={tab === 'cash' ? 'tab active' : 'tab'} onClick={() => setTab('cash')}>
          {t('reports.tabs.cash')}
        </button>
        <button className={tab === 'trial' ? 'tab active' : 'tab'} onClick={() => setTab('trial')}>
          {t('reports.tabs.trial')}
        </button>
        <button className={tab === 'ledger' ? 'tab active' : 'tab'} onClick={() => setTab('ledger')}>
          {t('reports.tabs.ledger')}
        </button>
        <button className={tab === 'aging' ? 'tab active' : 'tab'} onClick={() => setTab('aging')}>
          {t('reports.tabs.aging')}
        </button>
        {/* Always shown: an empty list here is the auditor's answer, not a tab with no subject. */}
        <button className={tab === 'gaps' ? 'tab active' : 'tab'} onClick={() => setTab('gaps')}>
          {t('reports.tabs.gaps')}
        </button>
        {/* Hidden for a business with no bank: an empty tab would ask a question that does not apply. */}
        {(bankDiff?.rows.length ?? 0) > 0 && (
          <button className={tab === 'bankdiff' ? 'tab active' : 'tab'} onClick={() => setTab('bankdiff')}>
            {t('reports.tabs.bankdiff')}
          </button>
        )}
        {/* Hidden when there is no liability and no free payment, for the same reason as bank differences. */}
        {((deferred?.outstanding.length ?? 0) > 0 || (deferred?.unlinked.length ?? 0) > 0) && (
          <button className={tab === 'deferred' ? 'tab active' : 'tab'} onClick={() => setTab('deferred')}>
            {t('reports.tabs.deferred')}
          </button>
        )}
        {/* Only for landlords: a business with no properties has nothing here. */}
        {(kpis?.occupancy.length ?? 0) > 0 && (
          <button className={tab === 'property' ? 'tab active' : 'tab'} onClick={() => setTab('property')}>
            {t('reports.tabs.property')}
          </button>
        )}
        {/* Only offered once branches exist — a single-location business has
            nothing to compare. */}
        {(branchSummary?.branches.length ?? 0) > 0 && (
          <button className={tab === 'branch' ? 'tab active' : 'tab'} onClick={() => setTab('branch')}>
            {t('reports.tabs.branch')}
          </button>
        )}
      </div>

      <div className="card">
        {tab === 'income' && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              {t('reports.income.title', { period: periodLabel })}
            </div>
            <table>
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('reports.income.revenue')}</td>
                  <td></td>
                </tr>
                {income.revenue.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingInlineStart: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>{t('reports.income.total_revenue')}</td>
                  <td className="num">{fmt(income.totalRevenue)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('reports.income.expenses')}</td>
                  <td></td>
                </tr>
                {income.expenses.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingInlineStart: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>{t('reports.income.total_expenses')}</td>
                  <td className="num">{fmt(income.totalExpenses)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700, color: 'var(--emerald)' }}>
                  <td>{t('reports.income.net_profit')}</td>
                  <td className="num">{fmt(income.netProfit)}</td>
                </tr>
              </tbody>
            </table>
            {!income.hasAnyPostedEntries && (
              <p className="hint" style={{ marginTop: 10 }}>
                {t('reports.income.no_entries')}
              </p>
            )}
          </>
        )}

        {tab === 'balance' && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              {t('reports.balance.title', { date: dfmt(balance.asOf ?? to) })}
            </div>
            <table>
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('reports.balance.assets')}</td>
                  <td></td>
                </tr>
                {balance.assets.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingInlineStart: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>{t('reports.balance.total_assets')}</td>
                  <td className="num">{fmt(balance.totalAssets)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('reports.balance.liabilities')}</td>
                  <td></td>
                </tr>
                {balance.liabilities.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingInlineStart: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('reports.balance.equity')}</td>
                  <td></td>
                </tr>
                {balance.equity.map((a) => (
                  <tr key={a.code}>
                    <td style={{ paddingInlineStart: 20 }}>{a.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700 }}>
                  <td>{t('reports.balance.total_liabilities_equity')}</td>
                  <td className="num">{fmt(balance.totalLiabilitiesAndEquity)}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 10, color: balance.balanced ? 'var(--emerald)' : 'var(--rose)' }}>
              {balance.balanced
                ? t('reports.balance.balanced')
                : t('reports.balance.unbalanced')}
            </p>
          </>
        )}

        {tab === 'cash' && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              {t('reports.cash.title', { period: periodLabel })}
            </div>
            {cash.missingAccounts.length > 0 && (
              <p className="hint" style={{ color: 'var(--rose)', marginBottom: 10 }}>
                {t('reports.cash.missing_accounts', { accounts: cash.missingAccounts.join(t('reports.list_sep')) })}
              </p>
            )}
            <table>
              <tbody>
                <tr>
                  <td>{t('reports.cash.net_profit')}</td>
                  <td className="num">{fmt(cash.netProfit)}</td>
                </tr>
                {/* The closing entry zeroes revenue and expense against retained earnings, so what
                    was closed in the period is added back to profit. */}
                {num0(cash.retainedEarningsChange) !== 0 && (
                  <tr>
                    <td>{t('reports.cash.retained_closed')}</td>
                    <td className="num">{fmt(cash.retainedEarningsChange)}</td>
                  </tr>
                )}
                <tr>
                  <td>{t('reports.cash.receivables')}</td>
                  {/* Unary minus on a text value passes the compiler but breaks the result, so read it as a number first. */}
                  <td className="num">{fmt(-num0(cash.receivablesChange))}</td>
                </tr>
                <tr>
                  <td>{t('reports.cash.inventory')}</td>
                  <td className="num">{fmt(-num0(cash.inventoryChange))}</td>
                </tr>
                <tr>
                  <td>{t('reports.cash.input_vat')}</td>
                  <td className="num">{fmt(-num0(cash.inputVatChange))}</td>
                </tr>
                <tr>
                  <td>{t('reports.cash.payables')}</td>
                  <td className="num">{fmt(cash.payablesChange)}</td>
                </tr>
                {/* Two liabilities that hold cash in hand without passing through profit: deferred
                    collections and VAT due but not yet paid. */}
                <tr>
                  <td>{t('reports.cash.deferred_revenue')}</td>
                  <td className="num">{fmt(cash.deferredRevenueChange)}</td>
                </tr>
                <tr>
                  <td>{t('reports.cash.output_vat')}</td>
                  <td className="num">{fmt(cash.outputVatChange)}</td>
                </tr>
                {/* Customer advances and tenant credit (account 2450) are cash in hand that did not pass through profit. */}
                <tr>
                  <td>{t('reports.cash.customer_prepayments')}</td>
                  <td className="num">{fmt(cash.customerPrepaymentsChange)}</td>
                </tr>
                <tr>
                  <td>{t('reports.cash.other_operating')}</td>
                  <td className="num">{fmt(cash.otherOperatingChange)}</td>
                </tr>
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>{t('reports.cash.operating')}</td>
                  <td className="num">{fmt(cash.operatingCashFlow)}</td>
                </tr>
                <tr>
                  <td>{t('reports.cash.fixed_assets')}</td>
                  <td className="num">{fmt(-num0(cash.fixedAssetChange))}</td>
                </tr>
                <tr>
                  <td>{t('reports.cash.key_money')}</td>
                  <td className="num">{fmt(-num0(cash.keyMoneyChange))}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('reports.cash.investing')}</td>
                  <td className="num">{fmt(cash.investingCashFlow)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('reports.cash.financing')}</td>
                  <td className="num">{fmt(cash.financingCashFlow)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700, color: 'var(--emerald)' }}>
                  <td>{t('reports.cash.net_change')}</td>
                  <td className="num">{fmt(cash.netCashChange)}</td>
                </tr>
                {/* Checked against the measured cash accounts, like the balance sheet check: a mismatch
                    means a line on an account outside the five types. */}
                {!cash.reconciled && (
                  <tr>
                    <td style={{ color: 'var(--rose)' }}>{t('reports.cash.not_reconciled')}</td>
                    <td className="num">{fmt(cash.cashAccountsChange)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === 'branch' && branchSummary && (
          <>
            <div className="card-title" style={{ marginBottom: 14 }}>
              {t('reports.branch.title', { period: periodLabel })}
            </div>
            <p className="hint" style={{ marginBottom: 10 }}>
              {t('reports.branch.hint')}
            </p>
            <table>
              <thead>
                <tr>
                  <th>{t('reports.branch.branch')}</th>
                  <th>{t('reports.branch.revenue')}</th>
                  <th>{t('reports.branch.expenses')}</th>
                  <th>{t('reports.branch.net_income')}</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.branches.map((b) => (
                  <tr key={b.branchId}>
                    <td>{b.branchName}</td>
                    <td className="num">{fmt(b.revenue)}</td>
                    <td className="num">{fmt(b.expenses)}</td>
                    <td className="num" style={{ color: num0(b.netIncome) >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
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
                  <td className="num" style={{ color: num0(branchSummary.consolidated.netIncome) >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                    {fmt(branchSummary.consolidated.netIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {tab === 'aging' && <ReceivablesAgingSection />}
        {tab === 'gaps' && <NumberGapsSection />}
        {tab === 'ledger' && <LedgerSection />}

        {/* Deferred revenue: the 2400 balance is one number that does not say where it came from,
            so it is broken down by contract and period, together with the payments that never
            passed through the liability. */}
        {tab === 'deferred' && deferred && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>
              {t('reports.deferred.title')}
            </div>
            <div className="page-sub" style={{ marginBottom: 14 }}>
              {t('reports.deferred.intro')}{' '}
              <strong>{fmt(deferred.totalDeferred)}</strong>
            </div>
            {deferred.outstanding.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('reports.deferred.contract')}</th>
                    <th>{t('reports.deferred.tenant')}</th>
                    <th>{t('reports.deferred.unit')}</th>
                    <th>{t('reports.deferred.service_period')}</th>
                    <th>{t('reports.deferred.collected')}</th>
                    <th>{t('reports.deferred.recognized')}</th>
                    <th>{t('reports.deferred.remaining')}</th>
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

            {/* The stated limit, shown even when the table is empty: zero is news too. */}
            <div className="card-title" style={{ marginTop: 20, marginBottom: 8 }}>
              {t('reports.deferred.unlinked_title')}
            </div>
            <div className="page-sub" style={{ marginBottom: 14 }}>
              {deferred.unlinkedNote}{t('reports.deferred.unlinked_total')}<strong>{fmt(deferred.totalUnlinked)}</strong>
            </div>
            {deferred.unlinked.length === 0 ? (
              <div className="page-sub">{t('reports.deferred.no_unlinked')}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('reports.deferred.date')}</th>
                    <th>{t('reports.deferred.contract')}</th>
                    <th>{t('reports.deferred.tenant')}</th>
                    <th>{t('reports.deferred.amount')}</th>
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

        {/* Bank differences: the ledger balance against what used to be shown, so the merchant
            moves over without surprise. */}
        {tab === 'bankdiff' && bankDiff && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>
              {t('reports.bankdiff.title')}
            </div>
            <div className="page-sub" style={{ marginBottom: 14 }}>
              {t('reports.bankdiff.intro')}
            </div>
            {bankDiff.bankCashSeparatedOn && (
              <div className="page-sub" style={{ marginBottom: 14 }}>
                {t('reports.bankdiff.separated_on', { date: dfmt(bankDiff.bankCashSeparatedOn) })}
              </div>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>{t('reports.bankdiff.bank')}</th>
                  <th>{t('reports.bankdiff.account')}</th>
                  <th>{t('reports.bankdiff.ledger_balance')}</th>
                  <th>{t('reports.bankdiff.shown_balance')}</th>
                  <th>{t('reports.bankdiff.difference')}</th>
                  <th>{t('reports.bankdiff.unposted_lines')}</th>
                </tr>
              </thead>
              <tbody>
                {bankDiff.rows.map((r) => (
                  <tr key={r.bankId}>
                    <td>{r.bankName}</td>
                    <td>{r.accountCode ?? '—'}</td>
                    <td>{fmt(r.ledgerBalance)}</td>
                    <td>{fmt(r.shownBalance)}</td>
                    <td>{num0(r.difference) === 0 ? '—' : <span className="badge overdue">{fmt(r.difference)}</span>}</td>
                    <td>{r.unpostedCount === 0 ? '—' : t('reports.bankdiff.unposted_sum', { n: r.unpostedCount, sum: fmt(r.unpostedSum) })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>{t('reports.total')}</th>
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
              <div className="card-title">{t('reports.trial.title')}</div>
              {!trial.balanced && <span className="badge overdue" style={{ marginInlineStart: 10 }}>{t('reports.trial.unbalanced')}</span>}
              <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => downloadTrialBalanceCsv({ from: from ?? undefined, to })}>
                {t('reports.export_csv')}
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('reports.trial.code')}</th>
                  <th>{t('reports.trial.account')}</th>
                  <th>{t('reports.trial.debit')}</th>
                  <th>{t('reports.trial.credit')}</th>
                  <th>{t('reports.trial.balance_debit')}</th>
                  <th>{t('reports.trial.balance_credit')}</th>
                </tr>
              </thead>
              <tbody>
                {trial.rows.length === 0 && (
                  <tr>
                    <td colSpan={6}><div className="empty-state">{t('reports.trial.no_movement')}</div></td>
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
                  <td colSpan={2}>{t('reports.total')}</td>
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
              {t('reports.property.title')}
            </div>
            {/* Says the figures are live, unlike the tabs above which honour the
                period picker. Leaving that unsaid invites the wrong reading. */}
            <p className="hint" style={{ marginBottom: 10 }}>
              {t('reports.property.live_hint')}
            </p>

            <div className="two-col" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>{t('reports.property.occupancy_rate')}</label>
                <p className="num" style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
                  {kpis.portfolio.occupancyRate}%
                </p>
                <p className="hint">
                  {t('reports.property.units_line', {
                    rented: kpis.portfolio.rented,
                    total: kpis.portfolio.totalUnits,
                    properties: kpis.portfolio.totalProperties,
                  })}
                </p>
              </div>
              <div className="field">
                <label>{t('reports.property.on_time')}</label>
                <p className="num" style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>
                  {kpis.collection.onTimeRate}%
                </p>
                {/* Two different numbers, and the gap between them is the point. */}
                <p className="hint">
                  {t('reports.property.collected_line', {
                    rate: kpis.collection.collectedRate,
                    due: fmt(kpis.collection.dueAmount),
                    n: kpis.collection.overdueCount,
                  })}
                </p>
              </div>
            </div>

            <div className="card-title" style={{ margin: '16px 0 8px' }}>
              {t('reports.property.expiring_title')}
            </div>
            <div className="chip-group" style={{ marginBottom: 8 }}>
              <span className="chip">{t('reports.property.within30', { n: kpis.expiring.within30 })}</span>
              <span className="chip">{t('reports.property.within60', { n: kpis.expiring.within60 })}</span>
              <span className="chip">{t('reports.property.within90', { n: kpis.expiring.within90 })}</span>
              {kpis.expiring.alreadyRenewed > 0 && <span className="chip">{t('reports.property.already_renewed', { n: kpis.expiring.alreadyRenewed })}</span>}
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('reports.property.contract')}</th>
                  <th>{t('reports.property.tenant')}</th>
                  <th>{t('reports.property.location')}</th>
                  <th>{t('reports.property.end')}</th>
                  <th>{t('reports.property.remaining')}</th>
                  <th>{t('reports.property.value')}</th>
                </tr>
              </thead>
              <tbody>
                {kpis.expiring.contracts.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">{t('reports.property.no_expiring')}</div>
                    </td>
                  </tr>
                )}
                {kpis.expiring.contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="num">{c.no}</td>
                    <td>{c.tenant}</td>
                    <td>
                      {c.propertyName}
                      <div className="hint">{t('reports.property.unit_no', { unit: c.unitNo })}</div>
                    </td>
                    <td className="num">{dfmt(c.end)}</td>
                    <td className="num" style={{ color: c.daysLeft <= 30 ? 'var(--rose)' : undefined }}>
                      {t('reports.property.days', { n: c.daysLeft })}
                    </td>
                    <td className="num">{fmt(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="card-title" style={{ margin: '16px 0 8px' }}>
              {t('reports.property.occupancy_title')}
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('reports.property.property')}</th>
                  <th>{t('reports.property.units')}</th>
                  <th>{t('reports.property.rented')}</th>
                  <th>{t('reports.property.reserved')}</th>
                  <th>{t('reports.property.vacant')}</th>
                  <th>{t('reports.property.maintenance')}</th>
                  <th>{t('reports.property.occupancy')}</th>
                </tr>
              </thead>
              <tbody>
                {kpis.occupancy.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">{t('reports.property.no_properties')}</div>
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
