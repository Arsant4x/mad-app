import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createNetworkSettlement,
  getOpenNetworkReceipts,
  listNetworkSettlements,
  voidNetworkSettlement,
  type Bank,
  type NetworkSettlement,
  type NetworkSettlementList,
  type OpenNetworkReceipts,
} from '../../api/banks';
import { usePermissions } from '../../auth/PermissionsContext';
import { fmt, today } from '../../lib/format';
import { round2 } from '../../lib/money';
import i18n from '../../i18n';

/**
 * Card network settlement on 1251: card receipts in a date range are claimed by one settlement; the gross comes
 * from the ledger, the fee and its VAT from the acquirer's advice, and the net enters the bank. The screen reads
 * and does not compute: gross, open receipts and the ledger match come from the server; the net shown before
 * submitting is only a hint the server recomputes.
 */
const STATUS_LABEL: Record<NetworkSettlement['status'], { key: string; cls: string }> = {
  POSTED: { key: 'banks.settlements.status.posted', cls: 'badge paid' },
  VOID: { key: 'banks.settlements.status.void', cls: 'badge' },
};

export function NetworkSettlementsPanel({ banks, onClose }: { banks: Bank[]; onClose: () => void }) {
  const { t } = useTranslation();
  // A settlement and its void both need record on banks; without it the panel only reads.
  const canRecord = usePermissions().can('banks', 'record');
  const [data, setData] = useState<NetworkSettlementList | null>(null);
  const [open, setOpen] = useState<OpenNetworkReceipts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ bankId: banks[0]?.id ?? '', date: today(), periodFrom: '', periodTo: '', fee: '', feeVat: '', memo: '' });

  const fail = (e: unknown, fallback: string) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback);

  async function load() {
    setError(null);
    try {
      setData(await listNetworkSettlements());
    } catch (e) {
      fail(e, i18n.t('banks.settlements.err_load'));
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!form.periodFrom || !form.periodTo) {
      setOpen(null);
      return;
    }
    getOpenNetworkReceipts({ from: form.periodFrom, to: form.periodTo })
      .then(setOpen)
      .catch((e) => fail(e, i18n.t('banks.settlements.err_open')));
  }, [form.periodFrom, form.periodTo]);

  const fee = Number(form.fee || 0);
  const feeVat = Number(form.feeVat || 0);
  const gross = open ? Number(open.gross) : 0;
  const netHint = open ? round2(gross - fee - feeVat) : null;
  const canSubmit = form.bankId && form.date && form.periodFrom && form.periodTo && open && open.receipts.length > 0 && fee >= 0 && feeVat >= 0;

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      const created = await createNetworkSettlement({
        bankId: form.bankId,
        date: form.date,
        periodFrom: form.periodFrom,
        periodTo: form.periodTo,
        feeAmount: fee,
        feeVatAmount: feeVat,
        memo: form.memo.trim() || undefined,
      });
      setNotice(i18n.t('banks.settlements.posted', { no: created.no, entry: created.entryNo, gross: fmt(created.grossAmount), net: fmt(created.netAmount) }));
      setForm({ ...form, fee: '', feeVat: '', memo: '' });
      setOpen(null);
      await load();
    } catch (e) {
      fail(e, i18n.t('banks.settlements.err_post'));
    }
  }

  async function voidOne(s: NetworkSettlement) {
    setError(null);
    setNotice(null);
    try {
      const voided = await voidNetworkSettlement(s.id);
      setNotice(i18n.t('banks.settlements.voided', { no: s.no, entry: voided.voidEntryNo }));
      await load();
    } catch (e) {
      fail(e, i18n.t('banks.settlements.err_void'));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>{t('banks.settlements.title')}</h3>
          <button className="btn secondary" onClick={onClose}>
            {t('banks.close')}
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          {t('banks.settlements.intro')}
        </div>

        {error && <div className="error-text">{error}</div>}
        {notice && <div className="muted" data-testid="settlement-notice">{notice}</div>}

        {data && (
          <div className="toolbar" style={{ gap: 16, flexWrap: 'wrap' }}>
            <span data-testid="network-ledger">
              {t('banks.settlements.ledger')} <strong>{fmt(data.summary.ledger)}</strong>
            </span>
            <span>
              {t('banks.settlements.open_receipts')} <strong>{data.summary.openCount}</strong> {t('banks.settlements.open_sum')} <strong>{fmt(data.summary.open)}</strong>
            </span>
            {data.summary.matched ? (
              <span className="badge paid">{t('banks.settlements.matched')}</span>
            ) : (
              <span className="badge draft" data-testid="network-gap">
                {t('banks.settlements.gap')}
              </span>
            )}
          </div>
        )}

        {canRecord && (
        <div className="card">
          <strong>{t('banks.settlements.new')}</strong>
          <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label htmlFor="ns-bank">{t('banks.bank')}</label>
              <select id="ns-bank" value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>
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
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ns-date">{t('banks.settlements.transfer_date')}</label>
              <input id="ns-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ns-from">{t('banks.settlements.from')}</label>
              <input id="ns-from" type="date" value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ns-to">{t('banks.settlements.to')}</label>
              <input id="ns-to" type="date" value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 130 }}>
              <label htmlFor="ns-fee">{t('banks.settlements.fee')}</label>
              <input id="ns-fee" type="number" min="0" step="0.01" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 130 }}>
              <label htmlFor="ns-fee-vat">{t('banks.settlements.fee_vat')}</label>
              <input id="ns-fee-vat" type="number" min="0" step="0.01" value={form.feeVat} onChange={(e) => setForm({ ...form, feeVat: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 220 }}>
              <label htmlFor="ns-memo">{t('banks.memo')}</label>
              <input id="ns-memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
              {t('banks.settlements.submit')}
            </button>
          </div>
          {open && (
            <div className="muted" data-testid="open-hint" style={{ marginTop: 8 }}>
              {t('banks.settlements.in_range')} <strong>{open.receipts.length}</strong> {t('banks.settlements.receipts_gross')} <strong>{fmt(open.gross)}</strong>
              {netHint !== null && (
                <>
                  {' '}{t('banks.settlements.net_hint')} <strong>{fmt(String(netHint))}</strong>
                </>
              )}
              {open.receipts.length === 0 && t('banks.settlements.none_in_range')}
            </div>
          )}
        </div>
        )}

        {data && (
          <div className="card" style={{ padding: 0, marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('banks.col_no')}</th>
                  <th>{t('banks.settlements.col_transfer')}</th>
                  <th>{t('banks.settlements.col_range')}</th>
                  <th>{t('banks.bank')}</th>
                  <th>{t('banks.settlements.col_gross')}</th>
                  <th>{t('banks.settlements.col_fee')}</th>
                  <th>{t('banks.settlements.col_net')}</th>
                  <th>{t('banks.settlements.col_receipts')}</th>
                  <th>{t('banks.col_status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">{t('banks.settlements.empty')}</div>
                    </td>
                  </tr>
                )}
                {data.items.map((s) => (
                  <tr key={s.id} data-testid="settlement-row">
                    <td className="num">{s.no}</td>
                    <td className="num">{s.date}</td>
                    <td className="num">
                      {s.periodFrom} → {s.periodTo}
                    </td>
                    <td>{s.bank.name}</td>
                    <td className="num">{fmt(s.grossAmount)}</td>
                    <td className="num">
                      {fmt(s.feeAmount)} + {fmt(s.feeVatAmount)}
                    </td>
                    <td className="num">{fmt(s.netAmount)}</td>
                    <td className="num">{s.receiptCount}</td>
                    <td>
                      <span className={STATUS_LABEL[s.status].cls}>{t(STATUS_LABEL[s.status].key)}</span>
                    </td>
                    <td>
                      {canRecord && s.status === 'POSTED' && (
                        <button className="btn link" onClick={() => voidOne(s)}>
                          {t('banks.void_reverse')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
