import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listCustomers, type Customer } from '../../api/customers';
import { listBranches, type Branch } from '../../api/branches';
import { createQuote, updateQuote, type Quote, type QuoteLineInput } from '../../api/quotes';
import { fmt, today } from '../../lib/format';
import { draftTaxOf, lineTaxDraftError, lineTaxPayload, rateForCategory, STANDARD_LINE_TAX, type LineTaxDraft } from '../../lib/vat';
import { LineTaxPicker } from '../../components/LineTaxPicker';

/** A line carries its tax category with its reason, not a free-typed rate. */
interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  tax: LineTaxDraft;
}

const EMPTY_LINE: LineDraft = { description: '', quantity: '1', unitPrice: '', tax: STANDARD_LINE_TAX };

/** Quote builder: a simpler invoice builder, with lines of exactly the same shape. */
export function QuoteModal({ editing, onCancel, onSaved }: { editing: Quote | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerId, setCustomerId] = useState(editing?.customerId ?? '');
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [issueDate, setIssueDate] = useState(editing?.issueDate.slice(0, 10) ?? today());
  const [validUntil, setValidUntil] = useState(
    editing?.validUntil.slice(0, 10) ?? new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    editing
      ? editing.lines.map((l) => ({ description: l.description, quantity: String(Number(l.quantity)), unitPrice: String(Number(l.unitPrice)), tax: draftTaxOf(l) }))
      : [{ ...EMPTY_LINE }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCustomers().then(setCustomers);
    listBranches().then(setBranches);
  }, []);

  // Preview with the rate derived from the category; the server's totals are authoritative.
  const totals = (() => {
    const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
    const tax = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0) * (rateForCategory(l.tax.taxCategory) / 100), 0);
    return { subtotal, tax, total: subtotal + tax };
  })();

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    setError(null);
    const kept = lines.filter((l) => l.description.trim());
    const taxProblem = kept.map((l, i) => ({ i, msg: lineTaxDraftError(l.tax) })).find((x) => x.msg);
    if (taxProblem) {
      setError(t('quotes.modal.line_error', { n: taxProblem.i + 1, msg: taxProblem.msg }));
      return;
    }
    const parsed: QuoteLineInput[] = kept.map((l) => ({ description: l.description.trim(), quantity: parseFloat(l.quantity) || 0, unitPrice: parseFloat(l.unitPrice) || 0, ...lineTaxPayload(l.tax) }));
    if (!customerId || parsed.length === 0 || parsed.some((l) => l.quantity <= 0)) {
      setError(t('quotes.modal.required'));
      return;
    }
    if (validUntil < issueDate) {
      setError(t('quotes.modal.valid_before_issue'));
      return;
    }
    setSaving(true);
    try {
      const dto = { customerId, branchId: branchId || undefined, issueDate, validUntil, notes: notes.trim() || undefined, lines: parsed };
      if (editing) await updateQuote(editing.id, dto);
      else await createQuote(dto);
      await onSaved();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('quotes.modal.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('quotes.modal.edit_title', { no: editing.no }) : t('quotes.modal.new_title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="two-col">
          <div className="field">
            <label>{t('quotes.modal.customer')}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t('quotes.modal.choose')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('quotes.modal.branch')}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{t('quotes.modal.no_branch')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('quotes.modal.issue_date')}</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('quotes.modal.valid_until')}</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '45%' }}>{t('quotes.modal.col_item')}</th>
              <th>{t('quotes.modal.col_qty')}</th>
              <th>{t('quotes.modal.col_unit_price')}</th>
              <th style={{ width: 210 }}>{t('quotes.modal.col_tax_category')}</th>
              <th>{t('quotes.modal.col_rate')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder={t('quotes.modal.item_placeholder')} />
                </td>
                <td>
                  <input className="num" type="number" min="0" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                </td>
                <td>
                  <input className="num" type="number" min="0" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                </td>
                <td>
                  <LineTaxPicker compact value={l.tax} onChange={(tax) => setLine(i, { tax })} />
                </td>
                <td className="num">{t('quotes.modal.rate_pct', { n: rateForCategory(l.tax.taxCategory) })}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}>
          {t('quotes.modal.add_line')}
        </button>

        <div className="field" style={{ marginTop: 8 }}>
          <label>{t('quotes.modal.notes')}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <p className="num" style={{ textAlign: 'end', fontWeight: 700 }}>
          {t('quotes.modal.total', { total: fmt(totals.total) })}{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{t('quotes.modal.breakdown', { subtotal: fmt(totals.subtotal), tax: fmt(totals.tax) })}</span>
        </p>

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('quotes.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {editing ? t('quotes.modal.save_edit') : t('quotes.modal.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
