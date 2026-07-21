import { useEffect, useState } from 'react';
import { listAccounts, type Account } from '../../api/accounts';
import { createJournalEntry, deleteJournalEntry, listJournalEntries, type CreateJournalEntryInput, type JournalEntry } from '../../api/journal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { JournalBuilderView } from './JournalBuilderView';
import { JournalListView } from './JournalListView';

type View = { mode: 'list' } | { mode: 'builder' };

export function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [je, acc] = await Promise.all([listJournalEntries(), listAccounts()]);
    setEntries(je);
    setAccounts(acc);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleSave(data: CreateJournalEntryInput) {
    await createJournalEntry(data);
    setView({ mode: 'list' });
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteJournalEntry(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? 'تعذّر حذف القيد');
    }
  }

  if (loading) return null;

  if (view.mode === 'builder') {
    const year = new Date().getFullYear();
    const autoCount = entries.filter((e) => e.no.startsWith(`JE-${year}-`)).length;
    return (
      <JournalBuilderView
        accounts={accounts}
        nextNumberHint={`JE-${year}-${String(autoCount + 1).padStart(4, '0')}`}
        onCancel={() => setView({ mode: 'list' })}
        onSave={handleSave}
      />
    );
  }

  return (
    <>
      <JournalListView entries={entries} onNew={() => setView({ mode: 'builder' })} onDelete={(entry) => setPendingDelete(entry)} />
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
