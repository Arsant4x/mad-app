import { useMemo, useState } from 'react';
import type { Customer, CustomerInput, NewCustomerKind } from '../../api/customers';
import type { Property } from '../../api/properties';
import type { Unit } from '../../api/units';
import type { ContractCycle, CreateContractInput, DeclaredClassification, DeclaredVatInclusion, Furnished } from '../../api/contracts';
import { today } from '../../lib/format';
import i18n from '../../i18n';
import { CLASSIFICATION_OPTIONS, VAT_INCLUSION_OPTIONS } from './contractMeta';

const CYCLE_OPTIONS: { value: ContractCycle; label: string }[] = [
  { value: 'monthly', label: 'شهرية' },
  { value: 'quarterly', label: 'ربع سنوية' },
  { value: 'semiannual', label: 'نصف سنوية' },
  { value: 'annual', label: 'سنوية' },
];

const FURNISHED_OPTIONS: { value: Furnished; label: string }[] = [
  { value: 'unfurnished', label: 'غير مؤثثة' },
  { value: 'furnished', label: 'مؤثثة' },
  { value: 'partial', label: 'مفروشة جزئياً' },
];

/** رسالةُ الخادم من خطأ محور — كما تقرؤها بقيّةُ الشاشات. */
const serverMessage = (e: unknown): string | undefined => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
const serverStatus = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status;

