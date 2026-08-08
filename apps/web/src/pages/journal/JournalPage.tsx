import { useEffect, useRef, useState } from 'react';
import { listAccounts, type Account } from '../../api/accounts';
import { createJournalEntry, deleteJournalEntry, listJournalEntries, type CreateJournalEntryInput, type JournalEntry } from '../../api/journal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { JournalBuilderView } from './JournalBuilderView';
import { JournalListView } from './JournalListView';
import i18n from '../../i18n';

type View = { mode: 'list' } | { mode: 'builder'; nextNumberHint: string };

const PAGE_SIZE = 25;

export function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const searchDebounce = useRef<number | undefined>(undefined);

  async function reloadPage(p: number, q: string) {
    const res = await listJournalEntries({ page: p, pageSize: PAGE_SIZE, search: q.trim() || undefined });
    setEntries(res.items);
    setTotal(res.total);
    setPage(res.page);
  }

  useEffect(() => {
    Promise.all([reloadPage(1, ''), listAccounts().then(setAccounts)]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search runs server-side now that the client only holds one page, debounced
  // so a keystroke burst becomes one request. Every new search restarts at
  // page 1 — the old page number is meaningless against a different filter.
  function handleSearch(q: string) {
    setSearch(q);
    window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => void reloadPage(1, q), 300);
  }

  // The hint is cosmetic — the server assigns the real number max-based (see
  // nextContractNumber's reasoning). Counting the loaded rows broke once only
  // one page is in memory, so the year's count comes from the server total.
  async function openBuilder() {
    const year = new Date().getFullYear();
    const { total: yearCount } = await listJournalEntries({ search: `JE-${year}-`, pageSize: 1 });
    setView({ mode: 'builder', nextNumberHint: `JE-${year}-${String(yearCount + 1).padStart(4, '0')}` });
  }

  async function handleSave(data: CreateJournalEntryInput) {
    await createJournalEntry(data);
    setView({ mode: 'list' });
    await reloadPage(page, search);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteJournalEntry(pendingDelete.id);
      setPendingDelete(null);
      await reloadPage(page, search);
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_journal_delete'));
    }
  }

  if (loading) return null;

  if (view.mode === 'builder') {
    return (
      <JournalBuilderView
        accounts={accounts}
        nextNumberHint={view.nextNumberHint}
        onCancel={() => setView({ mode: 'list' })}
        onSave={handleSave}
      />
    );
  }

  return (
    <>
      <JournalListView
        entries={entries}
        search={search}
        onSearch={handleSearch}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        onPage={(p) => void reloadPage(p, search)}
        onNew={() => void openBuilder()}
        onDelete={(entry) => setPendingDelete(entry)}
      />
      {pendingDelete && (
        <ConfirmModal
          title="حذف القيد"
          body={deleteError ?? `حذف القيد ${pendingDelete.no}؟ سيُعكَس أثره على أرصدة الحسابات المرتبطة.`}
          confirmLabel="حذف"
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
