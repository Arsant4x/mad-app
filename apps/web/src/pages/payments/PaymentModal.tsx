import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBanks, type Bank } from '../../api/banks';
import { listBranches, type Branch } from '../../api/branches';
import { listCustomers, type Customer } from '../../api/customers';
import { createPayment, listOpenInvoices, UNALLOCATED_DECLARATION_MIN, type OpenInvoice, type PaymentMethod, type UnallocatedFate } from '../../api/payments';
import { newRequestKey } from '../../api/idempotency';
import { dfmt, fmt, today } from '../../lib/format';
import { num0, round2 } from '../../lib/money';
import { lineTaxDraftError, lineTaxPayload, TAX_CATEGORY_OPTIONS, type DeclarableTaxCategory, type LineTaxDraft } from '../../lib/vat';
import { LineTaxPicker } from '../../components/LineTaxPicker';
import { useCurrency } from '../../components/currency/CurrencyContext';
import i18n from '../../i18n';

/**
 * Records a receipt voucher and allocates it to the customer's open invoices.
 *
 * The remaining amount shown per invoice is computed by the server (from allocations), never from a stored
 * field on screen, and the server always does the final check.
 */
export function PaymentModal({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [open, setOpen] = useState<OpenInvoice[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [bankId, setBankId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  // What happens to any surplus is asked when it appears, never assumed; the server rejects "on account" without invoices that cover it.
  const [fate, setFate] = useState<UnallocatedFate | ''>('');
  // Tax category of what is paid in advance: chosen, with no starting value (exempt residential rent is not billed at the standard rate).
  const [prepaymentTax, setPrepaymentTax] = useState<LineTaxDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per modal: every save attempt from it is one request, so a double click or retry never writes two vouchers.
  const [requestKey] = useState(newRequestKey);

  useEffect(() => {
    listCustomers().then(setCustomers);
    listBranches().then(setBranches);
    listBanks().then(setBanks);
  }, []);

  useEffect(() => {
    setAlloc({});
    if (!customerId) {
      setOpen([]);
      return;
    }
    listOpenInvoices(customerId).then(setOpen);
  }, [customerId]);

  // The voucher is in the base currency (this modal has no currency picker), and the server refuses
  // allocating it to an invoice in another currency, so only base currency invoices are offered.
  const baseCurrency = useCurrency()?.code;
  const allocatable = useMemo(() => (baseCurrency ? open.filter((inv) => inv.currency === baseCurrency) : []), [open, baseCurrency]);
  const excludedCount = baseCurrency ? open.length - allocatable.length : 0;

  const allocatedSum = useMemo(() => Object.values(alloc).reduce((s, v) => s + (parseFloat(v) || 0), 0), [alloc]);
  const paymentAmount = parseFloat(amount) || 0;
  const unallocated = round2(paymentAmount - allocatedSum);

  /** Auto allocation: oldest first until the amount runs out, saving the accountant clicks. */
  function autoAllocate() {
    let left = paymentAmount;
    const next: Record<string, string> = {};
    for (const inv of allocatable) {
      if (left <= 0) break;
      // The remaining amount arrives as text; read it as a number before comparing.
      const take = Math.min(left, num0(inv.remaining));
      if (take > 0) {
        next[inv.id] = String(round2(take));
        left = round2(left - take);
      }
    }
    setAlloc(next);
  }

  async function handleSave() {
    setError(null);
    if (!customerId || paymentAmount <= 0) {
      setError(i18n.t('payments.modal.err_required'));
      return;
    }
    if (method === 'BANK' && !bankId) {
      setError(i18n.t('payments.modal.err_bank'));
      return;
    }
    if (allocatedSum - paymentAmount > 0.005) {
      setError(i18n.t('payments.modal.err_over'));
      return;
    }
    const mustDeclare = unallocated > UNALLOCATED_DECLARATION_MIN;
    if (mustDeclare && !fate) {
      setError(i18n.t('payments.modal.err_declare', { amount: fmt(unallocated) }));
      return;
    }
    if (mustDeclare && fate === 'PREPAYMENT') {
      if (!prepaymentTax) {
        setError(i18n.t('payments.modal.err_prepayment_tax'));
        return;
      }
      const taxProblem = lineTaxDraftError(prepaymentTax);
      if (taxProblem) {
        setError(taxProblem);
        return;
      }
    }
    setSaving(true);
    try {
      await createPayment({
        customerId,
        branchId: branchId || undefined,
        date,
        amount: paymentAmount,
        method,
        bankId: bankId || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations: Object.entries(alloc)
          .map(([invoiceId, v]) => ({ invoiceId, amount: parseFloat(v) || 0 }))
          .filter((a) => a.amount > 0),
        ...(mustDeclare && fate ? { unallocated: fate } : {}),
        ...(mustDeclare && fate === 'PREPAYMENT' && prepaymentTax ? { prepaymentTax: lineTaxPayload(prepaymentTax) } : {}),
      }, requestKey);
      await onSaved();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(d?.message) ? d.message.join(' — ') : (d?.message ?? i18n.t('payments.modal.err_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-head">
          <div className="modal-title">{t('payments.modal.title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="two-col">
          <div className="field">
            <label>{t('payments.modal.customer')}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t('payments.modal.choose')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('payments.modal.branch')}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{t('payments.modal.no_branch')}</option>
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
            <label>{t('payments.modal.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('payments.modal.amount')}</label>
            <input className="num" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>{t('payments.modal.method')}</label>
            <select
              value={method}
              onChange={(e) => {
                const next = e.target.value as PaymentMethod;
                setMethod(next);
                // A card sale is a receivable from the acquirer (1251), not cash in a bank, so no bank is sent with it.
                if (next === 'CARD') setBankId('');
              }}
            >
              <option value="CASH">{t('payments.modal.method_cash')}</option>
              <option value="BANK">{t('payments.modal.method_bank')}</option>
              <option value="CARD">{t('payments.modal.method_card')}</option>
            </select>
          </div>
          {method === 'CARD' ? (
            <div className="field">
              <label>{t('payments.modal.account')}</label>
              <div className="muted">{t('payments.modal.card_account')}</div>
            </div>
          ) : (
            <div className="field">
              <label>{method === 'BANK' ? t('payments.modal.bank_account') : t('payments.modal.cash_box')}</label>
              <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                <option value="">{t('payments.modal.unspecified')}</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="two-col">
          <div className="field">
            <label>{t('payments.modal.reference')}</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('payments.modal.notes')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {customerId && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <b>{t('payments.modal.allocate_title')}</b>
              <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={autoAllocate} disabled={paymentAmount <= 0}>
                {t('payments.modal.auto_allocate')}
              </button>
            </div>
            {excludedCount > 0 && (
              <p className="hint" data-testid="other-currency-excluded">
                {t('payments.modal.other_currency_excluded', { n: excludedCount, currency: baseCurrency })}
              </p>
            )}
            <table>
              <thead>
                <tr>
                  <th>{t('payments.modal.col_invoice')}</th>
                  <th>{t('payments.modal.date')}</th>
                  <th>{t('payments.modal.col_total')}</th>
                  <th>{t('payments.modal.col_remaining')}</th>
                  <th>{t('payments.modal.col_allocated')}</th>
                </tr>
              </thead>
              <tbody>
                {allocatable.length === 0 && excludedCount === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">{t('payments.modal.no_open')}</div>
                    </td>
                  </tr>
                )}
                {allocatable.map((inv) => (
                  <tr key={inv.id}>
                    <td className="num">{inv.no}</td>
                    <td className="num">{dfmt(inv.issueDate)}</td>
                    <td className="num">{fmt(Number(inv.total))}</td>
                    <td className="num">{fmt(inv.remaining)}</td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        min="0"
                        max={inv.remaining}
                        value={alloc[inv.id] ?? ''}
                        onChange={(e) => setAlloc((a) => ({ ...a, [inv.id]: e.target.value }))}
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              {t('payments.modal.allocated')} <b className="num">{fmt(allocatedSum)}</b> {t('payments.modal.unallocated')}{' '}
              <b className="num" style={{ color: unallocated < 0 ? 'var(--rose)' : undefined }}>
                {fmt(unallocated)}
              </b>
            </p>
          </>
        )}
        {/* A surplus above rounding cents must have its fate declared, never assumed silently. */}
        {customerId && paymentAmount > 0 && unallocated > UNALLOCATED_DECLARATION_MIN && (
          <fieldset className="field" data-testid="unallocated-fate" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <legend>{t('payments.modal.fate_legend', { amount: fmt(unallocated) })}</legend>
            <label style={{ display: 'block' }}>
              <input type="radio" name="unallocated-fate" value="PREPAYMENT" checked={fate === 'PREPAYMENT'} onChange={() => setFate('PREPAYMENT')} /> {t('payments.modal.fate_prepayment')}
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" name="unallocated-fate" value="ON_ACCOUNT" checked={fate === 'ON_ACCOUNT'} onChange={() => setFate('ON_ACCOUNT')} /> {t('payments.modal.fate_on_account')}
            </label>
            {fate === 'PREPAYMENT' && (
              <div className="field" data-testid="prepayment-tax" style={{ marginTop: 8 }}>
                <label>{t('payments.modal.prepayment_category')}</label>
                {prepaymentTax ? (
                  <LineTaxPicker value={prepaymentTax} onChange={setPrepaymentTax} />
                ) : (
                  <select aria-label={t('payments.modal.prepayment_category_aria')} value="" onChange={(e) => e.target.value && setPrepaymentTax({ taxCategory: e.target.value as DeclarableTaxCategory })}>
                    <option value="">{t('payments.modal.choose_category')}</option>
                    {TAX_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </fieldset>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('payments.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {t('payments.modal.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
