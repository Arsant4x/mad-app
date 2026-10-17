import { AssignTaskButton } from '../../components/AssignTaskButton';
import { badgeOf } from '../../lib/statusBadge';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZatcaQr } from '../../components/ZatcaQr';
import type { Invoice, InvoiceStatus } from '../../api/invoices';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { STATUS_META, ZATCA_STATUS_META } from './statusMeta';

type SortKey = 'issueDate' | 'no' | 'total' | 'customer';
const SORT_OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: 'issueDate', labelKey: 'invoices.list.sort.issue_date' },
  { key: 'no', labelKey: 'invoices.list.sort.no' },
  { key: 'total', labelKey: 'invoices.list.sort.total' },
  { key: 'customer', labelKey: 'invoices.list.sort.customer' },
];

function sortValue(inv: Invoice, key: SortKey): string | number {
  if (key === 'total') return Number(inv.total);
  if (key === 'customer') return inv.customer.name;
  return inv[key];
}

export function InvoiceListView({
  invoices,
  onNew,
  onSubmitToZatca,
  onIssueCreditNote,
  onIssueDebitNote,
  onIssueReplacement,
  onDownloadClearedXml,
  canSubmitToZatca,
  canIssue,
  submittingId,
}: {
  invoices: Invoice[];
  onNew: () => void;
  onSubmitToZatca: (invoice: Invoice) => void;
  onIssueCreditNote: (invoice: Invoice) => void;
  onIssueDebitNote: (invoice: Invoice) => void;
  /** A replacement for a rejected invoice; offered while no replacement has been issued. */
  onIssueReplacement: (invoice: Invoice) => void;
  /** Delivery of a standard invoice as the XML cleared by the authority; offered only where that copy was saved. */
  onDownloadClearedXml: (invoice: Invoice) => void;
  canSubmitToZatca: boolean;
  /** A new invoice, a note and a replacement are each a new document, refused without add on invoices. */
  canIssue: boolean;
  /** The invoice currently being sent, so its row can say so — submission is a
   * network round-trip to the authority, not an instant local change. */
  submittingId: string | null;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = invoices.filter((inv) => {
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      const matchesQuery =
        !q ||
        inv.customer.name.toLowerCase().includes(q) ||
        inv.no.toLowerCase().includes(q) ||
        (inv.customer.vatNumber ?? '').includes(q) ||
        inv.lines.some((l) => l.description.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [invoices, search, statusFilter, sortKey, sortDir]);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('invoices.list.title')}</div>
          <div className="page-sub">{t('invoices.list.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          {canIssue && (
            <button className="btn btn-primary" onClick={onNew}>
              {t('invoices.list.new')}
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('invoices.list.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select className="sort-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {t('invoices.list.sort_by', { label: t(o.labelKey) })}
              </option>
            ))}
          </select>
          <button className="menu-btn" title={t('invoices.list.reverse_sort')} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? '⬆' : '⬇'}
          </button>
        </div>
        <div className="chip-group">
          <button className={statusFilter === 'all' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('all')}>
            {t('invoices.list.filter_all')}
          </button>
          <button className={statusFilter === 'PAID' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('PAID')}>
            {t('invoices.status.paid')}
          </button>
          <button className={statusFilter === 'DUE' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('DUE')}>
            {t('invoices.status.due')}
          </button>
          <button className={statusFilter === 'OVERDUE' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('OVERDUE')}>
            {t('invoices.status.overdue')}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('invoices.list.col.customer')}</th>
              <th>{t('invoices.list.col.no')}</th>
              <th>{t('invoices.list.col.issue_date')}</th>
              <th>{t('invoices.list.col.due')}</th>
              <th>{t('invoices.list.col.status')}</th>
              <th>{t('invoices.list.col.amount')}</th>
              <th>{t('invoices.list.col.zatca')}</th>
              <th>{t('invoices.list.col.clearance')}</th>
              <th>{t('invoices.list.col.task')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <div className="empty-state">{t('invoices.list.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.customer.name}</td>
                <td className="num">
                  {inv.no}
                  {/* A note looks exactly like an invoice otherwise — the
                      badge and the original's number are what tell the reader
                      this row adjusts rather than bills afresh. Red for a
                      credit (reduces), amber for a debit (adds). */}
                  {inv.docType !== 'INVOICE' && (
                    <>
                      <span className={`badge ${inv.docType === 'CREDIT_NOTE' ? 'overdue' : inv.docType === 'PREPAYMENT' ? 'paid' : 'due'}`} style={{ marginInlineStart: 6 }}>
                        {inv.docType === 'CREDIT_NOTE' ? t('invoices.list.doc_credit_note') : inv.docType === 'PREPAYMENT' ? t('invoices.list.doc_prepayment') : t('invoices.list.doc_debit_note')}
                      </span>
                      {inv.relatedInvoice && <div className="hint">{t('invoices.list.on_invoice', { no: inv.relatedInvoice.no })}</div>}
                    </>
                  )}
                  {/* A replacement names the rejected invoice and the rejected one names its
                      replacement, so the sale is not read twice. */}
                  {inv.replacesInvoice && <div className="hint">{t('invoices.list.replaces', { no: inv.replacesInvoice.no })}</div>}
                  {inv.replacedBy && <div className="hint">{t('invoices.list.replaced_by', { no: inv.replacedBy.no })}</div>}
                </td>
                <td className="num">{dfmt(inv.issueDate)}</td>
                <td className="num">{dfmt(inv.dueDate)}</td>
                <td>
                  {/* The status is derived from receipts and never written by hand; payment is
                      recorded in the receipts screen. A credit note has no payment cycle. */}
                  {inv.docType !== 'CREDIT_NOTE' ? (
                    <span title={t('invoices.list.status_hint')}>
                      <span className={`badge ${badgeOf(STATUS_META, inv.status).badgeClass}`}>{badgeOf(STATUS_META, inv.status).label}</span>
                    </span>
                  ) : (
                    <span className="badge">—</span>
                  )}
                </td>
                <td className="num">{fmt(inv.total)}</td>
                <td>
                  {/* The server returns null until the company profile carries a
                      legal name and VAT number — showing a placeholder QR would
                      look compliant while failing inspection. */}
                  {inv.zatcaQr ? <ZatcaQr payload={inv.zatcaQr} size={64} /> : <span className="badge">{t('invoices.list.qr_incomplete')}</span>}
                </td>
                <td>
                  {/* The document type is decided by the server from the buyer's kind; shown, not chosen. */}
                  {inv.invoiceType && (
                    <span className="badge" data-testid="invoice-type" style={{ marginInlineEnd: 6 }}>
                      {inv.invoiceType === 'standard' ? t('invoices.list.type_standard') : t('invoices.list.type_simplified')}
                    </span>
                  )}
                  <span className={`badge ${badgeOf(ZATCA_STATUS_META, inv.zatcaStatus).badgeClass}`} title={inv.zatcaMessage ?? undefined}>
                    {badgeOf(ZATCA_STATUS_META, inv.zatcaStatus).label}
                  </span>
                  {/* The authority's reason is the only way to act on a
                      rejection, so it is shown rather than hidden behind the
                      badge alone. */}
                  {inv.zatcaStatus === 'REJECTED' && inv.zatcaMessage && <div className="hint zatca-reason">{inv.zatcaMessage}</div>}
                  {/* A failed attempt is not an answer: the document stays as is and is retried
                      automatically, and the last reason is shown. */}
                  {inv.zatcaStatus !== 'REJECTED' && inv.zatcaStatus !== 'CLEARED' && inv.zatcaMessage && (
                    <div className="hint">{t('invoices.list.last_attempt', { message: inv.zatcaMessage })}</div>
                  )}
                  {inv.zatcaIcv !== null && <div className="hint">{t('invoices.list.icv', { icv: inv.zatcaIcv })}</div>}
                  {/* A cleared standard invoice with no saved cleared copy is stated, not hidden:
                      there is no file to deliver. The state comes from the server. */}
                  {inv.clearedCopy === 'missing' && (
                    <div className="hint" data-testid="cleared-copy-missing">
                      {t('invoices.list.cleared_copy_missing')}
                    </div>
                  )}
                </td>
                {/* Assigning a task from inside the document, as in contracts and
                  * maintenance requests. Kept outside `RowMenu` on purpose: it is a
                  * frequent action on pending invoices. */}
                <td onClick={(e) => e.stopPropagation()}>
                  <AssignTaskButton screen="invoice" entityId={inv.id} />
                </td>
                <td>
                  <RowMenu
                    actions={[
                      // An issued document is never edited or deleted; the remedy is a note.
                      // A note is corrected by the opposite note. A rejected invoice is closed
                      // and untouched: its only remedy is a new replacement, and one that
                      // already has a replacement offers no action.
                      ...(!canIssue
                        ? []
                        : inv.zatcaStatus === 'REJECTED'
                        ? inv.docType === 'INVOICE' && !inv.replacedBy
                          ? [{ label: t('invoices.list.action.replacement'), onClick: () => onIssueReplacement(inv) }]
                          : []
                        : inv.docType === 'INVOICE'
                          ? [
                              { label: t('invoices.list.action.credit_note'), onClick: () => onIssueCreditNote(inv) },
                              { label: t('invoices.list.action.debit_note'), onClick: () => onIssueDebitNote(inv) },
                            ]
                          : inv.docType === 'CREDIT_NOTE'
                            ? [{ label: t('invoices.list.action.debit_note_fix'), onClick: () => onIssueDebitNote(inv) }]
                            : // A prepayment document takes no note yet (the server refuses it), so no button is offered.
                              inv.docType === 'PREPAYMENT'
                              ? []
                              : [{ label: t('invoices.list.action.credit_note_fix'), onClick: () => onIssueCreditNote(inv) }]),
                      // Delivery of a standard invoice to the buyer, only where its cleared copy was saved.
                      ...(inv.clearedCopy === 'available' ? ['-' as const, { label: t('invoices.list.action.download_cleared'), onClick: () => onDownloadClearedXml(inv) }] : []),
                      // Submission is the owner's act — an employee sub-account
                      // is refused by the server, so the action isn't offered.
                      ...(canSubmitToZatca && inv.zatcaStatus !== 'CLEARED' && inv.zatcaStatus !== 'REJECTED'
                        ? [
                            '-' as const,
                            {
                              label: submittingId === inv.id ? t('invoices.list.action.submitting') : t('invoices.list.action.submit'),
                              onClick: () => onSubmitToZatca(inv),
                            },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
