import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../lib/apiError';
import type { Branch } from '../../api/branches';
import { BranchPicker } from '../../components/BranchPicker';
import { STANDARD_VAT_RATE } from '../../lib/vat';
import type { CreatePurchaseInput, Purchase } from '../../api/purchases';
import type { Supplier } from '../../api/suppliers';
import { fmt, today } from '../../lib/format';
import { round2 } from '../../lib/money';
import i18n from '../../i18n';

/**
 * الفئات المعتمَدة — **الرمز هو ما يُرسَل**، واللافتة للعرض وحدها.
 *
 * الحقل يبقى حرّاً (التاجر يكتب فئته)، لكنّ ما يطابق لافتةً معروفة يُرسَل برمزه،
 * فيقرّر الخادم به: جواز الإطفاء · تقرير التأسيس · حساب الترحيل. وكان القرار
 * يُتَّخذ بمطابقة النصّ العربي، فمسافةٌ لاحقة تنقل الفاتورة من تقريرٍ إلى لا شيء.
 *
 * ⚠️ الرموز واللافتات مرآةٌ لـ`apps/api/src/common/purchase-categories.ts`،
 * وحارسُه `purchase-categories.spec.ts` **يقرأ هذا الملف من القرص** ويثبت التطابق
 * في الاتجاهين. فإضافة فئةٍ هنا بلا نظيرتها هناك تُسقط الحارس، والعكس.
 */
const CATEGORY_CODES = ['POWER', 'WATER', 'TELECOM', 'RENT', 'SALARIES', 'COGS', 'FORMATION', 'OTHER'] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_CODES)[number], string> = {
  POWER: 'كهرباء',
  WATER: 'مياه',
  TELECOM: 'اتصالات وإنترنت',
  RENT: 'إيجار',
  SALARIES: 'رواتب',
  COGS: 'تكلفة مبيعات',
  FORMATION: 'مصروفات تأسيس',
  OTHER: 'مصروفات أخرى',
};

const CATEGORY_SUGGESTIONS = CATEGORY_CODES.map((c) => CATEGORY_LABELS[c]);

function categoryCodeOf(written: string): (typeof CATEGORY_CODES)[number] | undefined {
  const v = written.trim();
  return CATEGORY_CODES.find((c) => c === v || CATEGORY_LABELS[c] === v);
}

/**
 * ما تسلّمه النافذةُ للإنشاء والتعديل معاً — نوعٌ واحدٌ كان منسوخاً في الصفحة. والرمزُ بنوع الخادم المولَّد
 * (`ق-١٤٠٤` · ③) لا `string`: فمرآةُ `CATEGORY_CODES` تُفحص به عند الترجمة أيضاً.
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
  onCreateSupplier: (name: string) => Promise<Supplier>;
}) {
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

  // Amortization is offered only for establishment costs — matches the mockup,
  // which shows the control only when that category is selected.
  const isIncorporation = categoryCodeOf(category) === 'FORMATION';

  const preview = useMemo(() => {
    const sub = parseFloat(String(subtotal)) || 0;
    const tax = exempt ? 0 : round2((sub * STANDARD_VAT_RATE) / 100);
    return { tax, total: sub + tax };
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
      setError('حدّد عدد أشهر الاستهلاك (شهر واحد على الأقل).');
      return;
    }

    setSaving(true);
    try {
      let supplier = suppliers.find((s) => s.name === name);
      if (!supplier) supplier = await onCreateSupplier(name);
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
          <div className="modal-title">{editing ? 'تعديل فاتورة الشراء' : 'تسجيل فاتورة شراء / التزام'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>المورد / الجهة</label>
          <input list="pur-supplier-suggestions" value={supplierInput} onChange={(e) => setSupplierInput(e.target.value)} placeholder="اكتب للبحث عن المورد..." />
          <datalist id="pur-supplier-suggestions">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
        <div className="two-col">
          <div className="field">
            <label>تاريخ الفاتورة</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>تاريخ الاستحقاق (آخر موعد سداد)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>رقم فاتورة المورّد (مرجع خارجي — كما على ورقته)</label>
          <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder="اختياري" />
        </div>
        <div className="field">
          <label>الفئة</label>
          <input list="pur-category-list" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="كهرباء / ماء / إنترنت / مواد خام..." />
          <datalist id="pur-category-list">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>المبلغ قبل الضريبة</label>
          <input className="num" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={exempt} onChange={(e) => setExempt(e.target.checked)} /> معفاة من ضريبة القيمة المضافة
          </label>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={excludeFromVat} onChange={(e) => setExcludeFromVat(e.target.checked)} /> مستبعدة من الإقرار الضريبي (بلا فاتورة ضريبية صحيحة)
          </label>
          <p className="hint" style={{ marginTop: 4 }}>لا تُسترد ضريبتها في إقرار القيمة المضافة.</p>
        </div>
        <div className="two-col" style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            ضريبة القيمة المضافة (15٪)
            <br />
            <b className="num" style={{ fontSize: 14, color: 'var(--ink)' }}>
              {exempt ? 'معفاة' : fmt(preview.tax)}
            </b>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            الإجمالي شامل الضريبة
            <br />
            <b className="num" style={{ fontSize: 14, color: 'var(--emerald)' }}>
              {fmt(preview.total)}
            </b>
          </div>
        </div>

        {isIncorporation && (
          <div className="field">
            <label>بند التأسيس</label>
            <input list="incorp-item-list" value={incorpItem} onChange={(e) => setIncorpItem(e.target.value)} placeholder="رسوم ترخيص / تجهيزات / أثاث..." />
            <datalist id="incorp-item-list">
              {['رسوم ترخيص', 'تجهيزات', 'أثاث', 'ديكور', 'استشارات', 'رسوم حكومية'].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="hint">يُجمَّع التقرير حسب هذا البند.</p>
          </div>
        )}

        {isIncorporation && (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={amortize} onChange={(e) => setAmortize(e.target.checked)} /> استهلاك على فترة (مصروف تأسيس مؤجَّل)
            </label>
            {amortize && (
              <div style={{ marginTop: 8 }}>
                <label>عدد أشهر الاستهلاك</label>
                <input className="num" value={amortizeMonths} onChange={(e) => setAmortizeMonths(e.target.value)} placeholder="مثال: 12" />
                <p className="hint" style={{ marginTop: 4 }}>للتقرير فقط — المصروف يُقيَّد كاملاً الآن على حساب مصروفات التأسيس (5500).</p>
              </div>
            )}
          </div>
        )}

        <BranchPicker branches={branches} value={branchId} onChange={setBranchId} />

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? 'حفظ التعديل' : 'تسجيل الفاتورة'}
          </button>
        </div>
      </div>
    </div>
  );
}
