import { useEffect, useMemo, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { createBank, deleteBank, getBankCodeBand, listBanks, setBankArchived, updateBank, type Bank, type BankInput, type CodeBandStatus } from '../../api/banks';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { BankModal } from './BankModal';
import { CashDepositsPanel } from './CashDepositsPanel';
import { NetworkSettlementsPanel } from './NetworkSettlementsPanel';
import { ReconciliationPanel } from './ReconciliationPanel';

export function BanksPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default (gap-analysis §1).
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; bank: Bank } | null>(null);
  const [reconciling, setReconciling] = useState<Bank | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Bank | null>(null);
  const [codeBand, setCodeBand] = useState<CodeBandStatus | null>(null);

  async function reload() {
    setBanks(await listBanks(showArchived));
    // سقفُ نطاق الرموز يُقرأ مع كل تحميل — فالإنذار يتبع الحالة لا لحظةَ الفتح.
    setCodeBand(await getBankCodeBand());
  }

  useEffect(() => {
    // The picker options — filtered server-side to what this user may use.
    listBranches().then(setBranches);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(q) || (b.iban ?? '').toLowerCase().includes(q));
  }, [banks, search]);

  async function handleSave(data: BankInput) {
    if (modal?.mode === 'edit') {
      // 🔴 ق-١٣٨٤: الفرعُ لا يُرسَل في التعديل — والنوعُ يمنعه (`BankUpdateInput`)، فيُنزع هنا صراحةً.
      const { branchId: _createOnly, ...update } = data;
      await updateBank(modal.bank.id, update);
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
          <button className="btn secondary" onClick={() => setSettling(true)}>
            ▦ تسويات الشبكة
          </button>
          <button className="btn secondary" onClick={() => setDepositing(true)}>
            ⇄ إيداعات الأدراج
          </button>
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + حساب بنكي
          </button>
        </div>
      </div>

      {/* إنذارُ سقف الرموز (ق-٢٩٥) — **قبل الجدار لا عنده**: رمزُ الحساب لا
          يعود بحذف البنك، فالنطاق يمشي في اتجاهٍ واحد. */}
      {codeBand?.warn && (
        <div className="page-sub" style={{ marginBottom: 14 }}>
          {codeBand.remaining > 0
            ? `⚠ بقيت ${codeBand.remaining} من ${codeBand.capacity} خانة في نطاق رموز ${codeBand.name} — والرمز لا يعود بحذف الحساب. راجعنا قبل أن ينفد.`
            : `⛔ نفدت خانات نطاق رموز ${codeBand.name} — لا يمكن إنشاء حساب بنكي جديد حتى يُوسَّع النطاق. راجعنا.`}
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بأي تفاصيل الحساب..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                <td>{b.name}{b.archived && <span className="badge draft" style={{ marginRight: 6 }}>مؤرشف</span>}</td>
                <td className="num">{b.iban || '—'}</td>
                <td className="num">{fmt(b.balance)}</td>
                <td className="num">{fmt(b.openingBalance)}</td>
                <td className="num">{dfmt(b.openingDate)}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', bank: b }) },
                      { label: '⚖ التسوية البنكية', onClick: () => setReconciling(b) },
                      { label: b.archived ? '📂 إلغاء الأرشفة' : '🗄 أرشفة', onClick: () => setBankArchived(b.id, !b.archived).then(reload) },
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

      {modal && <BankModal branches={branches} editing={modal.mode === 'edit' ? modal.bank : null} onCancel={() => setModal(null)} onSave={handleSave} />}
      {reconciling && <ReconciliationPanel bank={reconciling} onClose={() => { setReconciling(null); reload(); }} />}
      {depositing && <CashDepositsPanel banks={banks} onClose={() => { setDepositing(false); reload(); }} />}
      {settling && <NetworkSettlementsPanel banks={banks} onClose={() => { setSettling(false); reload(); }} />}

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
