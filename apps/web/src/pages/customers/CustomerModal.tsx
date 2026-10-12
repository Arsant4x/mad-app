import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

/** The server's message and status from an axios error, read as the other screens read them. */
const serverMessage = (e: unknown): string | undefined => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
const serverStatus = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status;

/**
 * Create and update are two DTOs on the server, so the modal hands each its own type:
 * create omits an empty other ID, update clears it with `null`.
 */
type CustomerModalProps =
  | { editing: null; onCancel: () => void; onSave: (data: CustomerInput) => Promise<void> }
  | { editing: Customer; onCancel: () => void; onSave: (data: CustomerUpdateInput) => Promise<void> };

export function CustomerModal(props: CustomerModalProps) {
  const { t } = useTranslation();
  const { editing, onCancel } = props;
  const [name, setName] = useState(editing?.name ?? '');
  // The kind is chosen explicitly: no default for a new customer, and an undeclared old one is declared here.
  const [kind, setKind] = useState<Exclude<CustomerKind, 'LEGACY_UNDECLARED'> | ''>(editing && editing.kind !== 'LEGACY_UNDECLARED' ? editing.kind : '');
  const [otherIdScheme, setOtherIdScheme] = useState<BuyerIdScheme | ''>(editing?.otherIdScheme ?? '');
  const [otherId, setOtherId] = useState(editing?.otherId ?? '');
  const [country, setCountry] = useState(editing?.country ?? 'SA');
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [creditLimit, setCreditLimit] = useState(editing?.creditLimit ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A duplicate name is a warning, not a constraint: the server asks "is it the same one?", and the question is shown, not answered for the user.
  const [sameNameAsk, setSameNameAsk] = useState<string | null>(null);

  async function handleSubmit(allowSameName = false) {
    setError(null);
    if (!name.trim()) {
      setError(i18n.t('err_customer_name_required'));
      return;
    }
    if (!kind) {
      setError(t('customers.modal.err_kind_required'));
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
      // Create with '' was refused with 400, so an empty value is omitted; update clears with `null`.
      // Update sends the other ID only when it changed: the number is encrypted and read from the detail,
      // so a modal opened without it must not erase it with an empty value, and an untouched number is not sent.
      const idTyped = otherId.trim() !== (editing?.otherId ?? '');
      const schemeChanged = otherIdScheme !== (editing?.otherIdScheme ?? '');
      const otherIdPatch = idTyped
        ? { otherIdScheme: otherIdScheme || null, otherId: otherId.trim() || null }
        : schemeChanged
          ? otherIdScheme
            ? { otherIdScheme } // The scheme alone; the encrypted number stays on the server.
            : { otherIdScheme: null, otherId: null }
          : {};
      if (props.editing !== null) await props.onSave({ ...base, ...otherIdPatch });
      else await props.onSave({ ...base, otherIdScheme: otherIdScheme || undefined, otherId: otherId.trim() || undefined });
      setSameNameAsk(null);
    } catch (e) {
      const message = serverMessage(e);
      // The server answers in the interface language, so its same-name sentence is matched in both.
      const sameName = message && (message.includes('أهو نفسُه') || message.includes('is it the same one?')); // i18n-exempt: matches the server's same-name message
      if (serverStatus(e) === 409 && message && sameName) {
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
          <div className="modal-title">{editing ? t('customers.modal.title_edit') : t('customers.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{t('customers.modal.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('customers.modal.name_placeholder')} />
        </div>
        <div className="field">
          <label htmlFor="customer-kind">{t('customers.modal.kind')}</label>
          <select id="customer-kind" value={kind} onChange={(e) => setKind(e.target.value as Exclude<CustomerKind, 'LEGACY_UNDECLARED'> | '')}>
            <option value="">{t('customers.modal.choose')}</option>
            <option value="NATURAL">{t('customers.modal.kind_simplified', { label: CUSTOMER_KIND_LABEL.NATURAL })}</option>
            <option value="ESTABLISHMENT">{t('customers.modal.kind_standard', { label: CUSTOMER_KIND_LABEL.ESTABLISHMENT })}</option>
            <option value="LEGAL_PERSON">{t('customers.modal.kind_standard', { label: CUSTOMER_KIND_LABEL.LEGAL_PERSON })}</option>
          </select>
          {editing?.kind === 'LEGACY_UNDECLARED' && <p className="hint">{t('customers.modal.legacy_hint')}</p>}
        </div>
        <div className="field">
          <label>{t('customers.modal.vat')}</label>
          <input className="num" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder={t('customers.modal.vat_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label htmlFor="customer-other-scheme">{t('customers.modal.other_scheme')}</label>
            <select id="customer-other-scheme" value={otherIdScheme} onChange={(e) => setOtherIdScheme(e.target.value as BuyerIdScheme | '')}>
              <option value="">{t('customers.modal.none')}</option>
              {BUYER_ID_SCHEMES.map((s) => (
                <option key={s} value={s}>
                  {BUYER_ID_SCHEME_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="customer-other-id">{t('customers.modal.other_id')}</label>
            <input
              id="customer-other-id"
              className="num"
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
              // The number is encrypted on the server: when the detail was not read it shows as "on file", and typing replaces it.
              placeholder={editing?.otherIdOnFile && editing.otherId === undefined ? t('customers.modal.other_id_on_file') : t('customers.modal.other_id_placeholder')}
            />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label htmlFor="customer-country">{t('customers.modal.country')}</label>
            <input id="customer-country" className="num" value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t('customers.modal.country_placeholder')} maxLength={2} />
          </div>
          <div className="field">
            <label>{t('customers.modal.phone')}</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('customers.modal.phone_placeholder')} />
          </div>
        </div>
        <div className="field">
          <label>{t('customers.modal.credit_limit')}</label>
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
            {t('customers.modal.cancel')}
          </button>
          {sameNameAsk ? (
            <>
              <button className="btn btn-ghost" onClick={() => setSameNameAsk(null)} disabled={saving}>
                {t('customers.modal.same_name_no')}
              </button>
              <button className="btn btn-primary" onClick={() => handleSubmit(true)} disabled={saving}>
                {editing ? t('customers.modal.same_name_yes_save') : t('customers.modal.same_name_yes_create')}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={saving}>
              {editing ? t('customers.modal.save_edit') : t('customers.modal.add')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
