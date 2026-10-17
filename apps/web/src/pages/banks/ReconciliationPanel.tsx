import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listAccounts, type Account } from '../../api/accounts';
import {
  closeReconciliation,
  confirmDepositFromStatement,
  getReconciliation,
  listCashDeposits,
  matchStatementLine,
  postStatementLine,
  reopenReconciliation,
  unmatchStatementLine,
  type Bank,
  type CashDeposit,
  type ReconciliationOverview,
} from '../../api/banks';
import { usePermissions } from '../../auth/PermissionsContext';
import { fmt } from '../../lib/format';
import i18n from '../../i18n';

/**
 * Bank reconciliation: the statement side (manual lines) against the ledger side (the bank account's lines from
 * the ledger engine), with server suggestions, one to one matching, posting a statement line that has no ledger
 * line to an account the accountant picks, and closing up to a date. The screen reads and does not compute:
 * totals and suggestions come from the server.
 */
export function ReconciliationPanel({ bank, onClose }: { bank: Bank; onClose: () => void }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // Matching and posting a line need record on banks, closing and reopening need review.
  const canRecord = can('banks', 'record');
  const canReview = can('banks', 'review');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<ReconciliationOverview | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  // `depositId`: a drawer deposit in transit confirmed from this line; the server sets the counter account (1190), so the picker is hidden.
  const [posting, setPosting] = useState<{ transactionId: string; counterpartyAccountId: string; memo: string; depositId: string } | null>(null);
  const [inTransit, setInTransit] = useState<CashDeposit[]>([]);
  const [closeUntil, setCloseUntil] = useState('');

  async function load() {
    setError(null);
    try {
      setData(await getReconciliation(bank.id, { from: from || undefined, to: to || undefined }));
      // Open deposits on this bank; unconfirmed ones are offered in the posting form.
      const deposits = await listCashDeposits(bank.id).catch(() => null);
      setInTransit(deposits ? deposits.items.filter((d) => d.status === 'IN_TRANSIT') : []);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? i18n.t('banks.reconciliation.err_load'));
    }
  }
  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank.id, from, to]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? i18n.t('banks.reconciliation.err_action'));
    }
  }

  const suggestionFor = (transactionId: string) => data?.suggestions.find((s) => s.transactionId === transactionId)?.lineIds ?? [];
  const lineLabel = (lineId: string) => {
    const r = data?.ledger.rows.find((x) => x.lineId === lineId);
    return r ? `${r.date} · ${r.entryNo} · ${r.debit !== '0.00' ? fmt(r.debit) : `−${fmt(r.credit)}`}` : lineId;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>{t('banks.reconciliation.title', { name: bank.name })}</h3>
          <button className="btn secondary" onClick={onClose}>
            {t('banks.close')}
          </button>
        </div>
        <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="rec-from">{t('banks.reconciliation.from')}</label>
            <input id="rec-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="rec-to">{t('banks.reconciliation.to')}</label>
            <input id="rec-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {data && (
            <span className="muted">
              {t('banks.reconciliation.summary', { until: data.bank.reconciledUntil ?? '—', mirror: fmt(data.bank.mirrorBalance), closing: fmt(data.ledger.closing) })}
            </span>
          )}
        </div>
        {error && <div className="error-text">{error}</div>}
        {data && (
          <>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4>
                  {t('banks.reconciliation.statement_title')} <span className="muted">{t('banks.reconciliation.statement_pending', { n: data.totals.unmatchedStatementCount, amount: fmt(data.totals.unmatchedStatement) })}</span>
                </h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('banks.reconciliation.col_date')}</th>
                      <th>{t('banks.memo')}</th>
                      <th className="num">{t('banks.reconciliation.col_amount')}</th>
                      <th>{t('banks.reconciliation.col_state')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.statement.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          {t('banks.reconciliation.no_statement')}
                        </td>
                      </tr>
                    )}
                    {data.statement.map((s) => (
                      <tr key={s.id} data-testid="statement-row">
                        <td>{s.date}</td>
                        <td>{s.description}</td>
                        <td className="num">{fmt(s.amount)}</td>
                        <td>
                          {s.matchedLineId ? (
                            <>
                              <span className="badge paid">{t('banks.reconciliation.matched')}</span>{' '}
                              {canRecord && (
                                <button className="btn link" onClick={() => act(() => unmatchStatementLine(bank.id, s.id))}>
                                  {t('banks.reconciliation.unmatch')}
                                </button>
                              )}
                            </>
                          ) : !canRecord ? (
                            <span className="badge draft">{t('banks.reconciliation.pending')}</span>
                          ) : (
                            <>
                              {suggestionFor(s.id).map((lineId) => (
                                <button key={lineId} className="btn link" title={lineLabel(lineId)} onClick={() => act(() => matchStatementLine(bank.id, s.id, lineId))}>
                                  {t('banks.reconciliation.match_with', { line: lineLabel(lineId) })}
                                </button>
                              ))}
                              <button className="btn link" onClick={() => setPosting({ transactionId: s.id, counterpartyAccountId: '', memo: s.description, depositId: '' })}>
                                {t('banks.reconciliation.post_with')}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4>
                  {t('banks.reconciliation.ledger_title')} <span className="muted">{t('banks.reconciliation.ledger_pending', { n: data.totals.unmatchedLedgerCount, amount: fmt(data.totals.unmatchedLedger) })}</span>
                </h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('banks.reconciliation.col_date')}</th>
                      <th>{t('banks.reconciliation.col_entry')}</th>
                      <th>{t('banks.reconciliation.col_source')}</th>
                      <th className="num">{t('banks.reconciliation.col_debit')}</th>
                      <th className="num">{t('banks.reconciliation.col_credit')}</th>
                      <th>{t('banks.reconciliation.col_state')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ledger.rows.map((r) => (
                      <tr key={r.lineId}>
                        <td>{r.date}</td>
                        <td>{r.entryNo}</td>
                        <td>
                          {r.source.type} {r.source.no}
                        </td>
                        <td className="num">{fmt(r.debit)}</td>
                        <td className="num">{fmt(r.credit)}</td>
                        <td>{r.matched ? <span className="badge paid">{t('banks.reconciliation.matched')}</span> : <span className="badge draft">{t('banks.reconciliation.pending')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {canRecord && posting && (
              <div className="card" style={{ marginTop: 12 }}>
                <strong>{t('banks.reconciliation.post_title')}</strong>
                <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
                  {inTransit.length > 0 && (
                    <div className="field" style={{ margin: 0, minWidth: 260 }}>
                      <label htmlFor="rec-deposit">{t('banks.reconciliation.deposit')}</label>
                      <select id="rec-deposit" value={posting.depositId} onChange={(e) => setPosting({ ...posting, depositId: e.target.value, counterpartyAccountId: '' })}>
                        <option value="">{t('banks.reconciliation.not_deposit')}</option>
                        {inTransit.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.no} · {d.date} · {d.drawer.name} · {fmt(d.amount)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {!posting.depositId && (
                    <div className="field" style={{ margin: 0, minWidth: 260 }}>
                      <label htmlFor="rec-counterparty">{t('banks.reconciliation.counterparty')}</label>
                      <select id="rec-counterparty" value={posting.counterpartyAccountId} onChange={(e) => setPosting({ ...posting, counterpartyAccountId: e.target.value })}>
                        <option value="">{t('banks.reconciliation.choose_account')}</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {posting.depositId ? (
                    <span className="muted">{t('banks.reconciliation.deposit_forced')}</span>
                  ) : (
                    <div className="field" style={{ margin: 0, minWidth: 260 }}>
                      <label htmlFor="rec-memo">{t('banks.memo')}</label>
                      <input id="rec-memo" value={posting.memo} onChange={(e) => setPosting({ ...posting, memo: e.target.value })} />
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    disabled={!posting.counterpartyAccountId && !posting.depositId}
                    onClick={() =>
                      act(() =>
                        posting.depositId
                          ? confirmDepositFromStatement(bank.id, posting.transactionId, posting.depositId)
                          : postStatementLine(bank.id, posting.transactionId, posting.counterpartyAccountId, posting.memo),
                      ).then(() => setPosting(null))
                    }
                  >
                    {posting.depositId ? t('banks.reconciliation.confirm_deposit') : t('banks.reconciliation.post_match')}
                  </button>
                  <button className="btn secondary" onClick={() => setPosting(null)}>
                    {t('banks.cancel')}
                  </button>
                </div>
              </div>
            )}

            {canReview && (
              <div className="toolbar" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="rec-close">{t('banks.reconciliation.close_until')}</label>
                  <input id="rec-close" type="date" value={closeUntil} onChange={(e) => setCloseUntil(e.target.value)} />
                </div>
                <button className="btn btn-primary" disabled={!closeUntil} onClick={() => act(() => closeReconciliation(bank.id, closeUntil))}>
                  {t('banks.reconciliation.lock')}
                </button>
                {data.bank.reconciledUntil && (
                  <button className="btn secondary" onClick={() => act(() => reopenReconciliation(bank.id))}>
                    {t('banks.reconciliation.reopen')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
