import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createWarehouse, deleteWarehouse, listWarehouses, setWarehouseArchived, updateWarehouse, type Warehouse, type WarehouseInput } from '../../api/warehouses';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { WarehouseModal } from './WarehouseModal';
import i18n from '../../i18n';

export function WarehousesPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by default.
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
          <div className="page-title">{t('warehouses.list.title')}</div>
          <div className="page-sub">{t('warehouses.list.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            {t('warehouses.list.new')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('warehouses.list.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          {t('warehouses.list.show_archived')}
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('warehouses.list.col_name')}</th>
              <th>{t('warehouses.list.col_location')}</th>
              <th>{t('warehouses.list.col_manager')}</th>
              <th>{t('warehouses.list.col_item_count')}</th>
              <th>{t('warehouses.list.col_total_qty')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">{t('warehouses.list.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((w) => (
              <tr key={w.id}>
                <td>
                  {w.name}
                  {w.archived && (
                    <span className="badge draft" style={{ marginInlineStart: 6 }}>
                      {t('warehouses.list.archived')}
                    </span>
                  )}
                  {/* Another branch's warehouse is shown by name so stock can be transferred to it; the server withholds its quantities. */}
                  {w.otherBranch && (
                    <span className="badge draft" style={{ marginInlineStart: 6 }}>
                      {t('warehouses.list.other_branch')}
                    </span>
                  )}
                </td>
                <td>{w.location || '—'}</td>
                <td>{w.manager || '—'}</td>
                <td className="num">{w.itemCount ?? '—'}</td>
                <td className="num">{w.totalQty === null ? '—' : fmt(w.totalQty)}</td>
                <td>
                  {/* Another branch's warehouse cannot be edited, archived or deleted (the server answers 403), so no actions are shown. */}
                  {!w.otherBranch && (
                    <RowMenu
                      actions={[
                        { label: t('warehouses.list.edit'), onClick: () => setModal({ mode: 'edit', warehouse: w }) },
                        { label: w.archived ? t('warehouses.list.unarchive') : t('warehouses.list.archive'), onClick: () => setWarehouseArchived(w.id, !w.archived).then(reload) },
                        '-',
                        { label: t('warehouses.list.delete'), onClick: () => setPendingDelete(w), danger: true },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <WarehouseModal editing={modal.mode === 'edit' ? modal.warehouse : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title={t('warehouses.list.delete_title')}
          body={deleteError ?? t('warehouses.list.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('warehouses.list.delete_confirm')}
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
