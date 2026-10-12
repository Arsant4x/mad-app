import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listPayments, reversePayment, type Payment } from '../../api/payments';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt, fmt } from '../../lib/format';
import { num0 } from '../../lib/money';
import i18n from '../../i18n';
import { PaymentModal } from './PaymentModal';

/**
 * Receipt vouchers.
 *
 * No edit or delete here on purpose: a posted voucher is corrected only by a reversing voucher, the same
 * rule that guards journal entries and invoices.
 */
export function PaymentsPage() {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setPayments(await listPayments());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => p.no.toLowerCase().includes(q) || p.customer.name.toLowerCase().includes(q) || (p.reference ?? '').toLowerCase().includes(q));
  }, [payments, search]);


  async function confirmReverse() {
    if (!reversing) return;
    setError(null);
    try {
      // The reason is stored as the reversal's note, in the language the user works in.
      await reversePayment(reversing.id, i18n.t('payments.page.reverse_reason', { no: reversing.no }));
      setReversing(null);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? i18n.t('payments.page.err_reverse'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('payments.page.title')}</div>
          <div className="page-sub">{t('payments.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            {t('payments.page.add')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('payments.page.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('payments.page.col_no')}</th>
              <th>{t('payments.page.col_date')}</th>
              <th>{t('payments.page.col_customer')}</th>
              <th>{t('payments.page.col_amount')}</th>
              <th>{t('payments.page.col_allocated')}</th>
              <th>{t('payments.page.col_invoices')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('payments.page.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const isReversal = !!p.reversesId;
              // Allocated and unallocated amounts come from the server; unallocated is read as a number only to decide whether to show it.
              const onAccount = num0(p.unallocated);
              return (
                <tr key={p.id}>
                  <td className="num">
                    {p.no}
                    {isReversal && <span className="badge overdue" style={{ marginInlineStart: 6 }}>{t('payments.page.reversal')}</span>}
                  </td>
                  <td className="num">{dfmt(p.date)}</td>
                  <td>{p.customer.name}</td>
                  <td className="num">{fmt(Number(p.amount))}</td>
                  <td className="num">
                    {fmt(p.allocatedTotal)}
                    {Math.abs(onAccount) > 0.005 && <div className="hint">{t('payments.page.on_account', { amount: fmt(p.unallocated) })}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.allocations.map((a) => (
                      <div key={a.id} className="num">
                        {a.invoice.no} — {fmt(Number(a.amount))}
                      </div>
                    ))}
                    {p.allocations.length === 0 && <span className="hint">{t('payments.page.unallocated')}</span>}
                    {/* A voucher that issued an advance payment invoice; it cannot be reversed (the server rejects it). */}
                    {p.prepaymentInvoice && (
                      <div className="hint num" data-testid="prepayment-invoice">
                        {t('payments.page.prepayment', { no: p.prepaymentInvoice.no, total: fmt(p.prepaymentInvoice.total) })}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!isReversal && !p.prepaymentInvoice && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setReversing(p)}>
                        {t('payments.page.reverse')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <PaymentModal
          onCancel={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reload();
          }}
        />
      )}

      {reversing && (
        <ConfirmModal
          title={t('payments.page.reverse_title')}
          body={t('payments.page.reverse_body', { no: reversing.no, amount: fmt(Number(reversing.amount)) })}
          confirmLabel={t('payments.page.reverse_confirm')}
          onCancel={() => setReversing(null)}
          onConfirm={confirmReverse}
        />
      )}
    </div>
  );
}
