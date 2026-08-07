import { useEffect, useMemo, useState } from 'react';
import { createWarehouse, deleteWarehouse, listWarehouses, setWarehouseArchived, updateWarehouse, type Warehouse, type WarehouseInput } from '../../api/warehouses';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { WarehouseModal } from './WarehouseModal';
import i18n from '../../i18n';

export function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default (gap-analysis §1).
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; warehouse: Warehouse } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Warehouse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    setWarehouses(await listWarehouses(showArchived));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter((w) => w.name.toLowerCase().includes(q) || (w.location ?? '').toLowerCase().includes(q));
  }, [warehouses, search]);

  async function handleSave(data: WarehouseInput) {
    if (modal?.mode === 'edit') {
      await updateWarehouse(modal.warehouse.id, data);
    } else {
      await createWarehouse(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteWarehouse(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_warehouse_delete'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">المستودعات</div>
          <div className="page-sub">مواقع تخزين المخزون</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + مستودع جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بالاسم أو الموقع..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>اسم المستودع</th>
              <th>الموقع</th>
              <th>المسؤول</th>
              <th>عدد الأصناف</th>
              <th>إجمالي الكميات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">لا توجد مستودعات مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((w) => (
              <tr key={w.id}>
                <td>{w.name}{w.archived && <span className="badge draft" style={{ marginRight: 6 }}>مؤرشف</span>}</td>
                <td>{w.location || '—'}</td>
                <td>{w.manager || '—'}</td>
                <td className="num">{w.itemCount}</td>
                <td className="num">{fmt(w.totalQty)}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', warehouse: w }) },
                      { label: w.archived ? '📂 إلغاء الأرشفة' : '🗄 أرشفة', onClick: () => setWarehouseArchived(w.id, !w.archived).then(reload) },
                      '-',
                      { label: '🗑 حذف', onClick: () => setPendingDelete(w), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <WarehouseModal editing={modal.mode === 'edit' ? modal.warehouse : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title="حذف المستودع"
          body={deleteError ?? `حذف المستودع "${pendingDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
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
