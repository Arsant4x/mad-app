import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createBranch, deleteBranch, listBranches, updateBranch, type Branch, type BranchInput } from '../../api/branches';
import { listWarehouses, type Warehouse } from '../../api/warehouses';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { BranchModal, branchTypeLabel } from './BranchModal';
import i18n from '../../i18n';

export function BranchesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Creating/editing branches is owner-only server-side; hiding the controls
  // keeps an employee from being offered an action that would 403.
  const canManage = user?.actorType === 'COMPANY';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; branch: Branch } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setBranches(await listBranches());
  }

  useEffect(() => {
    Promise.all([reload(), listWarehouses().then(setWarehouses)]).finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.name.toLowerCase().includes(q) || (b.type ?? '').toLowerCase().includes(q) || (b.type ? branchTypeLabel(b.type).toLowerCase().includes(q) : false));
  }, [branches, search]);

  async function handleSave(data: BranchInput) {
    if (modal?.mode === 'edit') {
      await updateBranch(modal.branch.id, data);
    } else {
      await createBranch(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError(null);
    try {
      await deleteBranch(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? i18n.t('err_branch_delete')));
      setPendingDelete(null);
    }
  }

  if (loading) return null;

  const warehouseName = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? '—';

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('branches.title')}</div>
          <div className="page-sub">{t('branches.subtitle')}</div>
        </div>
        {canManage && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              {t('branches.new_button')}
            </button>
          </div>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="toolbar">
        <div className="search-box">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('branches.search_placeholder')} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          {branches.length === 0
            ? t('branches.empty')
            : t('branches.no_results')}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>{t('branches.col.name')}</th>
                <th>{t('branches.col.type')}</th>
                <th>{t('branches.col.activity')}</th>
                <th>{t('branches.col.default_warehouse')}</th>
                <th>{t('branches.col.hours')}</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.type ? branchTypeLabel(b.type) : '—'}</td>
                  <td>{b.activity?.name ?? '—'}</td>
                  <td>{warehouseName(b.warehouseId)}</td>
                  <td>{b.hours ?? '—'}</td>
                  {canManage && (
                    <td>
                      <RowMenu
                        actions={[
                          { label: t('branches.edit'), onClick: () => setModal({ mode: 'edit', branch: b }) },
                          { label: t('branches.delete'), onClick: () => setPendingDelete(b), danger: true },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <BranchModal
          editing={modal.mode === 'edit' ? modal.branch : null}
          warehouses={warehouses}
          onCancel={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('branches.delete_title')}
          body={t('branches.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('branches.delete')}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
