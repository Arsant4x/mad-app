import { useEffect, useMemo, useState } from 'react';
import { createCustomer, deleteCustomer, listCustomers, setCustomerArchived, updateCustomer, type Customer, type CustomerInput } from '../../api/customers';
import { listInvoices, type Invoice } from '../../api/invoices';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { CustomerDetailModal } from './CustomerDetailModal';
import { CustomerModal } from './CustomerModal';
import i18n from '../../i18n';

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default (gap-analysis §1).
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; customer: Customer } | null>(null);
  const [detailFor, setDetailFor] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [cust, inv] = await Promise.all([listCustomers(showArchived), listInvoices()]);
    setCustomers(cust);
    setInvoices(inv);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const balanceByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status === 'PAID') continue;
      map.set(inv.customerId, (map.get(inv.customerId) ?? 0) + Number(inv.total));
    }
    return map;
  }, [invoices]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.vatNumber ?? '').includes(q) || (c.phone ?? '').includes(q));
  }, [customers, search]);

  async function handleSave(data: CustomerInput) {
    if (modal?.mode === 'edit') {
      await updateCustomer(modal.customer.id, data);
    } else {
      await createCustomer(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteCustomer(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_customer_delete'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">العملاء</div>
          <div className="page-sub">سجل العملاء وأرصدة الذمم المدينة</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + عميل جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث باسم العميل..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          عرض المؤرشفة
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>اسم العميل</th>
              <th>الرقم الضريبي</th>
              <th>الجوال</th>
              <th>حد الائتمان</th>
              <th>الرصيد المستحق</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">لا يوجد عملاء مطابقون</div>
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const balance = balanceByCustomer.get(c.id) ?? 0;
              return (
                <tr key={c.id}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setDetailFor(c)}>
                    {c.name} 👁{c.archived && <span className="badge draft" style={{ marginRight: 6 }}>مؤرشف</span>}
                  </td>
                  <td className="num">{c.vatNumber || '—'}</td>
                  <td className="num">{c.phone || '—'}</td>
                  <td className="num">{fmt(c.creditLimit)}</td>
                  <td className="num" style={{ color: balance > 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                    {fmt(balance)}
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        { label: '👁 عرض التفاصيل', onClick: () => setDetailFor(c) },
                        { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', customer: c }) },
                        { label: c.archived ? '📂 إلغاء الأرشفة' : '🗄 أرشفة', onClick: () => setCustomerArchived(c.id, !c.archived).then(reload) },
                        '-',
                        { label: '🗑 حذف', onClick: () => setPendingDelete(c), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && <CustomerModal editing={modal.mode === 'edit' ? modal.customer : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {detailFor && <CustomerDetailModal customer={detailFor} invoices={invoices} onClose={() => setDetailFor(null)} />}

      {pendingDelete && (
        <ConfirmModal
          title="حذف العميل"
          body={deleteError ?? `حذف العميل "${pendingDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
