import { useMemo, useState } from 'react';
import type { Invoice, InvoiceStatus } from '../../api/invoices';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { InvoiceStatusModal } from './InvoiceStatusModal';
import { STATUS_META } from './statusMeta';

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
}: {
  invoices: Invoice[];
  onNew: () => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  onChangeStatus: (invoice: Invoice, status: InvoiceStatus) => void;
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
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
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل الفاتورة', onClick: () => onEdit(inv) },
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
