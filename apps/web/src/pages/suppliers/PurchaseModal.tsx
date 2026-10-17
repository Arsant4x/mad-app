import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '../../lib/apiError';
import type { Branch } from '../../api/branches';
import { BranchPicker } from '../../components/BranchPicker';
import { STANDARD_VAT_RATE } from '../../lib/vat';
import type { CreatePurchaseInput, Purchase } from '../../api/purchases';
import type { Supplier } from '../../api/suppliers';
import { fmt, today } from '../../lib/format';
import { netTotals } from '../../lib/money';
import i18n from '../../i18n';

/**
 * Known purchase categories. The code is what is sent; the label is display only.
 *
 * The field stays free text (the merchant may write their own category), but text
 * matching a known label is sent with its code, and the server decides by the code:
 * whether amortization is allowed, the establishment costs report, and the posting
 * account. Matching the Arabic text instead let a trailing space move an invoice
 * out of a report.
 *
 * The codes mirror `apps/api/src/common/purchase-categories.ts`, and its guard
 * `purchase-categories.spec.ts` reads this file from disk and checks both
 * directions, so a category added on one side only fails the guard.
 */
const CATEGORY_CODES = ['POWER', 'WATER', 'TELECOM', 'RENT', 'SALARIES', 'COGS', 'FORMATION', 'OTHER'] as const;

type CategoryCode = (typeof CATEGORY_CODES)[number];

const categoryKey = (c: CategoryCode) => `suppliers.purchase_form.categories.${c}`;

/** The label in the current language, translated when used. */
const categoryLabel = (c: CategoryCode) => i18n.t(categoryKey(c));

/** Matches the code, or its label in either language, so text written before a language switch still maps. */
function categoryCodeOf(written: string): CategoryCode | undefined {
  const v = written.trim();
  return CATEGORY_CODES.find(
    (c) => c === v || i18n.t(categoryKey(c), { lng: 'ar' }) === v || i18n.t(categoryKey(c), { lng: 'en' }) === v,
  );
}

const INCORP_ITEM_KEYS = ['license', 'equipment', 'furniture', 'decor', 'consulting', 'gov_fees'] as const;

/**
 * What the modal hands back for both create and edit. The code uses the server's
 * generated type, not `string`, so the `CATEGORY_CODES` mirror is also checked at compile time.
 */
export interface PurchaseFormData {
  supplierId: string;
  date: string;
  dueDate?: string;
  supplierRef?: string;
  category?: string;
  categoryCode?: CreatePurchaseInput['categoryCode'];
  subtotal: number;
  exempt: boolean;
  excludeFromVat: boolean;
  amortize: boolean;
  amortizeMonths?: number;
  incorpItem?: string;
  branchId?: string;
}

