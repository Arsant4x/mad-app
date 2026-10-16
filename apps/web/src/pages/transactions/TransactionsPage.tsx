import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBranches, type Branch } from '../../api/branches';
import { listBanks, type Bank } from '../../api/banks';
import { createTransaction, deleteTransaction, listTransactions, updateTransaction, type BankTx, type TransactionInput } from '../../api/transactions';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Pager } from '../../components/Pager';
import { RowMenu } from '../../components/RowMenu';
import { apiErrorMessage } from '../../lib/apiError';
import { dfmt, fmt } from '../../lib/format';
import { TransactionModal } from './TransactionModal';

const PAGE_SIZE = 25;

export function TransactionsPage() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; tx: BankTx } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankTx | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [needsBankNotice, setNeedsBankNotice] = useState(false);
  const searchDebounce = useRef<number | undefined>(undefined);

  async function reload(p: number, q: string) {
    const [tx, bnk] = await Promise.all([listTransactions({ page: p, pageSize: PAGE_SIZE, search: q.trim() || undefined }), listBanks()]);
    setTransactions(tx.items);
    setTotal(tx.total);
    setPage(tx.page);
    setBanks(bnk);
  }

  useEffect(() => {
    // The picker options — filtered server-side to what this user may use.
    listBranches().then(setBranches);
    reload(1, '').finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search runs server-side now that the client only holds one page, debounced
  // so a keystroke burst becomes one request. Every new search restarts at
  // page 1 — the old page number is meaningless against a different filter.
  function handleSearch(q: string) {
    setSearch(q);
    window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => void reload(1, q), 300);
  }

  function openCreate() {
    if (!banks.length) {
      setNeedsBankNotice(true);
      return;
    }
    setModal({ mode: 'create' });
  }

  async function handleSave(data: TransactionInput) {
    if (modal?.mode === 'edit') {
      await updateTransaction(modal.tx.id, data);
    } else {
      await createTransaction(data);
    }
    setModal(null);
    await reload(page, search);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteTransaction(pendingDelete.id);
    } catch (e) {
      // A line tied to the reconciliation is refused by the server; its message says what to do instead.
      setDeleteError(apiErrorMessage(e, t('transactions.page.delete_failed')));
      return;
    }
    setPendingDelete(null);
    await reload(page, search);
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('transactions.page.title')}</div>
          <div className="page-sub">{t('transactions.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={openCreate}>
            {t('transactions.page.add')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('transactions.page.search')} value={search} onChange={(e) => handleSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('transactions.page.col_date')}</th>
              <th>{t('transactions.page.col_memo')}</th>
              <th>{t('transactions.page.col_bank')}</th>
              <th>{t('transactions.page.col_amount')}</th>
              <th>{t('transactions.page.col_status')}</th>
              <th>{t('transactions.page.col_entry')}</th>
              <th>{t('transactions.page.col_source')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{t('transactions.page.empty')}</div>
                </td>
              </tr>
            )}
            {transactions.map((x) => (
              <tr key={x.id}>
                <td className="num">{dfmt(x.date)}</td>
                <td>{x.description}</td>
                <td>{x.bank.name}</td>
                <td className="num" style={{ color: Number(x.amount) < 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                  {fmt(x.amount)}
                </td>
                <td>
                  <span className={`badge ${x.matched ? 'paid' : 'due'}`}>{x.matched ? t('transactions.page.matched') : t('transactions.page.unmatched')}</span>
                </td>
                <td>{x.entryNo || '—'}</td>
                <td>{x.source || '—'}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: t('transactions.page.edit'), onClick: () => setModal({ mode: 'edit', tx: x }) },
                      '-',
                      { label: t('transactions.page.delete'), onClick: () => setPendingDelete(x), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} onPage={(p) => void reload(p, search)} />

      {modal && <TransactionModal banks={banks} branches={branches} editing={modal.mode === 'edit' ? modal.tx : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title={t('transactions.page.delete_title')}
          body={deleteError ?? t('transactions.page.delete_body')}
          confirmLabel={t('transactions.page.delete_confirm')}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}

      {needsBankNotice && (
        <div className="overlay" onClick={() => setNeedsBankNotice(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{t('transactions.page.no_bank_title')}</div>
              <button className="modal-close" onClick={() => setNeedsBankNotice(false)}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--charcoal)' }}>{t('transactions.page.no_bank_body')}</p>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={() => setNeedsBankNotice(false)}>
                {t('transactions.page.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
