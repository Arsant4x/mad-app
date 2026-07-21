import { useEffect, useMemo, useState } from 'react';
import { createBank, deleteBank, listBanks, updateBank, type Bank, type BankInput } from '../../api/banks';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { BankModal } from './BankModal';

export function BanksPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; bank: Bank } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Bank | null>(null);

  async function reload() {
    setBanks(await listBanks());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(q) || (b.iban ?? '').toLowerCase().includes(q));
  }, [banks, search]);

  async function handleSave(data: BankInput) {
    if (modal?.mode === 'edit') {
      await updateBank(modal.bank.id, data);
    } else {
      await createBank(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteBank(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الحسابات البنكية</div>
          <div className="page-sub">أرصدة الحسابات البنكية للمنشأة</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + حساب بنكي
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بأي تفاصيل الحساب..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>اسم الحساب</th>
              <th>IBAN</th>
              <th>الرصيد الحالي</th>
              <th>الرصيد الافتتاحي</th>
              <th>تاريخ الافتتاح</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">لا توجد حسابات بنكية مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td className="num">{b.iban || '—'}</td>
                <td className="num">{fmt(b.balance)}</td>
                <td className="num">{fmt(b.openingBalance)}</td>
                <td className="num">{dfmt(b.openingDate)}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', bank: b }) },
                      '-',
                      { label: '🗑 حذف', onClick: () => setPendingDelete(b), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <BankModal editing={modal.mode === 'edit' ? modal.bank : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title="حذف الحساب البنكي"
          body={`حذف "${pendingDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