export function PurchaseModal({
  suppliers,
  branches,
  editing,
  onCancel,
  onSave,
  onCreateSupplier,
}: {
  suppliers: Supplier[];
  branches: Branch[];
  editing: Purchase | null;
  onCancel: () => void;
  onSave: (data: PurchaseFormData) => Promise<void>;
  /** Absent when the actor may not add suppliers; the purchase then takes an existing supplier only. */
  onCreateSupplier?: (name: string) => Promise<Supplier>;
}) {
  const { t } = useTranslation();
  const [supplierInput, setSupplierInput] = useState(editing?.supplier.name ?? '');
  const [date, setDate] = useState(editing ? editing.date.slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(editing?.dueDate?.slice(0, 10) ?? '');
  const [supplierRef, setSupplierRef] = useState(editing?.supplierRef ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [subtotal, setSubtotal] = useState(editing ? editing.subtotal : '');
  const [exempt, setExempt] = useState(editing?.exempt ?? false);
  const [excludeFromVat, setExcludeFromVat] = useState(editing?.excludeFromVat ?? false);
  const [amortize, setAmortize] = useState(editing?.amortize ?? false);
  const [amortizeMonths, setAmortizeMonths] = useState(editing?.amortizeMonths ? String(editing.amortizeMonths) : '');
  const [incorpItem, setIncorpItem] = useState(editing?.incorpItem ?? '');
  const [branchId, setBranchId] = useState(editing?.branchId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Amortization is offered only for establishment costs, matching the mockup,
  // which shows the control only when that category is selected.
  const isIncorporation = categoryCodeOf(category) === 'FORMATION';

  // The same totals the server stores for this subtotal, so the preview never shows another number.
  const preview = useMemo(() => {
    const { tax, total } = netTotals(parseFloat(String(subtotal)) || 0, exempt ? 0 : STANDARD_VAT_RATE);
    return { tax, total };
  }, [subtotal, exempt]);

  async function handleSubmit() {
    setError(null);
    const name = supplierInput.trim();
    const sub = parseFloat(String(subtotal)) || 0;
    if (!name) {
      setError(i18n.t('err_supplier_first'));
      return;
    }
    if (!sub) {
      setError(i18n.t('err_subtotal_required'));
      return;
    }

    const amort = isIncorporation && amortize;
    const months = amort ? parseInt(amortizeMonths, 10) || 0 : undefined;
    if (amort && (!months || months < 1)) {
      setError(t('suppliers.purchase_form.months_required'));
      return;
    }

    setSaving(true);
    try {
      let supplier = suppliers.find((s) => s.name === name);
      if (!supplier) {
        if (!onCreateSupplier) {
          setError(t('suppliers.purchase_form.supplier_existing'));
          return;
        }
        supplier = await onCreateSupplier(name);
      }
      await onSave({
        supplierId: supplier.id,
        date,
        dueDate: dueDate || undefined,
        supplierRef: supplierRef.trim() || undefined,
        category: category.trim() || undefined,
        categoryCode: categoryCodeOf(category),
        subtotal: sub,
        exempt,
        excludeFromVat,
        amortize: amort,
        amortizeMonths: months,
        incorpItem: isIncorporation ? incorpItem.trim() || undefined : undefined,
        branchId: branchId || undefined,
      });
    } catch (e) {
      setError(apiErrorMessage(e, i18n.t('err_purchase_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('suppliers.purchase_form.title_edit') : t('suppliers.purchase_form.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>{t('suppliers.purchase_form.supplier')}</label>
          <input list="pur-supplier-suggestions" value={supplierInput} onChange={(e) => setSupplierInput(e.target.value)} placeholder={t('suppliers.purchase_form.supplier_placeholder')} />
          <datalist id="pur-supplier-suggestions">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('suppliers.purchase_form.date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('suppliers.purchase_form.due_date')}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>{t('suppliers.purchase_form.supplier_ref')}</label>
          <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder={t('suppliers.purchase_form.optional')} />
        </div>
        <div className="field">
          <label>{t('suppliers.purchase_form.category')}</label>
          <input list="pur-category-list" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('suppliers.purchase_form.category_placeholder')} />
          <datalist id="pur-category-list">
            {CATEGORY_CODES.map(categoryLabel).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>{t('suppliers.purchase_form.subtotal')}</label>
          <input className="num" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={exempt} onChange={(e) => setExempt(e.target.checked)} /> {t('suppliers.purchase_form.exempt')}
          </label>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={excludeFromVat} onChange={(e) => setExcludeFromVat(e.target.checked)} /> {t('suppliers.purchase_form.exclude')}
          </label>
          <p className="hint" style={{ marginTop: 4 }}>{t('suppliers.purchase_form.exclude_hint')}</p>
        </div>
        <div className="two-col" style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {t('suppliers.purchase_form.vat_label')}
            <br />
            <b className="num" style={{ fontSize: 14, color: 'var(--ink)' }}>
              {exempt ? t('suppliers.common.exempt') : fmt(preview.tax)}
            </b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {t('suppliers.purchase_form.total_incl')}
            <br />
            <b className="num" style={{ fontSize: 14, color: 'var(--emerald)' }}>
              {fmt(preview.total)}
            </b>
          </div>
        </div>

        {isIncorporation && (
          <div className="field">
            <label>{t('suppliers.purchase_form.incorp_item')}</label>
            <input list="incorp-item-list" value={incorpItem} onChange={(e) => setIncorpItem(e.target.value)} placeholder={t('suppliers.purchase_form.incorp_placeholder')} />
            <datalist id="incorp-item-list">
              {INCORP_ITEM_KEYS.map((k) => t(`suppliers.purchase_form.incorp_items.${k}`)).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="hint">{t('suppliers.purchase_form.incorp_hint')}</p>
          </div>
        )}

        {isIncorporation && (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={amortize} onChange={(e) => setAmortize(e.target.checked)} /> {t('suppliers.purchase_form.amortize')}
            </label>
            {amortize && (
              <div style={{ marginTop: 8 }}>
                <label>{t('suppliers.purchase_form.months')}</label>
                <input className="num" value={amortizeMonths} onChange={(e) => setAmortizeMonths(e.target.value)} placeholder={t('suppliers.purchase_form.months_placeholder')} />
                <p className="hint" style={{ marginTop: 4 }}>{t('suppliers.purchase_form.amortize_hint')}</p>
              </div>
            )}
          </div>
        )}

        <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('suppliers.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('suppliers.common.save_edit') : t('suppliers.purchase_form.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
