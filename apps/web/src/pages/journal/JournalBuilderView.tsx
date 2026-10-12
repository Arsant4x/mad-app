import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Account } from '../../api/accounts';
import type { CreateJournalEntryInput, JournalLineInput } from '../../api/journal';
import { fmt, today } from '../../lib/format';
import i18n from '../../i18n';

interface LineDraft {
  accountId: string;
  debit: string;
  credit: string;
}

export function JournalBuilderView({
  accounts,
  nextNumberHint,
  onCancel,
  onSave,
}: {
  accounts: Account[];
  nextNumberHint: string;
  onCancel: () => void;
  onSave: (data: CreateJournalEntryInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([
    { accountId: '', debit: '', credit: '' },
    { accountId: '', debit: '', credit: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { totalDebit, totalCredit, balanced } = useMemo(() => {
    const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    return { totalDebit, totalCredit, balanced: totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001 };
  }, [lines]);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, { accountId: '', debit: '', credit: '' }]);
  }

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function handlePost() {
    setError(null);
    const postingLines: JournalLineInput[] = lines
      .filter((l) => l.accountId && (parseFloat(l.debit) || parseFloat(l.credit)))
      .map((l) => ({ accountId: l.accountId, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }));
    if (!postingLines.length) {
      setError(i18n.t('err_journal_line_required'));
      return;
    }
    setSaving(true);
    try {
      await onSave({ date, memo: memo.trim() || t('journal.builder.default_memo'), lines: postingLines });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? i18n.t('err_journal_post'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="subview active">
      <div className="topbar">
        <div>
          <div className="page-title">{t('journal.builder.title')}</div>
          <div className="page-sub">{t('journal.builder.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('journal.builder.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handlePost} disabled={!balanced || saving}>
            {t('journal.builder.post')}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="two-col" style={{ marginBottom: 16 }}>
          <div className="field">
            <label>{t('journal.builder.number')}</label>
            <input className="num" value={nextNumberHint} readOnly />
          </div>
          <div className="field">
            <label>{t('journal.builder.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>{t('journal.builder.memo')}</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t('journal.builder.memo_placeholder')} />
        </div>

        <table className="je-table" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'start' }}>{t('journal.builder.col_account')}</th>
              <th style={{ width: 140 }}>{t('journal.builder.col_debit')}</th>
              <th style={{ width: 140 }}>{t('journal.builder.col_credit')}</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select value={l.accountId} onChange={(e) => updateLine(i, { accountId: e.target.value })}>
                    <option value="">{t('journal.builder.choose_account')}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="num"
                    placeholder="0.00"
                    value={l.debit}
                    onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                  />
                </td>
                <td>
                  <input
                    className="num"
                    placeholder="0.00"
                    value={l.credit}
                    onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                  />
                </td>
                <td>{lines.length > 2 && <button className="remove-line" onClick={() => removeLine(i)}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-line" onClick={addLine}>
          {t('journal.builder.add_line')}
        </button>

        <div className={`balance-check ${balanced ? 'ok' : 'bad'}`}>
          {balanced ? (
            <>
              {t('journal.builder.balanced')}
              <span className="num">{fmt(totalDebit)}</span> = <span className="num">{fmt(totalCredit)}</span>
            </>
          ) : (
            <>
              {t('journal.builder.unbalanced_debit')}
              <span className="num">{fmt(totalDebit)}</span>
              {t('journal.builder.unbalanced_credit')}
              <span className="num">{fmt(totalCredit)}</span>
            </>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
