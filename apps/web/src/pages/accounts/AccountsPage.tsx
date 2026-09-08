import { useEffect, useMemo, useState } from 'react';
import { createAccount, deleteAccount, listAccounts, updateAccount, type Account, type AccountInput, type AccountType } from '../../api/accounts';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { AccountModal } from './AccountModal';
import i18n from '../../i18n';

const TYPE_GROUPS: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_LABEL: Record<AccountType, string> = { asset: 'أصل', liability: 'خصم', equity: 'حقوق ملكية', revenue: 'إيراد', expense: 'مصروف' };
const TYPE_GROUP_LABEL: Record<AccountType, string> = { asset: 'الأصول', liability: 'الخصوم', equity: 'حقوق الملكية', revenue: 'الإيرادات', expense: 'المصروفات' };
const TYPE_TAG_CLASS: Record<AccountType, string> = { asset: 'type-asset', liability: 'type-liab', equity: 'type-eq', revenue: 'type-rev', expense: 'type-exp' };

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; account: Account } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    setAccounts(await listAccounts());
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
        openingBalance: data.openingBalance,
        // يُمرَّر فقط حين أرسله النموذج — أي حين غيّره التاجر (ق-٢٩٦).
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
          <div className="page-title">دليل الحسابات</div>
          <div className="page-sub">الهيكل الشجري لكافة حسابات الأستاذ العام</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + حساب جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بالاسم أو الرمز..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div className="chip-group">
          <button className={typeFilter === 'all' ? 'chip active' : 'chip'} onClick={() => setTypeFilter('all')}>
            الكل
          </button>
          {TYPE_GROUPS.map((t) => (
            <button key={t} className={typeFilter === t ? 'chip active' : 'chip'} onClick={() => setTypeFilter(t)}>
              {TYPE_GROUP_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tree-row l1">
          <div>اسم الحساب</div>
          <div>الرمز</div>
          <div>النوع</div>
          <div>الرصيد الحالي</div>
          <div></div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">لا توجد حسابات مطابقة لبحثك</div>
        ) : (
          TYPE_GROUPS.map((g) => {
            const rows = filtered.filter((a) => a.type === g);
            if (!rows.length) return null;
            const total = rows.reduce((s, a) => s + Number(a.balance), 0);
            return (
              <div key={g}>
                <div className="tree-row l1">
                  <div>{TYPE_GROUP_LABEL[g]}</div>
                  <div></div>
                  <div>
                    <span className={`type-tag ${TYPE_TAG_CLASS[g]}`}>{TYPE_LABEL[g]}</span>
                  </div>
                  <div className="num">{fmt(total)}</div>
                  <div></div>
                </div>
                {rows.map((a) => (
                  <div className="tree-row l2" key={a.id}>
                    <div>{a.name}</div>
                    <div>
                      <span className="code-chip">{a.code}</span>
                    </div>
                    <div>
                      <span className={`type-tag ${TYPE_TAG_CLASS[a.type]}`}>{TYPE_LABEL[a.type]}</span>
                    </div>
                    <div className="num">{fmt(a.balance)}</div>
                    <div>
                      <RowMenu
                        actions={[
                          { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', account: a }) },
                          '-',
                          { label: '🗑 حذف', onClick: () => setPendingDelete(a), danger: true },
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
          title="حذف الحساب"
          body={deleteError ?? `حذف الحساب "${pendingDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
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
