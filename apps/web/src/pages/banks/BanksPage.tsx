import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBranches, type Branch } from '../../api/branches';
import { BANK_KIND_LABEL, createBank, deleteBank, getBankCodeBand, listBanks, setBankArchived, updateBank, type Bank, type BankInput, type BankUpdateInput, type CodeBandStatus } from '../../api/banks';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, fmt } from '../../lib/format';
import { BankModal } from './BankModal';
import { CashDepositsPanel } from './CashDepositsPanel';
import { NetworkSettlementsPanel } from './NetworkSettlementsPanel';
import { ReconciliationPanel } from './ReconciliationPanel';

export function BanksPage() {
  const { t } = useTranslation();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by day-to-day default.
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; bank: Bank } | null>(null);
  const [reconciling, setReconciling] = useState<Bank | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Bank | null>(null);
  const [codeBand, setCodeBand] = useState<CodeBandStatus | null>(null);

  async function reload() {
    setBanks(await listBanks(showArchived));
    // The code range is read on every load, so the warning follows the current state.
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

  async function handleSave(data: BankInput | BankUpdateInput) {
    if (modal?.mode === 'edit') {
      // The branch is never sent on edit; strip it explicitly.
      const { branchId: _createOnly, ...update } = data;
      await updateBank(modal.bank.id, update);
    } else {
      // The modal never creates without a declared kind, so the body is a full `BankInput`.
      await createBank(data as BankInput);
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
          <div className="page-title">{t('banks.page.title')}</div>
          <div className="page-sub">{t('banks.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn secondary" onClick={() => setSettling(true)}>
            {t('banks.page.network_settlements')}
          </button>
          <button className="btn secondary" onClick={() => setDepositing(true)}>
            {t('banks.page.cash_deposits')}
          </button>
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            {t('banks.page.add')}
          </button>
        </div>
      </div>

      {/* Warn before the code range runs out: a code is not freed when a bank is deleted. */}
      {codeBand?.warn && (
        <div className="page-sub" style={{ marginBottom: 14 }}>
          {codeBand.remaining > 0
            ? t('banks.page.band_remaining', { remaining: codeBand.remaining, capacity: codeBand.capacity, name: codeBand.name })
            : t('banks.page.band_exhausted', { name: codeBand.name })}
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('banks.page.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          {t('banks.page.show_archived')}
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('banks.page.col_name')}</th>
              <th>{t('banks.page.col_iban')}</th>
              <th>{t('banks.page.col_balance')}</th>
              <th>{t('banks.page.col_opening_balance')}</th>
              <th>{t('banks.page.col_opening_date')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">{t('banks.page.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.name}
                  {/* The kind is shown; an undeclared row is flagged so it gets declared from edit. */}
                  <span className={`badge ${b.kind === 'LEGACY_UNDECLARED' ? 'due' : 'draft'}`} style={{ marginInlineStart: 6 }}>{BANK_KIND_LABEL[b.kind]}</span>
                  {b.archived && <span className="badge draft" style={{ marginInlineStart: 6 }}>{t('banks.page.archived')}</span>}
                </td>
                <td className="num">{b.iban || '—'}</td>
                <td className="num">{fmt(b.balance)}</td>
                <td className="num">{fmt(b.openingBalance)}</td>
                <td className="num">{dfmt(b.openingDate)}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: t('banks.page.edit'), onClick: () => setModal({ mode: 'edit', bank: b }) },
                      { label: t('banks.page.reconcile'), onClick: () => setReconciling(b) },
                      { label: b.archived ? t('banks.page.unarchive') : t('banks.page.archive'), onClick: () => setBankArchived(b.id, !b.archived).then(reload) },
                      '-',
                      { label: t('banks.page.delete'), onClick: () => setPendingDelete(b), danger: true },
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
          title={t('banks.page.delete_title')}
          body={t('banks.page.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('banks.page.delete_confirm')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