export function ContractModal({
  units,
  properties,
  customers,
  onCancel,
  onSave,
  onCreateCustomer,
}: {
  units: Unit[];
  properties: Property[];
  /** العملاءُ الأحياء — المستأجرُ **يُختار منهم بمعرّفه** أو يُنشأ صراحةً (ق-١٠٢٨/①). */
  customers: Customer[];
  onCancel: () => void;
  onSave: (data: CreateContractInput) => Promise<void>;
  onCreateCustomer: (data: CustomerInput) => Promise<Customer>;
}) {
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  // المستأجر: عميلٌ بمعرّفه — لا اسمٌ يُكتب ولا هاتفٌ يُدهس (ق-٤٩٧ · §6.3).
  const [customerId, setCustomerId] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([]);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  // ②A1: صفةُ المستأجر الجديد تُختار — لا تُفترض.
  const [newKind, setNewKind] = useState<NewCustomerKind | ''>('');
  const [sameNameAsk, setSameNameAsk] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [value, setValue] = useState('');
  const [cycle, setCycle] = useState<ContractCycle>('monthly');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [deposit, setDeposit] = useState('');
  const [services, setServices] = useState('');
  const [furnished, setFurnished] = useState<Furnished | ''>('');
  const [ejarNo, setEjarNo] = useState('');
  // بلا قيمةٍ مسبقة عمداً: التصنيفُ وشمولُ الضريبة يُعلَنان لا يُفترضان (ق-٨٩١ · ق-٨٩٢).
  const [classification, setClassification] = useState<DeclaredClassification | ''>('');
  const [vatInclusion, setVatInclusion] = useState<DeclaredVatInclusion | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allCustomers = useMemo(() => [...createdCustomers, ...customers.filter((c) => !createdCustomers.some((n) => n.id === c.id))], [customers, createdCustomers]);
  const visibleCustomers = useMemo(() => {
    const q = customerFilter.trim().toLowerCase();
    const live = allCustomers.filter((c) => !c.archived);
    if (!q) return live;
    return live.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
  }, [allCustomers, customerFilter]);

  /**
   * إنشاءُ عميلٍ من داخل نموذج العقد — عبر مسار العملاء نفسِه: الاسمُ المكرَّر يعود `409` «أهو نفسُه؟»
   * فيُعرض السؤالُ ولا يُفترض الجواب؛ والتأكيدُ يعيد الطلبَ بعلَم `allowSameName` (ق-١٠٢٨/⑤).
   */
  async function createCustomerInline(allowSameName = false) {
    const name = newName.trim();
    if (!name) {
      setCustomerError(i18n.t('err_customer_name_required'));
      return;
    }
    if (!newKind) {
      setCustomerError('اختر صفة المستأجر: فرد، أو مؤسسة فردية، أو شخص اعتباري');
      return;
    }
    setCustomerError(null);
    setCreatingCustomer(true);
    try {
      const created = await onCreateCustomer({ name, kind: newKind, phone: newPhone.trim() || undefined, ...(allowSameName ? { allowSameName: true } : {}) });
      setCreatedCustomers((prev) => [created, ...prev]);
      setCustomerId(created.id);
      setSameNameAsk(null);
      setNewCustomerOpen(false);
      setNewName('');
      setNewPhone('');
    } catch (e) {
      const message = serverMessage(e);
      if (serverStatus(e) === 409 && message && message.includes('أهو نفسُه')) {
        setSameNameAsk(message);
      } else {
        setCustomerError(message ?? i18n.t('err_customer_save'));
      }
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function submit(draft: boolean) {
    setError(null);
    if (!unitId || !customerId || !value) {
      setError(i18n.t('err_contract_fields'));
      return;
    }
    if (!classification || !vatInclusion) {
      setError(i18n.t('err_contract_classification'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        unitId,
        customerId,
        value: parseFloat(value) || 0,
        cycle,
        start,
        end,
        deposit: parseFloat(String(deposit)) || undefined,
        services: services.trim() || undefined,
        furnished: furnished || undefined,
        ejarNo: ejarNo.trim() || undefined,
        classification,
        vatInclusion,
        draft,
      });
    } catch (e) {
      setError(serverMessage(e) ?? i18n.t('err_contract_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">عقد إيجار جديد</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>الوحدة</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {propertyById.get(u.propertyId)?.name ?? '—'} — {u.unitNo}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>المستأجر — عميلٌ من قائمة العملاء</label>
          <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder="اكتب للتصفية بالاسم أو الجوال..." />
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} size={Math.min(6, Math.max(2, visibleCustomers.length + 1))} style={{ marginTop: 6 }}>
            <option value="">— اختر العميل —</option>
            {visibleCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` — ${c.phone}` : ''}
              </option>
            ))}
          </select>
          {!newCustomerOpen && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setNewCustomerOpen(true)}>
              + عميلٌ جديد
            </button>
          )}
          {newCustomerOpen && (
            <div className="two-col" style={{ marginTop: 8 }}>
              <div className="field">
                <label>اسم العميل الجديد</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم المستأجر" />
              </div>
              <div className="field">
                <label>الجوال</label>
                <input className="num" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="05xxxxxxxx" />
              </div>
              <div className="field">
                <label htmlFor="contract-new-kind">صفة المستأجر</label>
                <select id="contract-new-kind" value={newKind} onChange={(e) => setNewKind(e.target.value as NewCustomerKind | '')}>
                  <option value="">— اختر —</option>
                  <option value="NATURAL">فرد</option>
                  <option value="ESTABLISHMENT">مؤسسة فردية</option>
                  <option value="LEGAL_PERSON">شخص اعتباري (شركة/جهة)</option>
                </select>
              </div>
              {sameNameAsk ? (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <p className="hint">{sameNameAsk}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setSameNameAsk(null)} disabled={creatingCustomer}>
                      لا — أختاره من القائمة
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => createCustomerInline(true)} disabled={creatingCustomer}>
                      نعم، شخصٌ آخر بالاسم نفسِه — أنشئه
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field" style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={() => createCustomerInline(false)} disabled={creatingCustomer}>
                    حفظ العميل واختياره
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => { setNewCustomerOpen(false); setCustomerError(null); }} disabled={creatingCustomer}>
                    إلغاء
                  </button>
                </div>
              )}
              {customerError && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{customerError}</p>}
            </div>
          )}
        </div>
        <div className="two-col">
          <div className="field">
            <label>تصنيف العقد للضريبة</label>
            <select value={classification} onChange={(e) => setClassification(e.target.value as DeclaredClassification | '')}>
              <option value="">— اختر —</option>
              {CLASSIFICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>قيمة العقد والضريبة</label>
            <select value={vatInclusion} onChange={(e) => setVatInclusion(e.target.value as DeclaredVatInclusion | '')}>
              <option value="">— اختر —</option>
              {VAT_INCLUSION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* ⚠️ يُعلَن عند الاختيار لا بعده (ق-٩١٨): الشاملُ يُنقص الإيرادَ عن القسط، وغيرُ الشامل يزيد ما يدين به المستأجر. */}
            {classification === 'COMMERCIAL' && vatInclusion === 'INCLUSIVE' && (
              <p className="hint" style={{ marginTop: 4 }}>
                شاملةٌ للضريبة: الضريبةُ 15/115 من كلِّ قسط — <b>فالإيرادُ أقلُّ من القسط</b>، والمستأجرُ يدفع القسطَ نفسَه.
              </p>
            )}
            {classification === 'COMMERCIAL' && vatInclusion === 'EXCLUSIVE' && (
              <p className="hint" style={{ marginTop: 4 }}>
                غيرُ شاملة: تُضاف 15% فوق كلِّ قسط — <b>فما يدين به المستأجرُ أكثرُ من القسط</b>، والإيرادُ هو القسط.
              </p>
            )}
            {classification === 'RESIDENTIAL' && vatInclusion !== '' && (
              <p className="hint" style={{ marginTop: 4 }}>
                سكنيٌّ معفى: لا ضريبةَ على الأقساط — يدخل الإقرارَ في صفّ المبيعات المعفاة.
              </p>
            )}
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>قيمة العقد</label>
            <input className="num" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>دورة السداد</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value as ContractCycle)}>
              {CYCLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>تاريخ البداية</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>تاريخ النهاية</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>مبلغ التأمين</label>
            <input className="num" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>الأثاث</label>
            <select value={furnished} onChange={(e) => setFurnished(e.target.value as Furnished | '')}>
              <option value="">—</option>
              {FURNISHED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>الخدمات المشمولة</label>
          <input value={services} onChange={(e) => setServices(e.target.value)} placeholder="كهرباء، صيانة، إنترنت..." />
        </div>
        <div className="field">
          <label>رقم العقد في إيجار (اختياري)</label>
          <input className="num" value={ejarNo} onChange={(e) => setEjarNo(e.target.value)} placeholder="رقم العقد بمنصة إيجار" />
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn-ghost" onClick={() => submit(true)} disabled={saving}>
            حفظ كمسودة
          </button>
          <button className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
            إضافة العقد
          </button>
        </div>
      </div>
    </div>
  );
}
