import { useEffect, useMemo, useState } from 'react';
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
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { num0 } from '../../lib/money';
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

  // الرصيدُ يصل مع صفّ العميل من الخادم (`outstanding` — المصدرُ الواحد للتعرّض، `ق-١٢٤٣`): كانت الشاشةُ
  // تحمّل الفواتيرَ كلَّها وتجمع `outstanding` لكل عميل بنفسها. الفواتيرُ تبقى لنافذة التفاصيل وحدَها.

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.vatNumber ?? '').includes(q) || (c.phone ?? '').includes(q));
  }, [customers, search]);

  // الإنشاءُ والتعديلُ بنوعَيهما في الخادم — فلكلٍّ معالجُه ولا تحويلَ بينهما (`ق-١٤٠٤`).
  async function handleCreate(data: CustomerInput) {
    await createCustomer(data);
    setModal(null);
    await reload();
  }

  /**
   * ⚖️ نافذةُ التعديل تُفتح على **تفصيل** العميل (توجيه ٢٨٦): المعرّفُ البديل مشفَّرٌ والقائمةُ لا تحمله، فيُقرأ من
   * `GET /customers/:id`. وإن تعذّر التفصيلُ تُفتح على صفّ القائمة — والنافذةُ لا ترسل المعرّفَ إلا إن غيّره المستخدم.
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
              <th>الصفة</th>
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
                <td colSpan={7}>
                  <div className="empty-state">لا يوجد عملاء مطابقون</div>
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const balance = num0(c.outstanding);
              return (
                <tr key={c.id}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setDetailFor(c)}>
                    {c.name} 👁{c.archived && <span className="badge draft" style={{ marginRight: 6 }}>مؤرشف</span>}
                  </td>
                  <td>
                    {c.kind === 'LEGACY_UNDECLARED' ? (
                      // ②A1: القديمُ غيرُ المعلَن لا يُصدَر له مستند — الإعلانُ نقرةٌ من هنا، لا افتراضٌ من الخادم.
                      <button className="btn link" data-testid="declare-kind" onClick={() => void openEdit(c)}>
                        ⚠ أعلن الصفة
                      </button>
                    ) : (
                      CUSTOMER_KIND_LABEL[c.kind]
                    )}
                  </td>
                  <td className="num">{c.vatNumber || '—'}</td>
                  <td className="num">{c.phone || '—'}</td>
                  <td className="num">{fmt(c.creditLimit)}</td>
                  {/* ذمّةُ العميل رقمُ المنشأة كلِّها: لا تصل المقيَّدَ بفرع (`ق-١٥٨١`)، فغيابُها خانةٌ فارغة لا صفر. */}
                  <td className="num" data-testid="customer-outstanding" style={c.outstanding === undefined ? undefined : { color: balance > 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                    {c.outstanding === undefined ? '' : fmt(c.outstanding)}
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        { label: '👁 عرض التفاصيل', onClick: () => setDetailFor(c) },
                        { label: '✎ تعديل', onClick: () => void openEdit(c) },
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

      {modal?.mode === 'edit' && (
        <CustomerModal editing={modal.customer} onCancel={() => setModal(null)} onSave={(data) => handleUpdate(modal.customer.id, data)} />
      )}
      {modal?.mode === 'create' && <CustomerModal editing={null} onCancel={() => setModal(null)} onSave={handleCreate} />}

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
