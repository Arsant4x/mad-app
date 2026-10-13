import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCustomerSummary, type Customer, type CustomerSummary } from '../../api/customers';
import type { Invoice } from '../../api/invoices';
import { dfmt, fmt } from '../../lib/format';
import { Money } from '../../components/currency/Money';
import { num0 } from '../../lib/money';
import { STATUS_META } from '../invoices/statusMeta';
import { usePermissions } from '../../auth/PermissionsContext';
import { MarketingConsentPanel } from './MarketingConsentPanel';

/**
 * The customer card. Its three figures come from the server (`GET /customers/:id/summary`):
 * billed net, collected from allocations, and the balance from exposure. They used to be
 * summed here from invoice totals, which miscounted partly paid invoices.
 */
export function CustomerDetailModal({ customer, invoices, onClose }: { customer: Customer; invoices: Invoice[]; onClose: () => void }) {
  const { t } = useTranslation();
  const customerInvoices = invoices.filter((v) => v.customerId === customer.id).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  const { can } = usePermissions();
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  // The summary is a company-wide figure and is refused to a branch-restricted user; say so instead of an endless "…".
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    getCustomerSummary(customer.id)
      .then(setSummary)
      .catch(() => setRefused(true));
  }, [customer.id]);
  const balance = num0(summary?.outstanding);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{customer.name}</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="two-col" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>{t('customers.detail.vat')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {customer.vatNumber || '—'}
            </p>
          </div>
          <div className="field">
            <label>{t('customers.detail.phone')}</label>
            <p className="num" style={{ fontSize: 12.5, padding: '9px 0', margin: 0 }}>
              {customer.phone || '—'}
            </p>
          </div>
        </div>

        {refused ? (
          <p className="hint" style={{ marginBottom: 16 }}>
            {t('customers.detail.refused')}
          </p>
        ) : (
          <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            <div className="kpi-card neu">
              <div className="kpi-label">{t('customers.detail.billed')}</div>
              <div className="kpi-value num">{summary ? <Money value={fmt(summary.billed)} /> : '…'}</div>
              <div className="kpi-delta">{t('customers.detail.invoice_count', { n: customerInvoices.length })}</div>
            </div>
            <div className="kpi-card pos">
              <div className="kpi-label">{t('customers.detail.collected')}</div>
              <div className="kpi-value num">{summary ? <Money value={fmt(summary.collected)} /> : '…'}</div>
            </div>
            <div className={`kpi-card ${balance > 0 ? 'neg' : 'pos'}`}>
              <div className="kpi-label">{t('customers.detail.outstanding')}</div>
              <div className="kpi-value num">{summary ? <Money value={fmt(summary.outstanding)} /> : '…'}</div>
            </div>
          </div>
        )}

        {/* Marketing consent sits on the customer card, where the merchant looks at the customer. */}
        <MarketingConsentPanel customerId={customer.id} canRecord={can('customers', 'record')} />

        <div className="card-title" style={{ marginBottom: 10 }}>
          {t('customers.detail.history', { n: customerInvoices.length })}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('customers.detail.col_no')}</th>
              <th>{t('customers.detail.col_date')}</th>
              <th>{t('customers.detail.col_status')}</th>
              <th>{t('customers.detail.col_amount')}</th>
            </tr>
          </thead>
          <tbody>
            {customerInvoices.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">{t('customers.detail.empty')}</div>
                </td>
              </tr>
            )}
            {customerInvoices.map((v) => (
              <tr key={v.id}>
                <td className="num">
                  {v.no}
                  {/* Without this, a credit note reads as just another
                      invoice and the totals above look like they don't add up. */}
                  {v.docType !== 'INVOICE' && (
                    <span className={`badge ${v.docType === 'CREDIT_NOTE' ? 'overdue' : 'due'}`} style={{ marginInlineStart: 6 }}>
                      {v.docType === 'CREDIT_NOTE' ? t('customers.detail.credit_note') : t('customers.detail.debit_note')}
                    </span>
                  )}
                </td>
                <td className="num">{dfmt(v.issueDate)}</td>
                <td>
                  {v.docType === 'CREDIT_NOTE' ? (
                    <span className="badge">—</span>
                  ) : (
                    <span className={`badge ${badgeOf(STATUS_META, v.status).badgeClass}`}>{badgeOf(STATUS_META, v.status).label}</span>
                  )}
                </td>
                <td className="num">
                  {v.docType === 'CREDIT_NOTE' ? '−' : ''}
                  {fmt(v.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('customers.detail.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
