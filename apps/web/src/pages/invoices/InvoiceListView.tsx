import { useMemo, useState } from 'react';
import { ZatcaQr } from '../../components/ZatcaQr';
import type { Invoice, InvoiceStatus } from '../../api/invoices';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { InvoiceStatusModal } from './InvoiceStatusModal';
import { STATUS_META, ZATCA_STATUS_META } from './statusMeta';

type SortKey = 'issueDate' | 'no' | 'total' | 'customer';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'issueDate', label: 'التاريخ' },
  { key: 'no', label: 'الرقم' },
  { key: 'total', label: 'المبلغ' },
  { key: 'customer', label: 'العميل' },
];

function sortValue(inv: Invoice, key: SortKey): string | number {
  if (key === 'total') return Number(inv.total);
  if (key === 'customer') return inv.customer.name;
  return inv[key];
}

export function InvoiceListView({
  invoices,
  onNew,
  onEdit,
  onDelete,
  onChangeStatus,
  onSubmitToZatca,
  canSubmitToZatca,
  submittingId,
}: {
  invoices: Invoice[];
  onNew: () => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  onChangeStatus: (invoice: Invoice, status: InvoiceStatus) => void;
  onSubmitToZatca: (invoice: Invoice) => void;
  canSubmitToZatca: boolean;
  /** The invoice currently being sent, so its row can say so — submission is a
   * network round-trip to the authority, not an instant local change. */
  submittingId: string | null;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusModalFor, setStatusModalFor] = useState<Invoice | null>(null);

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
          <div className="page-title">الفواتير</div>
          <div className="page-sub">إدارة فواتير المبيعات وحالات السداد</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={onNew}>
            + فاتورة جديدة
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بالعميل أو رقم الفاتورة..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select className="sort-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                ترتيب حسب: {o.label}
              </option>
            ))}
          </select>
          <button className="menu-btn" title="عكس الترتيب" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? '⬆' : '⬇'}
          </button>
        </div>
        <div className="chip-group">
          <button className={statusFilter === 'all' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('all')}>
            الكل
          </button>
          <button className={statusFilter === 'PAID' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('PAID')}>
            مدفوعة
          </button>
          <button className={statusFilter === 'DUE' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('DUE')}>
            مستحقة
          </button>
          <button className={statusFilter === 'OVERDUE' ? 'chip active' : 'chip'} onClick={() => setStatusFilter('OVERDUE')}>
            متأخرة
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>العميل</th>
              <th>رقم الفاتورة</th>
              <th>تاريخ الإصدار</th>
              <th>الاستحقاق</th>
              <th>الحالة</th>
              <th>المبلغ</th>
              <th>فوترة (ZATCA)</th>
              <th>التصديق</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">لا توجد فواتير مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.customer.name}</td>
                <td className="num">{inv.no}</td>
                <td className="num">{dfmt(inv.issueDate)}</td>
                <td className="num">{dfmt(inv.dueDate)}</td>
                <td>
                  <span style={{ cursor: 'pointer' }} title="اضغط لتغيير الحالة" onClick={() => setStatusModalFor(inv)}>
                    <span className={`badge ${STATUS_META[inv.status].badgeClass}`}>{STATUS_META[inv.status].label}</span>
                  </span>
                </td>
                <td className="num">{fmt(inv.total)}</td>
                <td>
                  {/* The server returns null until the company profile carries a
                      legal name and VAT number — showing a placeholder QR would
                      look compliant while failing inspection. */}
                  {inv.zatcaQr ? <ZatcaQr payload={inv.zatcaQr} size={64} /> : <span className="badge">غير مكتمل</span>}
                </td>
                <td>
                  <span className={`badge ${ZATCA_STATUS_META[inv.zatcaStatus].badgeClass}`} title={inv.zatcaMessage ?? undefined}>
                    {ZATCA_STATUS_META[inv.zatcaStatus].label}
                  </span>
                  {/* The authority's reason is the only way to act on a
                      rejection, so it is shown rather than hidden behind the
                      badge alone. */}
                  {inv.zatcaStatus === 'REJECTED' && inv.zatcaMessage && <div className="hint zatca-reason">{inv.zatcaMessage}</div>}
                  {inv.zatcaIcv !== null && <div className="hint">تسلسل: {inv.zatcaIcv}</div>}
                </td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل الفاتورة', onClick: () => onEdit(inv) },
                      // Submission is the owner's act — an employee sub-account
                      // is refused by the server, so the action isn't offered.
                      ...(canSubmitToZatca && inv.zatcaStatus !== 'CLEARED'
                        ? [
                            '-' as const,
                            {
                              label: submittingId === inv.id ? '… جارٍ الإرسال' : '📤 إرسال لهيئة الزكاة',
                              onClick: () => onSubmitToZatca(inv),
                            },
                          ]
                        : []),
                      '-',
                      { label: '🗑 حذف', onClick: () => onDelete(inv), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {statusModalFor && (
        <InvoiceStatusModal
          currentStatus={statusModalFor.status}
          onCancel={() => setStatusModalFor(null)}
          onSave={(status) => {
            onChangeStatus(statusModalFor, status);
            setStatusModalFor(null);
          }}
        />
      )}
    </div>
  );
}
