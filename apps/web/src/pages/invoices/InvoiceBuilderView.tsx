import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '../../lib/apiError';
import type { Branch } from '../../api/branches';
import { listOpenPrepayments, type Customer, type Invoice, type InvoiceLineInput, type OpenPrepayment } from '../../api/invoices';
import { num0 } from '../../lib/money';
import type { NewCustomerKind } from '../../api/customers';
import { fmt, toLocalISODate, today } from '../../lib/format';
import { Money } from '../../components/currency/Money';
import { draftTaxOf, lineTaxDraftError, lineTaxPayload, rateForCategory, STANDARD_LINE_TAX, type LineTaxDraft } from '../../lib/vat';
import { LineTaxPicker } from '../../components/LineTaxPicker';
import i18n from '../../i18n';

/** A line carries its tax category and reason, not a chosen rate; the preview rate is read from the category. */
export interface LineDraft {
  description: string;
  quantity: number;
  unitPrice: number;
  /** A line discount as an amount; zero when absent. */
  discount: number;
  tax: LineTaxDraft;
}

/** What is sent to the server: description, quantity, price and category with its reason, without `taxRate` (the server derives it). */
function lineDraftPayload(l: LineDraft): InvoiceLineInput {
  return { description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, ...(l.discount > 0 ? { discount: l.discount } : {}), ...lineTaxPayload(l.tax) };
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toLocalISODate(d);
}

function initialLines(editing: Invoice | null): LineDraft[] {
  if (editing) {
    return editing.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      discount: Number(l.discount ?? 0),
      tax: draftTaxOf(l),
    }));
  }
  return [
    { description: i18n.t('invoices.builder.sample_line_subscription'), quantity: 1, unitPrice: 1200, discount: 0, tax: STANDARD_LINE_TAX },
    { description: i18n.t('invoices.builder.sample_line_training'), quantity: 3, unitPrice: 450, discount: 0, tax: STANDARD_LINE_TAX },
  ];
}

