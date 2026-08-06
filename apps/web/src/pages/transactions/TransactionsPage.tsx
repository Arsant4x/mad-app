import { useEffect, useMemo, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { listBanks, type Bank } from '../../api/banks';
import { createTransaction, deleteTransaction, listTransactions, updateTransaction, type BankTx, type TransactionInput } from '../../api/transactions';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { TransactionModal } from './TransactionModal';

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; tx: BankTx } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankTx | null>(null);
  const [needsBankNotice, setNeedsBankNotice] = useState(false);

  async function reload() {
    const [tx, bnk] = await Promise.all([listTransactions(), listBanks()]);
    setTransactions(tx);
    setBanks(bnk);
  }

  useEffect(() => {
    // The picker options — filtered server-side to what this user may use.
    listBranches().then(setBranches);
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (x) =>
        x.description.toLowerCase().includes(q) ||
        x.bank.name.toLowerCase().includes(q) ||
        (x.source ?? '').toLowerCase().includes(q) ||
        (x.entryNo ?? '').toLowerCase().includes(q),
    );
  }, [transactions, search]);

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
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteTransaction(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الحركات البنكية</div>
          <div className="page-sub">حركات الحساب البنكي وحالة المطابقة مع القيود</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={openCreate}>
            + حركة جديدة
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بأي تفاصيل الحركة..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>التاريخ</th>
              <th>البيان</th>
              <th>الحساب البنكي</th>
              <th>المبلغ</th>
              <th>الحالة</th>
              <th>القيد المرتبط</th>
              <th>المصدر</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">لا توجد حركات بنكية مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((x) => (
              <tr key={x.id}>
                <td className="num">{dfmt(x.date)}</td>
                <td>{x.description}</td>
                <td>{x.bank.name}</td>
                <td className="num" style={{ color: Number(x.amount) < 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                  {fmt(x.amount)}
                </td>
                <td>
                  <span className={`badge ${x.matched ? 'paid' : 'due'}`}>{x.matched ? 'مطابقة' : 'غير مطابقة'}</span>
                </td>
                <td>{x.entryNo || '—'}</td>
                <td>{x.source || '—'}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', tx: x }) },
                      '-',
                      { label: '🗑 حذف', onClick: () => setPendingDelete(x), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <TransactionModal banks={banks} branches={branches} editing={modal.mode === 'edit' ? modal.tx : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title="حذف الحركة"
          body="حذف هذه الحركة؟"
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {needsBankNotice && (
        <div className="overlay" onClick={() => setNeedsBankNotice(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">لا يوجد حساب بنكي</div>
              <button className="modal-close" onClick={() => setNeedsBankNotice(false)}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--charcoal)' }}>أضف حساباً بنكياً أولاً من شاشة «الحسابات البنكية» قبل تسجيل حركة.</p>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={() => setNeedsBankNotice(false)}>
                حسنًا
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
