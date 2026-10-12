import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listAccounts, type Account } from '../../api/accounts';
import { listBranches, type Branch } from '../../api/branches';
import { listCustomers, type Customer } from '../../api/customers';
import { listSuppliers, type Supplier } from '../../api/suppliers';
import { downloadLedgerCsv, downloadStatementCsv, getLedger, getStatement, type LedgerReport, type StatementReport } from '../../api/reports';
import { fmt } from '../../lib/format';

/**
 * General ledger and party statement: one report on one engine, either an account ledger or a
 * customer/supplier statement, with an opening balance before the range, a running balance on
 * every line and the source of each entry. The screen reads and does not compute: every figure
 * arrives as text from the server, running balance included.
 */
type Mode = 'account' | 'customer' | 'supplier';

export function LedgerSection() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('account');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accountId, setAccountId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<LedgerReport | StatementReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Unknown source types show their raw code.
  const sourceLabel = (type: string) => t(`reports.ledger.source.${type}`, { defaultValue: type });

  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => {});
    listBranches().then(setBranches).catch(() => {});
    listCustomers().then(setCustomers).catch(() => {});
    listSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const range = () => ({ from: from || undefined, to: to || undefined, branchId: branchId || undefined });
  const ledgerParams = () => ({ accountId, ...range() });
  const statementParams = () => ({ ...(mode === 'customer' ? { customerId: partyId } : { supplierId: partyId }), ...range() });
  const ready = mode === 'account' ? Boolean(accountId) : Boolean(partyId);

  async function load() {
    if (!ready) return;
    setError(null);
    setLoading(true);
    try {
      setReport(mode === 'account' ? await getLedger(ledgerParams()) : await getStatement(statementParams()));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('reports.load_failed'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, accountId, partyId, branchId, from, to]);

  const sideLabel = report?.side === 'credit' ? t('reports.ledger.credit') : t('reports.ledger.debit');

  return (
    <div>
      <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-mode">{t('reports.ledger.mode')}</label>
          <select
            id="ledger-mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setPartyId('');
              setReport(null);
            }}
          >
            <option value="account">{t('reports.ledger.mode_account')}</option>
            <option value="customer">{t('reports.ledger.mode_customer')}</option>
            <option value="supplier">{t('reports.ledger.mode_supplier')}</option>
          </select>
        </div>
        {mode === 'account' ? (
          <div className="field" style={{ margin: 0, minWidth: 260 }}>
            <label htmlFor="ledger-account">{t('reports.ledger.account')}</label>
            <select id="ledger-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{t('reports.ledger.choose_account')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field" style={{ margin: 0, minWidth: 260 }}>
            <label htmlFor="ledger-party">{mode === 'customer' ? t('reports.ledger.customer') : t('reports.ledger.supplier')}</label>
            <select id="ledger-party" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">{t('reports.ledger.choose')}</option>
              {(mode === 'customer' ? customers : suppliers).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-from">{t('reports.ledger.from')}</label>
          <input id="ledger-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-to">{t('reports.ledger.to')}</label>
          <input id="ledger-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-branch">{t('reports.ledger.branch')}</label>
          <select id="ledger-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">{t('reports.ledger.all_branches')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn secondary"
          disabled={!report}
          onClick={() => (mode === 'account' ? downloadLedgerCsv(ledgerParams()) : downloadStatementCsv(statementParams()))}
        >
          {t('reports.csv')}
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!ready && !error && <p className="muted">{t('reports.ledger.pick_hint')}</p>}
      {loading && <p className="muted">{t('reports.loading')}</p>}

      {report && !loading && (
        <div>
          <div className="report-head" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong>
              {'party' in report
                ? t('reports.ledger.party_head', {
                    kind: report.party.kind === 'customer' ? t('reports.ledger.customer') : t('reports.ledger.supplier'),
                    name: report.party.name,
                    code: report.account?.code ?? '',
                  })
                : `${report.account?.code ?? ''} — ${report.account?.name ?? ''}`}
            </strong>
            <span className="muted">{t('reports.ledger.opening_with_side', { side: sideLabel, amount: fmt(report.opening) })}</span>
            <span className="muted">{t('reports.ledger.lines', { n: report.count })}</span>
            {report.truncated && <span className="badge overdue">{t('reports.ledger.truncated', { n: report.rows.length })}</span>}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t('reports.ledger.date')}</th>
                <th>{t('reports.ledger.entry')}</th>
                <th>{t('reports.ledger.memo')}</th>
                {'party' in report ? null : <th>{t('reports.ledger.source_col')}</th>}
                <th>{t('reports.ledger.document')}</th>
                <th className="num">{t('reports.ledger.debit')}</th>
                <th className="num">{t('reports.ledger.credit')}</th>
                <th className="num">{t('reports.ledger.balance_with_side', { side: sideLabel })}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="muted">
                <td colSpan={'party' in report ? 4 : 5}>{t('reports.ledger.opening')}</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">{fmt(report.opening)}</td>
              </tr>
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={'party' in report ? 7 : 8} className="muted">
                    {t('reports.ledger.no_movement')}
                  </td>
                </tr>
              )}
              {report.rows.map((r) => (
                <tr key={r.lineId}>
                  <td>{r.date}</td>
                  <td>{r.entryNo}</td>
                  <td>{r.memo}</td>
                  {'party' in report ? null : <td>{sourceLabel(r.source.type)}</td>}
                  <td>
                    {'party' in report ? `${sourceLabel(r.source.type)} ` : ''}
                    {r.source.no}
                  </td>
                  <td className="num">{fmt(r.debit)}</td>
                  <td className="num">{fmt(r.credit)}</td>
                  <td className="num">{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={'party' in report ? 4 : 5}>{t('reports.ledger.closing')}</th>
                <th className="num">{fmt(report.totalDebit)}</th>
                <th className="num">{fmt(report.totalCredit)}</th>
                <th className="num">{fmt(report.closing)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
