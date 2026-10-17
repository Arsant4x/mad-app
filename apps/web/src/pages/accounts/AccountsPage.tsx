import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAccount, deleteAccount, getAccountsSummary, listAccounts, updateAccount, type Account, type AccountInput, type AccountType, type AccountsSummary } from '../../api/accounts';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { AccountModal } from './AccountModal';
import i18n from '../../i18n';

const TYPE_GROUPS: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_TAG_CLASS: Record<AccountType, string> = { asset: 'type-asset', liability: 'type-liab', equity: 'type-eq', revenue: 'type-rev', expense: 'type-exp' };

export function AccountsPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canAdd = can('accounts', 'add');
  const canEdit = can('accounts', 'edit');
  const canDelete = can('accounts', 'delete');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; account: Account } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Per-type totals come from the server for the whole chart, a fact about the books, not about the search box.
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  async function reload() {
    // The totals are company-wide and refused to a branch-restricted user; that refusal must not drop the chart itself.
    const [rows, totals] = await Promise.all([listAccounts(), getAccountsSummary().catch(() => null)]);
    setAccounts(rows);
    setSummary(totals);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      const matchesType = typeFilter === 'all' || a.type === typeFilter;
      const matchesQuery = !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [accounts, search, typeFilter]);

  async function handleSave(data: AccountInput) {
    if (modal?.mode === 'edit') {
      await updateAccount(modal.account.id, {
        name: data.name,
        type: data.type,
        // A user who cannot see the opening balance does not send it, so no difference to zero is posted.
        ...(modal.account.openingBalance !== undefined ? { openingBalance: data.openingBalance } : {}),
        // Passed only when the form sent it, that is when the merchant changed it.
        ...(data.openingDate ? { openingDate: data.openingDate } : {}),
      });
    } else {
      await createAccount(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteAccount(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_account_delete'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('accounts.list.title')}</div>
          <div className="page-sub">{t('accounts.list.sub')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              {t('accounts.list.new')}
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('accounts.list.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div className="chip-group">
          <button className={typeFilter === 'all' ? 'chip active' : 'chip'} onClick={() => setTypeFilter('all')}>
            {t('accounts.list.all')}
          </button>
          {TYPE_GROUPS.map((g) => (
            <button key={g} className={typeFilter === g ? 'chip active' : 'chip'} onClick={() => setTypeFilter(g)}>
              {t(`accounts.groups.${g}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tree-row l1">
          <div>{t('accounts.list.col_name')}</div>
          <div>{t('accounts.list.col_code')}</div>
          <div>{t('accounts.list.col_type')}</div>
          <div>{t('accounts.list.col_balance')}</div>
          <div></div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">{t('accounts.list.empty')}</div>
        ) : (
          TYPE_GROUPS.map((g) => {
            const rows = filtered.filter((a) => a.type === g);
            if (!rows.length) return null;
            const total = summary ? (summary[g]?.total ?? '0.00') : null;
            return (
              <div key={g}>
                <div className="tree-row l1">
                  <div>{t(`accounts.groups.${g}`)}</div>
                  <div></div>
                  <div>
                    <span className={`type-tag ${TYPE_TAG_CLASS[g]}`}>{t(`accounts.types.${g}`)}</span>
                  </div>
                  <div className="num">{total === null ? '' : fmt(total)}</div>
                  <div></div>
                </div>
                {rows.map((a) => (
                  <div className="tree-row l2" key={a.id}>
                    <div>{a.name}</div>
                    <div>
                      <span className="code-chip">{a.code}</span>
                    </div>
                    <div>
                      <span className={`type-tag ${TYPE_TAG_CLASS[a.type]}`}>{t(`accounts.types.${a.type}`)}</span>
                    </div>
                    <div className="num">{a.balance === undefined ? '' : fmt(a.balance)}</div>
                    <div>
                      <RowMenu
                        actions={[
                          canEdit && { label: t('accounts.list.edit'), onClick: () => setModal({ mode: 'edit', account: a }) },
                          '-',
                          canDelete && { label: t('accounts.list.delete'), onClick: () => setPendingDelete(a), danger: true },
                        ]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {modal && <AccountModal editing={modal.mode === 'edit' ? modal.account : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title={t('accounts.list.delete_title')}
          body={deleteError ?? t('accounts.list.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('accounts.list.delete_confirm')}
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
