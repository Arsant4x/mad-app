import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createCashDeposit, listCashDeposits, voidCashDeposit, type Bank, type CashDeposit, type CashDepositList } from '../../api/banks';
import { listCashDrawers, type CashDrawer } from '../../api/cashDrawers';
import { fmt, today } from '../../lib/format';
import i18n from '../../i18n';

/**
 * Drawer deposits to banks through "cash in transit" 1190: a deposit leaves the drawer for transit, is confirmed
 * by a bank statement line from the reconciliation panel, and can be voided (reversed) only before confirmation.
 * The screen reads and does not compute: the transit balance, document total and their match come from the
 * server, and the server rejects an amount above the drawer balance with its own message.
 */
const STATUS_LABEL: Record<CashDeposit['status'], { key: string; cls: string }> = {
  IN_TRANSIT: { key: 'banks.deposits.status.in_transit', cls: 'badge draft' },
  CONFIRMED: { key: 'banks.deposits.status.confirmed', cls: 'badge paid' },
  VOID: { key: 'banks.deposits.status.void', cls: 'badge' },
};

export function CashDepositsPanel({ banks, onClose }: { banks: Bank[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<CashDepositList | null>(null);
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ drawerId: string; bankId: string; amount: string; date: string; memo: string }>({
    drawerId: '',
    bankId: banks[0]?.id ?? '',
    amount: '',
    date: today(),
    memo: '',
  });

  const fail = (e: unknown, fallback: string) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback);

  async function load() {
    setError(null);
    try {
      setData(await listCashDeposits());
    } catch (e) {
      fail(e, i18n.t('banks.deposits.err_load'));
    }
  }
  useEffect(() => {
    listCashDrawers().then(setDrawers).catch(() => {});
    load();
  }, []);

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      const created = await createCashDeposit({
        drawerId: form.drawerId,
        bankId: form.bankId,
        amount: Number(form.amount),
        date: form.date,
        memo: form.memo.trim() || undefined,
      });
      setNotice(i18n.t('banks.deposits.created', { no: created.no, entry: created.entryNo }));
      setForm({ ...form, amount: '', memo: '' });
      await load();
    } catch (e) {
      fail(e, i18n.t('banks.deposits.err_create'));
    }
  }

  async function voidOne(d: CashDeposit) {
    setError(null);
    setNotice(null);
    try {
      const voided = await voidCashDeposit(d.id);
      setNotice(i18n.t('banks.deposits.voided', { no: d.no, entry: voided.voidEntryNo }));
      await load();
    } catch (e) {
      fail(e, i18n.t('banks.deposits.err_void'));
    }
  }

  const canSubmit = form.drawerId && form.bankId && Number(form.amount) > 0 && form.date;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>{t('banks.deposits.title')}</h3>
          <button className="btn secondary" onClick={onClose}>
            {t('banks.close')}
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          {t('banks.deposits.intro')}
        </div>

        {error && <div className="error-text">{error}</div>}
        {notice && <div className="muted" data-testid="deposit-notice">{notice}</div>}

        <div className="card">
          <strong>{t('banks.deposits.new')}</strong>
          <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label htmlFor="dep-drawer">{t('banks.deposits.drawer')}</label>
              <select id="dep-drawer" value={form.drawerId} onChange={(e) => setForm({ ...form, drawerId: e.target.value })}>
                <option value="">{t('banks.deposits.choose_drawer')}</option>
                {drawers
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {fmt(d.account.balance)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label htmlFor="dep-bank">{t('banks.bank')}</label>
              <select id="dep-bank" value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>
                <option value="">{t('banks.choose_bank')}</option>
                {banks
                  .filter((b) => !b.archived)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 140 }}>
              <label htmlFor="dep-amount">{t('banks.deposits.amount')}</label>
              <input id="dep-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="dep-date">{t('banks.deposits.date')}</label>
              <input id="dep-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 240 }}>
              <label htmlFor="dep-memo">{t('banks.memo')}</label>
              <input id="dep-memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
              {t('banks.deposits.submit')}
            </button>
          </div>
        </div>

        {data && (
          <>
            <div className="toolbar" style={{ gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              <span data-testid="in-transit-ledger">
                {t('banks.deposits.ledger')} <strong>{fmt(data.inTransit.ledger)}</strong>
              </span>
              <span>
                {t('banks.deposits.documents')} <strong>{fmt(data.inTransit.documents)}</strong>
              </span>
              {data.inTransit.matched ? (
                <span className="badge paid">{t('banks.deposits.matched')}</span>
              ) : (
                <span className="badge draft" data-testid="in-transit-gap">
                  {t('banks.deposits.gap')}
                </span>
              )}
            </div>

            <div className="card" style={{ padding: 0, marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('banks.col_no')}</th>
                    <th>{t('banks.deposits.date')}</th>
                    <th>{t('banks.deposits.drawer')}</th>
                    <th>{t('banks.bank')}</th>
                    <th>{t('banks.deposits.amount')}</th>
                    <th>{t('banks.col_status')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">{t('banks.deposits.empty')}</div>
                      </td>
                    </tr>
                  )}
                  {data.items.map((d) => (
                    <tr key={d.id} data-testid="deposit-row">
                      <td className="num">{d.no}</td>
                      <td className="num">{d.date}</td>
                      <td>{d.drawer.name}</td>
                      <td>{d.bank.name}</td>
                      <td className="num">{fmt(d.amount)}</td>
                      <td>
                        <span className={STATUS_LABEL[d.status].cls}>{t(STATUS_LABEL[d.status].key)}</span>
                      </td>
                      <td>
                        {d.status === 'IN_TRANSIT' && (
                          <button className="btn link" onClick={() => voidOne(d)}>
                            {t('banks.void_reverse')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
