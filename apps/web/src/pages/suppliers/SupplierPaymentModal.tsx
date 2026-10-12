import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBanks, type Bank } from '../../api/banks';
import { listBranches, type Branch } from '../../api/branches';
import type { Purchase } from '../../api/purchases';
import { createSupplierPayment, listOpenPurchases, type OpenPurchase, type SupplierPaymentInputMethod } from '../../api/supplierPayments';
import { newRequestKey } from '../../api/idempotency';
import { dfmt, fmt, today } from '../../lib/format';
import { num0, round2 } from '../../lib/money';

/**
 * A payment voucher to a supplier and its allocation to open purchase invoices,
 * mirroring the receipt voucher modal.
 *
 * Opened from a specific invoice: the supplier is fixed and that invoice starts
 * allocated with its remainder, while the supplier's other open invoices are listed
 * for allocation. Each remainder comes from the server (from allocations), and the
 * final check is always on the server. No cash drawer here: a cash box or a bank.
 */
export function SupplierPaymentModal({ purchase, onCancel, onSaved }: { purchase: Purchase; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [open, setOpen] = useState<OpenPurchase[]>([]);

  const [branchId, setBranchId] = useState(purchase.branchId ?? '');
  const [date, setDate] = useState(today());
  // The remainder arrives as a two-decimal string; read it as a number once, then fill both fields.
  const [amount, setAmount] = useState(String(round2(num0(purchase.remaining))));
  const [method, setMethod] = useState<SupplierPaymentInputMethod>('CASH');
  const [bankId, setBankId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({ [purchase.id]: String(round2(num0(purchase.remaining))) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per open modal, as for receipt vouchers.
  const [requestKey] = useState(newRequestKey);

  useEffect(() => {
    listBranches().then(setBranches);
    listBanks().then(setBanks);
    listOpenPurchases(purchase.supplierId).then(setOpen);
  }, [purchase.supplierId]);

  const allocatedSum = useMemo(() => Object.values(alloc).reduce((s, v) => s + (parseFloat(v) || 0), 0), [alloc]);
  const paymentAmount = parseFloat(amount) || 0;
  const unallocated = round2(paymentAmount - allocatedSum);

  /** Automatic allocation: oldest first until the amount runs out. */
  function autoAllocate() {
    let left = paymentAmount;
    const next: Record<string, string> = {};
    for (const p of open) {
      if (left <= 0) break;
      const take = Math.min(left, num0(p.remaining));
      if (take > 0) {
        next[p.id] = String(round2(take));
        left = round2(left - take);
      }
    }
    setAlloc(next);
  }

  async function handleSave() {
    setError(null);
    if (paymentAmount <= 0) {
      setError(t('suppliers.payment.amount_required'));
      return;
    }
    if (method === 'BANK' && !bankId) {
      setError(t('suppliers.payment.bank_required'));
      return;
    }
    if (allocatedSum - paymentAmount > 0.005) {
      setError(t('suppliers.payment.over_allocated'));
      return;
    }
    setSaving(true);
    try {
      await createSupplierPayment({
        supplierId: purchase.supplierId,
        branchId: branchId || undefined,
        date,
        amount: paymentAmount,
        method,
        bankId: bankId || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations: Object.entries(alloc)
          .map(([purchaseId, v]) => ({ purchaseId, amount: parseFloat(v) || 0 }))
          .filter((a) => a.amount > 0),
      }, requestKey);
      await onSaved();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(d?.message) ? d.message.join(' — ') : (d?.message ?? t('suppliers.payment.failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-head">
          <div className="modal-title">{t('suppliers.payment.title', { supplier: purchase.supplier.name })}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="two-col">
          <div className="field">
            <label>{t('suppliers.payment.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('suppliers.payment.amount')}</label>
            <input className="num" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>{t('suppliers.payment.method')}</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as SupplierPaymentInputMethod)}>
              <option value="CASH">{t('suppliers.payment.cash')}</option>
              <option value="BANK">{t('suppliers.payment.bank')}</option>
            </select>
          </div>
          <div className="field">
            <label>{method === 'BANK' ? t('suppliers.payment.bank_account') : t('suppliers.payment.cash_box')}</label>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">{t('suppliers.payment.none')}</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="two-col">
          <div className="field">
            <label>{t('suppliers.payment.branch')}</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{t('suppliers.payment.no_branch')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('suppliers.payment.reference')}</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>{t('suppliers.payment.notes')}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <b>{t('suppliers.payment.allocate_title')}</b>
          <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={autoAllocate} disabled={paymentAmount <= 0}>
            {t('suppliers.payment.auto_allocate')}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('suppliers.payment.col_invoice')}</th>
              <th>{t('suppliers.payment.col_date')}</th>
              <th>{t('suppliers.payment.col_total')}</th>
              <th>{t('suppliers.payment.col_remaining')}</th>
              <th>{t('suppliers.payment.col_allocated')}</th>
            </tr>
          </thead>
          <tbody>
            {open.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">{t('suppliers.payment.empty')}</div>
                </td>
              </tr>
            )}
            {open.map((p) => (
              <tr key={p.id}>
                <td className="num">{p.no}</td>
                <td className="num">{dfmt(p.date)}</td>
                <td className="num">{fmt(Number(p.total))}</td>
                <td className="num">{fmt(p.remaining)}</td>
                <td>
                  <input
                    className="num"
                    type="number"
                    min="0"
                    max={p.remaining}
                    value={alloc[p.id] ?? ''}
                    onChange={(e) => setAlloc((a) => ({ ...a, [p.id]: e.target.value }))}
                    placeholder="0.00"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          {t('suppliers.payment.allocated')} <b className="num">{fmt(allocatedSum)}</b>
          {t('suppliers.payment.unallocated')}{' '}
          <b className="num" style={{ color: unallocated < 0 ? 'var(--rose)' : undefined }}>
            {fmt(unallocated)}
          </b>
        </p>

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('suppliers.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {t('suppliers.payment.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
