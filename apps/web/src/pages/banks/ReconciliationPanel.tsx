import { useEffect, useState } from 'react';
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
import { fmt } from '../../lib/format';

/**
 * التسويةُ البنكية (`ق-١٢٦١` ج): جانبُ الكشف (السطورُ اليدوية) مقابل جانب الدفتر (سطورُ حساب البنك بمحرّك الأستاذ)،
 * مقترَحاتٌ من الخادم، مطابقةٌ واحدٌ لواحد، وترحيلُ السطر الذي لا دفترَ له بطرفٍ يختاره المحاسب، وإقفالٌ حتى تاريخ.
 * **الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣`): المجاميعُ والمقترَحاتُ من الخادم.
 */
export function ReconciliationPanel({ bank, onClose }: { bank: Bank; onClose: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<ReconciliationOverview | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  // `depositId` — إيداعُ درجٍ في الطريق (⑦A3) يؤكَّد من هذا السطر: الطرفُ المقابل يفرضه الخادم (`1190`) فيُخفى الاختيار.
  const [posting, setPosting] = useState<{ transactionId: string; counterpartyAccountId: string; memo: string; depositId: string } | null>(null);
  const [inTransit, setInTransit] = useState<CashDeposit[]>([]);
  const [closeUntil, setCloseUntil] = useState('');

  async function load() {
    setError(null);
    try {
      setData(await getReconciliation(bank.id, { from: from || undefined, to: to || undefined }));
      // الإيداعاتُ المفتوحة على هذا البنك — ما لم يؤكَّد بعد يُعرض في نموذج الترحيل.
      const deposits = await listCashDeposits(bank.id).catch(() => null);
      setInTransit(deposits ? deposits.items.filter((d) => d.status === 'IN_TRANSIT') : []);
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'تعذّر تحميل التسوية');
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
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'تعذّر التنفيذ');
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
          <h3 style={{ margin: 0 }}>التسوية البنكية — {bank.name}</h3>
          <button className="btn secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
        <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="rec-from">من</label>
            <input id="rec-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="rec-to">إلى</label>
            <input id="rec-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {data && (
            <span className="muted">
              مُسوّى حتى: {data.bank.reconciledUntil ?? '—'} · رصيد المرآة: {fmt(data.bank.mirrorBalance)} · رصيد الدفتر الختامي: {fmt(data.ledger.closing)}
            </span>
          )}
        </div>
        {error && <div className="error-text">{error}</div>}
        {data && (
          <>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4>
                  سطور الكشف <span className="muted">(المعلَّق: {data.totals.unmatchedStatementCount} · {fmt(data.totals.unmatchedStatement)})</span>
                </h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>البيان</th>
                      <th className="num">المبلغ</th>
                      <th>الحال</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.statement.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          لا سطور كشفٍ يدوية في المدى.
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
                              <span className="badge paid">مطابَق</span>{' '}
                              <button className="btn link" onClick={() => act(() => unmatchStatementLine(bank.id, s.id))}>
                                فكّ
                              </button>
                            </>
                          ) : (
                            <>
                              {suggestionFor(s.id).map((lineId) => (
                                <button key={lineId} className="btn link" title={lineLabel(lineId)} onClick={() => act(() => matchStatementLine(bank.id, s.id, lineId))}>
                                  ✓ طابِق بـ {lineLabel(lineId)}
                                </button>
                              ))}
                              <button className="btn link" onClick={() => setPosting({ transactionId: s.id, counterpartyAccountId: '', memo: s.description, depositId: '' })}>
                                ↳ رحِّل بطرف
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
                  سطور الدفتر <span className="muted">(غير المطابَق: {data.totals.unmatchedLedgerCount} · {fmt(data.totals.unmatchedLedger)})</span>
                </h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>القيد</th>
                      <th>المصدر</th>
                      <th className="num">مدين</th>
                      <th className="num">دائن</th>
                      <th>الحال</th>
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
                        <td>{r.matched ? <span className="badge paid">مطابَق</span> : <span className="badge draft">معلَّق</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {posting && (
              <div className="card" style={{ marginTop: 12 }}>
                <strong>ترحيلُ سطر الكشف بطرفٍ مقابل</strong>
                <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
                  {inTransit.length > 0 && (
                    <div className="field" style={{ margin: 0, minWidth: 260 }}>
                      <label htmlFor="rec-deposit">إيداعُ درجٍ في الطريق</label>
                      <select id="rec-deposit" value={posting.depositId} onChange={(e) => setPosting({ ...posting, depositId: e.target.value, counterpartyAccountId: '' })}>
                        <option value="">— ليس إيداعَ درج —</option>
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
                      <label htmlFor="rec-counterparty">الطرف المقابل</label>
                      <select id="rec-counterparty" value={posting.counterpartyAccountId} onChange={(e) => setPosting({ ...posting, counterpartyAccountId: e.target.value })}>
                        <option value="">— اختر حساباً —</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {posting.depositId ? (
                    <span className="muted">الطرفُ المقابل «نقدٌ في الطريق 1190» والمبلغُ مبلغُ المستند — يفرضهما الخادم.</span>
                  ) : (
                    <div className="field" style={{ margin: 0, minWidth: 260 }}>
                      <label htmlFor="rec-memo">البيان</label>
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
                    {posting.depositId ? 'أكِّد الإيداع وطابِق' : 'رحِّل وطابِق'}
                  </button>
                  <button className="btn secondary" onClick={() => setPosting(null)}>
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            <div className="toolbar" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="rec-close">إقفال التسوية حتى</label>
                <input id="rec-close" type="date" value={closeUntil} onChange={(e) => setCloseUntil(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={!closeUntil} onClick={() => act(() => closeReconciliation(bank.id, closeUntil))}>
                أقفل
              </button>
              {data.bank.reconciledUntil && (
                <button className="btn secondary" onClick={() => act(() => reopenReconciliation(bank.id))}>
                  أعد فتح التسوية
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
