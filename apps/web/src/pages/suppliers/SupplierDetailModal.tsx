import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Purchase } from '../../api/purchases';
import { getSupplierSummary, type Supplier, type SupplierSummary } from '../../api/suppliers';
import { dfmt, fmt } from '../../lib/format';
import { num0 } from '../../lib/money';
import { purchaseStatus } from './purchaseStatus';

export function SupplierDetailModal({ supplier, purchases, onClose }: { supplier: Supplier; purchases: Purchase[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const allForSupplier = useMemo(() => purchases.filter((p) => p.supplierId === supplier.id), [purchases, supplier.id]);
  const filtered = useMemo(
    () =>
      allForSupplier
        .filter((p) => (!from || p.date.slice(0, 10) >= from) && (!to || p.date.slice(0, 10) <= to))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [allForSupplier, from, to],
  );

  // All three totals come from the server for the same period: billed as signed,
  // paid from allocations, and due as each document's remainder after the supplier's
  // credit notes. Subtracting paid from billed on screen ignored those notes.
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  // The summary covers the whole company, so it is refused to a branch-restricted
  // user; say so instead of an endless "…".
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    getSupplierSummary(supplier.id, { from: from || undefined, to: to || undefined })
      .then(setSummary)
      .catch(() => setRefused(true));
  }, [supplier.id, from, to]);
  const totalDue = num0(summary?.due);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{supplier.name}</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>{t('suppliers.detail.vat_number')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {supplier.vatNumber || '—'}
            </p>
          </div>
          <div className="field">
            <label>{t('suppliers.detail.mobile')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {supplier.phone || '—'}
            </p>
          </div>
        </div>

        <div className="two-col" style={{ marginBottom: 10 }}>
          <div className="field">
            <label>{t('suppliers.detail.from_date')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('suppliers.detail.to_date')}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {(from || to) && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 10 }}
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            {t('suppliers.detail.show_all')}
          </button>
        )}

        {refused ? (
          <p className="hint" style={{ marginBottom: 16 }}>
            {t('suppliers.detail.refused')}
          </p>
        ) : (
          <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            <div className="kpi-card neu">
              <div className="kpi-label">{t('suppliers.detail.kpi_billed')}</div>
              <div className="kpi-value num">{summary ? t('suppliers.amount_sar', { amount: fmt(summary.billed) }) : '…'}</div>
              <div className="kpi-delta">
                {t('suppliers.detail.shown_of', { shown: filtered.length, total: allForSupplier.length })}
              </div>
            </div>
            <div className="kpi-card pos">
              <div className="kpi-label">{t('suppliers.detail.kpi_paid')}</div>
              <div className="kpi-value num">{summary ? t('suppliers.amount_sar', { amount: fmt(summary.paid) }) : '…'}</div>
            </div>
            <div className={`kpi-card ${totalDue > 0 ? 'neg' : 'pos'}`}>
              <div className="kpi-label">{t('suppliers.detail.kpi_due')}</div>
              <div className="kpi-value num">{summary ? t('suppliers.amount_sar', { amount: fmt(summary.due) }) : '…'}</div>
            </div>
          </div>
        )}

        <div className="card-title" style={{ marginBottom: 10 }}>
          {t('suppliers.detail.history', { n: filtered.length })}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('suppliers.detail.col_no')}</th>
              <th>{t('suppliers.detail.col_date')}</th>
              <th>{t('suppliers.detail.col_category')}</th>
              <th>{t('suppliers.detail.col_status')}</th>
              <th>{t('suppliers.detail.col_amount')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">{t('suppliers.detail.empty')}</div>
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const status = purchaseStatus(p);
              return (
                <tr key={p.id}>
                  <td className="num">{p.no}</td>
                  <td className="num">{dfmt(p.date)}</td>
                  <td>{p.category || '—'}</td>
                  <td>
                    <span className={`badge ${status.badgeClass}`}>{status.label}</span>
                  </td>
                  <td className="num">{fmt(p.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('suppliers.common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
