import { useState } from 'react';
import {
  BUYER_ID_SCHEMES,
  BUYER_ID_SCHEME_LABEL,
  CUSTOMER_KIND_LABEL,
  type BuyerIdScheme,
  type Customer,
  type CustomerInput,
  type CustomerKind,
  type CustomerUpdateInput,
} from '../../api/customers';
import i18n from '../../i18n';

/** رسالةُ الخادم وحالتُه من خطأ محور — كما تقرؤها بقيّةُ الشاشات. */
const serverMessage = (e: unknown): string | undefined => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
const serverStatus = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status;

/**
 * الإنشاءُ والتعديلُ صنفان في الخادم (`CreateCustomerDto` · `UpdateCustomerDto`) — فالنافذةُ تسلّم كلّاً بنوعه:
 * الإنشاءُ يُغفل المعرّفَ البديلَ الفارغ، والتعديلُ يمحوه بـ`null` (`ق-١٤٠٤` · ③).
 */
type CustomerModalProps =
  | { editing: null; onCancel: () => void; onSave: (data: CustomerInput) => Promise<void> }
  | { editing: Customer; onCancel: () => void; onSave: (data: CustomerUpdateInput) => Promise<void> };

export function CustomerModal(props: CustomerModalProps) {
  const { editing, onCancel } = props;
  const [name, setName] = useState(editing?.name ?? '');
  // ②A1: الصفةُ تُختار صراحةً — لا افتراضَ لعميلٍ جديد، والقديمُ غيرُ المعلَن يُعلَن من هنا.
  const [kind, setKind] = useState<Exclude<CustomerKind, 'LEGACY_UNDECLARED'> | ''>(editing && editing.kind !== 'LEGACY_UNDECLARED' ? editing.kind : '');
  const [otherIdScheme, setOtherIdScheme] = useState<BuyerIdScheme | ''>(editing?.otherIdScheme ?? '');
  const [otherId, setOtherId] = useState(editing?.otherId ?? '');
  const [country, setCountry] = useState(editing?.country ?? 'SA');
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [creditLimit, setCreditLimit] = useState(editing?.creditLimit ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // **الاسمُ المكرَّر تنبيهٌ لا قيد** (ق-١٠٢٨/⑤): الخادمُ يردّ «أهو نفسُه؟» فيُعرض السؤالُ ولا يُفترض الجواب.
  const [sameNameAsk, setSameNameAsk] = useState<string | null>(null);

  async function handleSubmit(allowSameName = false) {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_customer_name_required'));
      return;
    }
    if (!kind) {
      setError('اختر صفة العميل: فرد، أو مؤسسة فردية، أو شخص اعتباري — هي ما يقرّر نوع الفاتورة');
      return;
    }
    setSaving(true);
    try {
      const base = {
        name: name.trim(),
        kind,
        country: country.trim().toUpperCase() || 'SA',
        vatNumber: vatNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        creditLimit: parseFloat(creditLimit as string) || 0,
        ...(allowSameName ? { allowSameName: true } : {}),
      };
      // ⚠️ الإنشاءُ بـ`''` كان يُردّ `400` («مخطّط المعرّف البديل غير معروف») — فيُغفَل الفارغ، والتعديلُ يمحو بـ`null`.
      // ⚖️ والتعديلُ لا يرسل المعرّفَ البديل إلا إن تغيّر (توجيه ٢٨٦): الرقمُ مشفَّرٌ ويُقرأ من التفصيل، فنافذةٌ فُتحت بلا رقمه
      // لا تمحوه بإرسال فراغٍ لم يكتبه أحد — ولا يسافر الرقمُ في طلبٍ لم يمسّه.
      const idTyped = otherId.trim() !== (editing?.otherId ?? '');
      const schemeChanged = otherIdScheme !== (editing?.otherIdScheme ?? '');
      const otherIdPatch = idTyped
        ? { otherIdScheme: otherIdScheme || null, otherId: otherId.trim() || null }
        : schemeChanged
          ? otherIdScheme
            ? { otherIdScheme } // المخطّطُ وحدَه — والرقمُ المشفَّرُ باقٍ في الخادم.
            : { otherIdScheme: null, otherId: null }
          : {};
      if (props.editing !== null) await props.onSave({ ...base, ...otherIdPatch });
      else await props.onSave({ ...base, otherIdScheme: otherIdScheme || undefined, otherId: otherId.trim() || undefined });
      setSameNameAsk(null);
    } catch (e) {
      const message = serverMessage(e);
      if (serverStatus(e) === 409 && message && message.includes('أهو نفسُه')) {
        setSameNameAsk(message);
      } else {
        setError(message ?? i18n.t('err_customer_save'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? 'تعديل العميل' : 'عميل جديد'}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>اسم العميل</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شركة الأفق التجارية" />
        </div>
        <div className="field">
          <label htmlFor="customer-kind">صفة العميل</label>
          <select id="customer-kind" value={kind} onChange={(e) => setKind(e.target.value as Exclude<CustomerKind, 'LEGACY_UNDECLARED'> | '')}>
            <option value="">— اختر —</option>
            <option value="NATURAL">{CUSTOMER_KIND_LABEL.NATURAL} — فاتورة مبسّطة</option>
            <option value="ESTABLISHMENT">{CUSTOMER_KIND_LABEL.ESTABLISHMENT} — فاتورة ضريبية كاملة</option>
            <option value="LEGAL_PERSON">{CUSTOMER_KIND_LABEL.LEGAL_PERSON} — فاتورة ضريبية كاملة</option>
          </select>
          {editing?.kind === 'LEGACY_UNDECLARED' && <p className="hint">هذا العميل سبق البناء ولم تُعلَن صفته — لا يُصدَر له مستند حتى تُعلنها هنا.</p>}
        </div>
        <div className="field">
          <label>الرقم الضريبي</label>
          <input className="num" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="300XXXXXXXXXXX" />
        </div>
        <div className="two-col">
          <div className="field">
            <label htmlFor="customer-other-scheme">المعرّف البديل (لغير المسجَّل في الضريبة)</label>
            <select id="customer-other-scheme" value={otherIdScheme} onChange={(e) => setOtherIdScheme(e.target.value as BuyerIdScheme | '')}>
              <option value="">— بلا —</option>
              {BUYER_ID_SCHEMES.map((s) => (
                <option key={s} value={s}>
                  {BUYER_ID_SCHEME_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="customer-other-id">رقم المعرّف</label>
            <input
              id="customer-other-id"
              className="num"
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
              // الرقمُ مشفَّرٌ في الخادم (توجيه ٢٨٦): إن لم يُقرأ التفصيلُ قيل «مسجَّل» ولم يُعرض، والكتابةُ تستبدله.
              placeholder={editing?.otherIdOnFile && editing.otherId === undefined ? 'مسجَّل — اكتب رقماً جديداً لاستبداله' : 'حروف وأرقام لاتينية'}
            />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label htmlFor="customer-country">البلد (رمز ISO)</label>
            <input id="customer-country" className="num" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="SA" maxLength={2} />
          </div>
          <div className="field">
            <label>رقم الجوال</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
          </div>
        </div>
        <div className="field">
          <label>حد الائتمان</label>
          <input className="num" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="50,000" />
        </div>
        {error && <p className="error-text">{error}</p>}
        {sameNameAsk && (
          <div className="field">
            <p className="hint">{sameNameAsk}</p>
          </div>
        )}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
          {sameNameAsk ? (
            <>
              <button className="btn btn-ghost" onClick={() => setSameNameAsk(null)} disabled={saving}>
                لا — أراجع القائمة
              </button>
              <button className="btn btn-primary" onClick={() => handleSubmit(true)} disabled={saving}>
                نعم، شخصٌ آخر بالاسم نفسِه — {editing ? 'احفظ' : 'أنشئه'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={saving}>
              {editing ? 'حفظ التعديل' : 'إضافة العميل'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
