import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createCustomer,
  CUSTOMER_KIND_LABEL,
  deleteCustomer,
  getCustomer,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
  type Customer,
  type CustomerInput,
  type CustomerUpdateInput,
} from '../../api/customers';
import { listInvoices, type Invoice } from '../../api/invoices';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { num0 } from '../../lib/money';
import { CustomerDetailModal } from './CustomerDetailModal';
import { CustomerModal } from './CustomerModal';
import i18n from '../../i18n';

export function CustomersPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canAdd = can('customers', 'add');
  const canEdit = can('customers', 'edit');
  const canDelete = can('customers', 'delete');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default.
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

  // The balance arrives with the customer row from the server (`outstanding`, the single source of exposure).
  // Invoices are still loaded, for the detail modal only.

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.vatNumber ?? '').includes(q) || (c.phone ?? '').includes(q));
  }, [customers, search]);

  // Create and update have their own server types, so each has its own handler.
  async function handleCreate(data: CustomerInput) {
    await createCustomer(data);
    setModal(null);
    await reload();
  }

  /**
   * The edit modal opens on the customer's detail: the other ID is encrypted and not in the list,
   * so it is read from `GET /customers/:id`. If the detail fails, the list row is used, and the
   * modal sends the other ID only when the user changed it.
   */
  async function openEdit(c: Customer) {
    const detail = await getCustomer(c.id).catch(() => c);
    setModal({ mode: 'edit', customer: detail });
  }

  async function handleUpdate(id: string, data: CustomerUpdateInput) {
    await updateCustomer(id, data);
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
          <div className="page-title">{t('customers.page.title')}</div>
          <div className="page-sub">{t('customers.page.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              {t('customers.page.new')}
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('customers.page.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          {t('customers.page.show_archived')}
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('customers.page.col.name')}</th>
              <th>{t('customers.page.col.kind')}</th>
              <th>{t('customers.page.col.vat')}</th>
              <th>{t('customers.page.col.phone')}</th>
              <th>{t('customers.page.col.credit_limit')}</th>
              <th>{t('customers.page.col.outstanding')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('customers.page.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const balance = num0(c.outstanding);
              return (
                <tr key={c.id}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setDetailFor(c)}>
                    {c.name} {t('customers.view_icon')}{c.archived && <span className="badge draft" style={{ marginInlineStart: 6 }}>{t('customers.page.archived')}</span>}
                  </td>
                  <td>
                    {c.kind === 'LEGACY_UNDECLARED' && canEdit ? (
                      // An undeclared old customer cannot be issued a document; declaring is one click from here, never a server default.
                      <button className="btn link" data-testid="declare-kind" onClick={() => void openEdit(c)}>
                        {t('customers.page.declare_kind')}
                      </button>
                    ) : (
                      CUSTOMER_KIND_LABEL[c.kind]
                    )}
                  </td>
                  <td className="num">{c.vatNumber || '—'}</td>
                  <td className="num">{c.phone || '—'}</td>
                  <td className="num">{fmt(c.creditLimit)}</td>
                  {/* The customer's balance is a company-wide figure: it does not reach a branch-restricted user, so its absence is an empty cell, not zero. */}
                  <td className="num" data-testid="customer-outstanding" style={c.outstanding === undefined ? undefined : { color: balance > 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                    {c.outstanding === undefined ? '' : fmt(c.outstanding)}
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        { label: t('customers.page.action.details'), onClick: () => setDetailFor(c) },
                        canEdit && { label: t('customers.page.action.edit'), onClick: () => void openEdit(c) },
                        canEdit && { label: c.archived ? t('customers.page.action.unarchive') : t('customers.page.action.archive'), onClick: () => setCustomerArchived(c.id, !c.archived).then(reload) },
                        '-',
                        canDelete && { label: t('customers.page.action.delete'), onClick: () => setPendingDelete(c), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'edit' && (
        <CustomerModal editing={modal.customer} onCancel={() => setModal(null)} onSave={(data) => handleUpdate(modal.customer.id, data)} />
      )}
      {modal?.mode === 'create' && <CustomerModal editing={null} onCancel={() => setModal(null)} onSave={handleCreate} />}

      {detailFor && <CustomerDetailModal customer={detailFor} invoices={invoices} onClose={() => setDetailFor(null)} />}

      {pendingDelete && (
        <ConfirmModal
          title={t('customers.page.delete_title')}
          body={deleteError ?? t('customers.page.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('customers.page.delete_confirm')}
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
