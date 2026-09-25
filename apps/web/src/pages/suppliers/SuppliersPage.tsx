import { useEffect, useMemo, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { createPurchase, deletePurchase, issueSupplierCreditNote, issueSupplierDebitNote, listPurchases, updatePurchase, type Purchase, type SupplierNoteInput } from '../../api/purchases';
import { createSupplier, deleteSupplier, listSuppliers, setSupplierArchived, updateSupplier, type Supplier, type SupplierInput } from '../../api/suppliers';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { SupplierPaymentModal } from './SupplierPaymentModal';
import { SupplierNoteModal } from './SupplierNoteModal';
import { PurchaseModal, type PurchaseFormData } from './PurchaseModal';
import { PurchaseAttachmentsModal } from './PurchaseAttachmentsModal';
import { purchaseStatus } from './purchaseStatus';
import { SupplierDetailModal } from './SupplierDetailModal';
import { SupplierModal } from './SupplierModal';
import i18n from '../../i18n';

type PurchaseSortKey = 'date' | 'no' | 'total' | 'supplier';
const PURCHASE_SORT_OPTIONS: { key: PurchaseSortKey; label: string }[] = [
  { key: 'date', label: 'التاريخ' },
  { key: 'no', label: 'الرقم' },
  { key: 'total', label: 'المبلغ' },
  { key: 'supplier', label: 'المورد' },
];

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default (gap-analysis §1).
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<PurchaseSortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [supplierModal, setSupplierModal] = useState<{ mode: 'create' } | { mode: 'edit'; supplier: Supplier } | null>(null);
  const [detailFor, setDetailFor] = useState<Supplier | null>(null);
  const [pendingDeleteSupplier, setPendingDeleteSupplier] = useState<Supplier | null>(null);
  const [supplierDeleteError, setSupplierDeleteError] = useState<string | null>(null);

  const [purchaseModal, setPurchaseModal] = useState<{ mode: 'create' } | { mode: 'edit'; purchase: Purchase } | null>(null);
  const [payingPurchase, setPayingPurchase] = useState<Purchase | null>(null);
  const [noteFor, setNoteFor] = useState<{ purchase: Purchase; side: 'credit' | 'debit' } | null>(null);
  const [attachmentsFor, setAttachmentsFor] = useState<Purchase | null>(null);
  const [pendingDeletePurchase, setPendingDeletePurchase] = useState<Purchase | null>(null);
  const [purchaseDeleteError, setPurchaseDeleteError] = useState<string | null>(null);

  async function reload() {
    const [sup, pur] = await Promise.all([listSuppliers(showArchived), listPurchases()]);
    setSuppliers(sup);
    setPurchases(pur);
  }

  useEffect(() => {
    // The picker options — filtered server-side to what this user may use.
    listBranches().then(setBranches);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const supplierRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.vatNumber ?? '').includes(q) || (s.phone ?? '').includes(q) || (s.category ?? '').toLowerCase().includes(q));
  }, [suppliers, search]);

  const purchaseRows = useMemo(() => {
    const sorted = [...purchases].sort((a, b) => {
      const av = sortKey === 'total' ? Number(a.total) : sortKey === 'supplier' ? a.supplier.name : a[sortKey];
      const bv = sortKey === 'total' ? Number(b.total) : sortKey === 'supplier' ? b.supplier.name : b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [purchases, sortKey, sortDir]);

  async function handleSaveSupplier(data: SupplierInput) {
    if (supplierModal?.mode === 'edit') {
      await updateSupplier(supplierModal.supplier.id, data);
    } else {
      await createSupplier(data);
    }
    setSupplierModal(null);
    await reload();
  }

  async function confirmDeleteSupplier() {
    if (!pendingDeleteSupplier) return;
    setSupplierDeleteError(null);
    try {
      await deleteSupplier(pendingDeleteSupplier.id);
      setPendingDeleteSupplier(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSupplierDeleteError(message ?? i18n.t('err_supplier_delete'));
    }
  }

  async function handleCreateSupplierQuick(name: string): Promise<Supplier> {
    const supplier = await createSupplier({ name });
    setSuppliers((ss) => [...ss, supplier].sort((a, b) => a.name.localeCompare(b.name)));
    return supplier;
  }

  async function handleIssueSupplierNote(data: SupplierNoteInput) {
    if (!noteFor) return;
    if (noteFor.side === 'credit') await issueSupplierCreditNote(noteFor.purchase.id, data);
    else await issueSupplierDebitNote(noteFor.purchase.id, data);
    setNoteFor(null);
    await reload();
  }

  async function handleSavePurchase(data: PurchaseFormData) {
    if (purchaseModal?.mode === 'edit') {
      await updatePurchase(purchaseModal.purchase.id, data);
    } else {
      await createPurchase(data);
    }
    setPurchaseModal(null);
    await reload();
  }

  async function confirmDeletePurchase() {
    if (!pendingDeletePurchase) return;
    try {
      await deletePurchase(pendingDeletePurchase.id);
    } catch (e) {
      // فاتورةٌ عليها سندُ صرفٍ لا تُحذف (409 مسمّاة) — تُعرض رسالةُ الخادم ولا يُبتلع الرفض.
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setPurchaseDeleteError(d?.message ?? 'تعذّر حذف الفاتورة');
      return;
    }
    setPendingDeletePurchase(null);
    await reload();
  }

  /** السدادُ سندُ صرفٍ يُرحَّل (ق-٨٦٦) — لا علَمٌ يُقلب ولا «تراجعٌ» يمحوه؛ التصحيحُ بسندٍ عاكس. */
  async function afterPaymentSaved() {
    setPayingPurchase(null);
    await reload();
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الموردون</div>
          <div className="page-sub">سجل موردي المشتريات ومزودي الخدمات</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setSupplierModal({ mode: 'create' })}>
            + مورد جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بأي تفاصيل المورد..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>اسم المورد</th>
              <th>الرقم الضريبي</th>
              <th>الجوال</th>
              <th>الفئة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {supplierRows.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">لا يوجد موردون مطابقون</div>
                </td>
              </tr>
            )}
            {supplierRows.map((s) => (
              <tr key={s.id}>
                <td style={{ cursor: 'pointer' }} onClick={() => setDetailFor(s)}>
                  {s.name} 👁{s.archived && <span className="badge draft" style={{ marginRight: 6 }}>مؤرشف</span>}
                </td>
                <td className="num">{s.vatNumber || '—'}</td>
                <td className="num">{s.phone || '—'}</td>
                <td>{s.category || '—'}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '👁 عرض التفاصيل', onClick: () => setDetailFor(s) },
                      { label: '✎ تعديل', onClick: () => setSupplierModal({ mode: 'edit', supplier: s }) },
                      { label: s.archived ? '📂 إلغاء الأرشفة' : '🗄 أرشفة', onClick: () => setSupplierArchived(s.id, !s.archived).then(reload) },
                      '-',
                      { label: '🗑 حذف', onClick: () => setPendingDeleteSupplier(s), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">فواتير الشراء المسجَّلة</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="sort-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as PurchaseSortKey)}>
              {PURCHASE_SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  ترتيب حسب: {o.label}
                </option>
              ))}
            </select>
            <button className="menu-btn" title="عكس الترتيب" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
              {sortDir === 'asc' ? '⬆' : '⬇'}
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                if (!suppliers.length) return;
                setPurchaseModal({ mode: 'create' });
              }}
            >
              + تسجيل فاتورة شراء
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>رقم</th>
              <th>المورد</th>
              <th>التاريخ</th>
              <th>الفئة</th>
              <th>قبل الضريبة</th>
              <th>الضريبة</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {purchaseRows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">لا توجد فواتير شراء مسجَّلة</div>
                </td>
              </tr>
            )}
            {purchaseRows.map((p) => {
              const status = purchaseStatus(p);
              return (
                <tr key={p.id}>
                  <td className="num">
                    {p.no}
                    {p.docType === 'SUPPLIER_CREDIT_NOTE' && (
                      <span className="badge paid" style={{ fontSize: 9, marginRight: 4 }}>
                        إشعار دائن من المورّد
                      </span>
                    )}
                    {p.docType === 'SUPPLIER_DEBIT_NOTE' && (
                      <span className="badge due" style={{ fontSize: 9, marginRight: 4 }}>
                        إشعار مدين من المورّد
                      </span>
                    )}
                    {p.supplierRef && <div className="hint">مرجع المورّد: {p.supplierRef}</div>}
                  </td>
                  <td>{p.supplier.name}</td>
                  <td className="num">{dfmt(p.date)}</td>
                  <td>
                    {p.category || '—'}
                    {p.excludeFromVat && (
                      <span className="badge draft" style={{ fontSize: 9, marginRight: 4 }}>
                        مستبعدة من الإقرار
                      </span>
                    )}
                    {p.amortize && p.amortizeMonths ? (
                      <span className="badge" style={{ fontSize: 9, marginRight: 4 }}>
                        استهلاك {p.amortizeMonths} شهر
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{fmt(p.subtotal)}</td>
                  <td className="num">{p.exempt ? 'معفاة' : fmt(p.taxAmount)}</td>
                  <td className="num">{fmt(p.total)}</td>
                  <td>
                    <span className={`badge ${status.badgeClass}`}>{status.label}</span>
                  </td>
                  <td>
                    <RowMenu
                      actions={
                        // ⚖️ الإشعارُ مرحَّلٌ لا يُعدَّل ولا يُحذف (`ق-١٠٠٦`/②) — فلا تعديلَ ولا حذفَ عليه، وتصحيحُه بإشعارٍ مقابل.
                        // والمُلغاةُ بقيد عكس (`ق-٩٩٧`/②) مُغلَقة: مستنداتُها تُقرأ ولا شيءَ يُكتب عليها.
                        p.voidedAt
                          ? [{ label: '📎 المستندات', onClick: () => setAttachmentsFor(p) }]
                          : p.docType === 'PURCHASE'
                          ? [
                              ...(p.status !== 'PAID' ? [{ label: '💳 سند صرف', onClick: () => setPayingPurchase(p) }] : []),
                              { label: '↩ إشعار دائن من المورّد', onClick: () => setNoteFor({ purchase: p, side: 'credit' }) },
                              { label: '↪ إشعار مدين من المورّد', onClick: () => setNoteFor({ purchase: p, side: 'debit' }) },
                              { label: '✎ تعديل', onClick: () => setPurchaseModal({ mode: 'edit', purchase: p }) },
                              { label: '📎 المستندات', onClick: () => setAttachmentsFor(p) },
                              '-',
                              { label: '🗑 حذف', onClick: () => setPendingDeletePurchase(p), danger: true },
                            ]
                          : [
                              ...(p.docType === 'SUPPLIER_DEBIT_NOTE' && p.status !== 'PAID' ? [{ label: '💳 سند صرف', onClick: () => setPayingPurchase(p) }] : []),
                              {
                                label: p.docType === 'SUPPLIER_CREDIT_NOTE' ? '↪ إشعار مدين يصحّحه' : '↩ إشعار دائن يصحّحه',
                                onClick: () => setNoteFor({ purchase: p, side: p.docType === 'SUPPLIER_CREDIT_NOTE' ? 'debit' : 'credit' }),
                              },
                              { label: '📎 المستندات', onClick: () => setAttachmentsFor(p) },
                            ]
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {supplierModal && (
        <SupplierModal editing={supplierModal.mode === 'edit' ? supplierModal.supplier : null} onCancel={() => setSupplierModal(null)} onSave={handleSaveSupplier} />
      )}

      {detailFor && <SupplierDetailModal supplier={detailFor} purchases={purchases} onClose={() => setDetailFor(null)} />}

      {pendingDeleteSupplier && (
        <ConfirmModal
          title="حذف المورد"
          body={supplierDeleteError ?? `حذف المورد "${pendingDeleteSupplier.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => {
            setPendingDeleteSupplier(null);
            setSupplierDeleteError(null);
          }}
          onConfirm={confirmDeleteSupplier}
        />
      )}

      {purchaseModal && (
        <PurchaseModal
          branches={branches}
          suppliers={suppliers}
          editing={purchaseModal.mode === 'edit' ? purchaseModal.purchase : null}
          onCancel={() => setPurchaseModal(null)}
          onSave={handleSavePurchase}
          onCreateSupplier={handleCreateSupplierQuick}
        />
      )}

      {attachmentsFor && <PurchaseAttachmentsModal purchase={attachmentsFor} onClose={() => setAttachmentsFor(null)} />}

      {payingPurchase && <SupplierPaymentModal purchase={payingPurchase} onCancel={() => setPayingPurchase(null)} onSaved={afterPaymentSaved} />}

      {noteFor && <SupplierNoteModal purchase={noteFor.purchase} side={noteFor.side} onCancel={() => setNoteFor(null)} onConfirm={handleIssueSupplierNote} />}

      {pendingDeletePurchase && (
        <ConfirmModal
          title="إلغاء فاتورة الشراء"
          body={
            purchaseDeleteError ??
            `إلغاء الفاتورة ${pendingDeletePurchase.no}؟ يُعكس قيدُها بقيدٍ بتاريخ اليوم ويعود ما استُلم من رفّها، ويبقى الصفُّ مُلغىً في السجلّ. وما استُهلك من بضاعتها لا يُلغى — مخرجُه إشعارٌ من المورّد.`
          }
          confirmLabel="إلغاء الفاتورة"
          onCancel={() => {
            setPendingDeletePurchase(null);
            setPurchaseDeleteError(null);
          }}
          onConfirm={confirmDeletePurchase}
        />
      )}
    </div>
  );
}
