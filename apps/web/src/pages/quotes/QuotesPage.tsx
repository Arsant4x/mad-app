import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { convertQuote, deleteQuote, listQuotes, type DerivedQuoteStatus, type Quote } from '../../api/quotes';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { QuoteModal } from './QuoteModal';

/** Labels are translation keys, turned into text at render. */
const STATUS_META: Record<DerivedQuoteStatus, { label: string; badgeClass: string }> = {
  DRAFT: { label: 'quotes.status.draft', badgeClass: 'draft' },
  SENT: { label: 'quotes.status.sent', badgeClass: 'due' },
  CONVERTED: { label: 'quotes.status.converted', badgeClass: 'paid' },
  EXPIRED: { label: 'quotes.status.expired', badgeClass: 'overdue' },
};

/**
 * Quotes: a negotiation document that becomes an invoice in one click, without
 * re-entry. The convert button is disabled with a visible reason for expired
 * and converted quotes, and server messages are shown as text.
 */
export function QuotesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canAdd = can('quotes', 'add');
  const canEdit = can('quotes', 'edit');
  const canDelete = can('quotes', 'delete');
  // Converting issues an invoice, so it follows add on the invoices screen.
  const canConvert = can('invoice', 'add');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; quote: Quote } | null>(null);
  const [converting, setConverting] = useState<Quote | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setQuotes(await listQuotes());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((x) => x.no.toLowerCase().includes(q) || x.customer.name.toLowerCase().includes(q));
  }, [quotes, search]);

  /** Why this quote cannot be converted now; null means it can. */
  function convertBlockReason(q: Quote): string | null {
    if (q.derivedStatus === 'CONVERTED') return t('quotes.page.converted_to', { no: q.convertedInvoice?.no ?? t('quotes.page.invoice_fallback') });
    if (q.derivedStatus === 'EXPIRED') return t('quotes.page.expired_on', { date: q.validUntil.slice(0, 10) });
    return null;
  }

  async function confirmConvert() {
    if (!converting) return;
    setBusy(true);
    setError(null);
    try {
      const { invoice } = await convertQuote(converting.id);
      setConverting(null);
      // On success, go straight to the invoices screen on the new invoice.
      navigate(`/invoices?highlight=${invoice.id}`);
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('quotes.page.convert_failed'));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError(null);
    try {
      await deleteQuote(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('quotes.page.delete_failed'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('quotes.page.title')}</div>
          <div className="page-sub">{t('quotes.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              {t('quotes.page.new')}
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('quotes.page.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>{t('quotes.page.col_no')}</th>
              <th>{t('quotes.page.col_customer')}</th>
              <th>{t('quotes.page.col_issue')}</th>
              <th>{t('quotes.page.col_valid_until')}</th>
              <th>{t('quotes.page.col_total')}</th>
              <th>{t('quotes.page.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('quotes.page.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((q) => {
              const meta = badgeOf(STATUS_META, q.derivedStatus);
              const blockReason = convertBlockReason(q);
              return (
                <tr key={q.id}>
                  <td className="num">{q.no}</td>
                  <td>{q.customer.name}</td>
                  <td className="num">{dfmt(q.issueDate)}</td>
                  <td className="num">{dfmt(q.validUntil)}</td>
                  <td className="num">{fmt(Number(q.total))}</td>
                  <td>
                    <span className={`badge ${meta.badgeClass}`}>{t(meta.label)}</span>
                    {q.derivedStatus === 'CONVERTED' && q.convertedInvoice && <div className="hint num">{q.convertedInvoice.no}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {blockReason ? (
                      <button className="btn btn-ghost btn-sm" disabled title={blockReason}>
                        {blockReason}
                      </button>
                    ) : (
                      canConvert && (
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConverting(q)}>
                          {t('quotes.page.convert')}
                        </button>
                      )
                    )}
                    <RowMenu
                      actions={[
                        canEdit && (q.derivedStatus === 'DRAFT' || q.derivedStatus === 'SENT') && { label: t('quotes.page.edit'), onClick: () => setModal({ mode: 'edit', quote: q }) },
                        canDelete && { label: t('quotes.page.delete'), onClick: () => setPendingDelete(q), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <QuoteModal
          editing={modal.mode === 'edit' ? modal.quote : null}
          onCancel={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await reload();
          }}
        />
      )}

      {converting && (
        <ConfirmModal
          title={t('quotes.page.convert_title')}
          body={t('quotes.page.convert_body', { customer: converting.customer.name, total: fmt(Number(converting.total)) })}
          confirmLabel={t('quotes.page.convert_confirm')}
          onCancel={() => setConverting(null)}
          onConfirm={confirmConvert}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('quotes.page.delete_title')}
          body={error ?? t('quotes.page.delete_body', { no: pendingDelete.no })}
          confirmLabel={t('quotes.page.delete_confirm')}
          onCancel={() => {
            setPendingDelete(null);
            setError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