export function InvoiceBuilderView({
  customers,
  editing,
  nextNumberHint,
  branches,
  onCancel,
  onSave,
  onCreateCustomer,
}: {
  customers: Customer[];
  branches: Branch[];
  editing: Invoice | null;
  nextNumberHint: string;
  onCancel: () => void;
  onSave: (data: { customerId: string; issueDate: string; issuedAt?: string; issuedOffsetMin?: number; dueDate: string; notes: string; branchId: string; lines: InvoiceLineInput[]; prepaymentInvoiceIds?: string[] }) => Promise<void>;
  onCreateCustomer: (name: string, kind: NewCustomerKind) => Promise<Customer>;
}) {
  const { t } = useTranslation();
  const [customerInput, setCustomerInput] = useState(editing?.customer.name ?? '');
  // A customer created from here needs its kind: the server refuses without one, so the screen asks next to the name.
  const [newCustomerKind, setNewCustomerKind] = useState<NewCustomerKind | ''>('');
  const [issueDate, setIssueDate] = useState(editing ? editing.issueDate.slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editing ? editing.dueDate.slice(0, 10) : defaultDueDate());
  const [notes, setNotes] = useState(() => editing?.notes ?? i18n.t('invoices.builder.default_notes'));
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => initialLines(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open prepayments for the chosen customer, read from the server and applied in full as the merchant picks.
  const matchedCustomerId = useMemo(() => customers.find((c) => c.name === customerInput.trim())?.id ?? null, [customers, customerInput]);
  const [openPrepayments, setOpenPrepayments] = useState<OpenPrepayment[]>([]);
  const [applyIds, setApplyIds] = useState<string[]>([]);
  useEffect(() => {
    setApplyIds([]);
    if (!matchedCustomerId || editing) {
      setOpenPrepayments([]);
      return;
    }
    let cancelled = false;
    listOpenPrepayments(matchedCustomerId)
      .then((rows) => {
        if (!cancelled) setOpenPrepayments(rows);
      })
      .catch(() => {
        if (!cancelled) setOpenPrepayments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [matchedCustomerId, editing]);
  const appliedPreview = useMemo(() => openPrepayments.filter((p) => applyIds.includes(p.id)).reduce((s, p) => s + num0(p.total), 0), [openPrepayments, applyIds]);

  // Preview with the rate derived from the category; the server's totals are authoritative.
  const totals = useMemo(() => {
    // Net after the line discount, and the tax on that net.
    const net = (l: LineDraft) => Math.max(0, l.quantity * l.unitPrice - (l.discount || 0));
    const subtotal = lines.reduce((s, l) => s + net(l), 0);
    const tax = lines.reduce((s, l) => s + net(l) * (rateForCategory(l.tax.taxCategory) / 100), 0);
    return { subtotal, tax, grand: subtotal + tax };
  }, [lines]);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0, discount: 0, tax: STANDARD_LINE_TAX }]);
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    setError(null);
    const name = customerInput.trim();
    if (!name) {
      setError(i18n.t('err_customer_name_first'));
      return;
    }
    if (lines.length === 0 || lines.some((l) => !l.description.trim())) {
      setError(i18n.t('err_invoice_line_desc'));
      return;
    }
    // Check the category reason before sending, with the server's own rules, so the
    // merchant is not surprised by a 400 after the customer was created.
    const taxProblem = lines.map((l, i) => ({ i, msg: lineTaxDraftError(l.tax) })).find((x) => x.msg);
    if (taxProblem) {
      setError(t('invoices.common.line_error', { n: taxProblem.i + 1, msg: taxProblem.msg }));
      return;
    }

    setSaving(true);
    try {
      let customer = customers.find((c) => c.name === name);
      if (!customer) {
        if (!newCustomerKind) {
          setError(t('invoices.builder.err_new_customer_kind'));
          setSaving(false);
          return;
        }
        customer = await onCreateCustomer(name, newCustomerKind);
      }
      // An invoice dated today carries the device's moment and offset; one dated by hand
      // on another day has no known time, so none is invented.
      const stamped = issueDate === today() ? { issuedAt: new Date().toISOString(), issuedOffsetMin: -new Date().getTimezoneOffset() } : {};
      await onSave({ customerId: customer.id, issueDate, dueDate, notes, branchId, lines: lines.map(lineDraftPayload), ...stamped, ...(applyIds.length ? { prepaymentInvoiceIds: applyIds } : {}) });
    } catch (e) {
      setError(apiErrorMessage(e, i18n.t('err_invoice_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{editing ? t('invoices.builder.title_edit') : t('invoices.builder.title_create')}</div>
          <div className="page-sub">{t('invoices.builder.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('invoices.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('invoices.builder.save_edit') : t('invoices.builder.issue')}
          </button>
        </div>
      </div>

      <div className="builder-grid">
        <div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>
              {t('invoices.builder.details_title')}
            </div>
            <div className="two-col">
              <div className="field">
                <label>{t('invoices.builder.customer')}</label>
                <input list="inv-customer-suggestions" value={customerInput} onChange={(e) => setCustomerInput(e.target.value)} placeholder={t('invoices.builder.customer_placeholder')} />
                <datalist id="inv-customer-suggestions">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                {customerInput.trim() && !customers.some((c) => c.name === customerInput.trim()) && (
                  <select aria-label={t('invoices.builder.new_customer_kind_label')} value={newCustomerKind} onChange={(e) => setNewCustomerKind(e.target.value as NewCustomerKind | '')} style={{ marginTop: 6 }}>
                    <option value="">{t('invoices.builder.new_customer_kind_prompt')}</option>
                    <option value="NATURAL">{t('invoices.builder.kind_natural')}</option>
                    <option value="ESTABLISHMENT">{t('invoices.builder.kind_establishment')}</option>
                    <option value="LEGAL_PERSON">{t('invoices.builder.kind_legal_person')}</option>
                  </select>
                )}
              </div>
              <div className="field">
                <label>{t('invoices.builder.invoice_no')}</label>
                <input className="num" readOnly value={editing?.no ?? nextNumberHint} />
              </div>
              <div className="field">
                <label>{t('invoices.builder.issue_date')}</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('invoices.builder.due_date')}</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            {/* Only shown once branches exist — a single-location business
                should never be asked to pick one. */}
            {branches.length > 0 && (
              <div className="field">
                <label>{t('invoices.builder.branch')}</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">{t('invoices.builder.company_wide')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>
              {t('invoices.builder.lines_title')}
            </div>
            <table className="line-items">
              <thead>
                <tr>
                  <th>{t('invoices.common.col_description')}</th>
                  <th style={{ width: 55 }}>{t('invoices.common.col_quantity')}</th>
                  <th style={{ width: 95 }}>{t('invoices.common.col_price')}</th>
                  <th style={{ width: 80 }}>{t('invoices.builder.col_discount')}</th>
                  <th style={{ width: 210 }}>{t('invoices.common.col_tax_category')}</th>
                  <th style={{ width: 55 }}>{t('invoices.common.col_rate')}</th>
                  <th style={{ width: 100 }}>{t('invoices.builder.col_total')}</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                    </td>
                    <td>
                      <input className="num" value={l.quantity} onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className="num" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className="num" aria-label={t('invoices.builder.line_discount_label', { n: i + 1 })} value={l.discount} onChange={(e) => updateLine(i, { discount: Math.max(0, parseFloat(e.target.value) || 0) })} />
                    </td>
                    <td>
                      <LineTaxPicker compact value={l.tax} onChange={(tax) => updateLine(i, { tax })} />
                    </td>
                    {/* The rate is read from the category, not entered. */}
                    <td className="num">{t('invoices.common.rate_pct', { rate: rateForCategory(l.tax.taxCategory) })}</td>
                    <td className="num line-total">{fmt(Math.max(0, l.quantity * l.unitPrice - (l.discount || 0)))}</td>
                    <td>
                      {lines.length > 1 && (
                        <button className="remove-line" onClick={() => removeLine(i)}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-line" onClick={addLine}>
              {t('invoices.common.add_line')}
            </button>
          </div>

          <div className="card">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{t('invoices.builder.notes')}</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Open prepayments for this customer, applied in full to this invoice; a prepayment reduces the amount due, not the total. */}
          {openPrepayments.length > 0 && (
            <fieldset className="field" data-testid="open-prepayments" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <legend>{t('invoices.builder.open_prepayments')}</legend>
              {openPrepayments.map((p) => (
                <label key={p.id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={applyIds.includes(p.id)}
                    onChange={(e) => setApplyIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))}
                  />{' '}
                  <span className="num">{p.no}</span> · {p.issueDate.slice(0, 10)} · <span className="num"><Money value={p.total} currency={p.currency} /></span>
                  {p.receiptNo && <span className="hint">{t('invoices.builder.from_receipt', { no: p.receiptNo })}</span>}
                </label>
              ))}
            </fieldset>
          )}

          {error && <p className="error-text">{error}</p>}
        </div>

        <div>
          <div className="totals-card">
            <div className="t-row">
              <span>{t('invoices.builder.subtotal')}</span>
              <span className="num">{fmt(totals.subtotal)}</span>
            </div>
            <div className="t-row">
              <span>{t('invoices.builder.vat')}</span>
              <span className="num">{fmt(totals.tax)}</span>
            </div>
            <div className="t-row grand">
              <span>{t('invoices.builder.grand_total')}</span>
              <span className="num"><Money value={fmt(totals.grand)} /></span>
            </div>
            {appliedPreview > 0 && (
              <>
                <div className="t-row">
                  <span>{t('invoices.builder.applied_prepayments')}</span>
                  <span className="num" data-testid="applied-prepayments">− {fmt(appliedPreview)}</span>
                </div>
                <div className="t-row">
                  <span>{t('invoices.builder.due_after_prepayments')}</span>
                  <span className="num"><Money value={fmt(Math.max(0, totals.grand - appliedPreview))} /></span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
