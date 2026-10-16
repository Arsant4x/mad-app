import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCompanyProfile, updateCompanyProfile, type CompanyProfileInput } from '../../api/companyProfile';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES, getFileDownloadUrl, uploadFile } from '../../api/files';
import { ZatcaOnboardingCard } from './ZatcaOnboardingCard';
import { useAuth } from '../../auth/AuthContext';
import i18n from '../../i18n';

const VAT_PATTERN = /^3\d{13}3$/;
const CR_PATTERN = /^\d{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
/** The additional number is four digits, checked as strictly as the postal code, and only when filled. */
const ADDITIONAL_NUMBER_PATTERN = /^\d{4}$/;
/**
 * Subdomain slug. The server decides: this pattern tells the merchant what is
 * wrong before sending, and a database CHECK constraint is what refuses (as with `VAT_PATTERN`).
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

type FieldErrors = Partial<Record<keyof CompanyProfileInput, string>>;

export function CompanyProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = user?.actorType === 'COMPANY';

  const [loading, setLoading] = useState(true);
  const [legalName, setLegalName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // The reset link goes to the e-mail, so a change of it is sent with the current password.
  const [savedEmail, setSavedEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [street, setStreet] = useState('');
  const [buildingNumber, setBuildingNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [additionalNumber, setAdditionalNumber] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  // The slug is sent only when it changes, so the loaded value is kept: a company
  // without a slug would otherwise send '' on every save and have the whole save
  // refused, since a slug cannot be erased.
  const [slug, setSlug] = useState('');
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // The stored key is what gets saved; `logoPreviewUrl` is a short-lived signed
  // URL just for display, refetched whenever the key changes.
  const [logoFileKey, setLogoFileKey] = useState('');
  const [masterDataLocked, setMasterDataLocked] = useState(false);
  // Writing off damaged stock needs two people by default; a one-person company turns it off itself.
  const [writeOffRequiresTwoPersons, setWriteOffRequiresTwoPersons] = useState(true);
  const [vatPeriod, setVatPeriod] = useState<'QUARTERLY' | 'MONTHLY'>('QUARTERLY');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCompanyProfile()
      .then((p) => {
        setLegalName(p.legalName ?? '');
        setVatNumber(p.vatNumber ?? '');
        setCrNumber(p.crNumber ?? '');
        setPhone(p.phone ?? '');
        setEmail(p.email ?? '');
        setSavedEmail(p.email ?? '');
        setWebsite(p.website ?? '');
        setAddress(p.address ?? '');
        setStreet(p.street ?? '');
        setBuildingNumber(p.buildingNumber ?? '');
        setDistrict(p.district ?? '');
        setCity(p.city ?? '');
        setPostalCode(p.postalCode ?? '');
        setAdditionalNumber(p.additionalNumber ?? '');
        setUnitNumber(p.unitNumber ?? '');
        setLogoFileKey(p.logoFileKey ?? '');
        setSlug(p.slug ?? '');
        setSavedSlug(p.slug ?? null);
        setMasterDataLocked(p.masterDataLocked ?? false);
        setWriteOffRequiresTwoPersons(p.writeOffRequiresTwoPersons ?? true);
        setVatPeriod(p.vatPeriod ?? 'QUARTERLY');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!logoFileKey) {
      setLogoPreviewUrl(null);
      return;
    }
    let cancelled = false;
    getFileDownloadUrl(logoFileKey)
      .then((r) => {
        if (!cancelled) setLogoPreviewUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) setLogoPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [logoFileKey]);

  async function handleLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the same file still fires onChange.
    e.target.value = '';
    if (!file) return;

    setLogoError(null);
    if (file.size > MAX_FILE_BYTES) {
      setLogoError(i18n.t('err_file_too_large'));
      return;
    }

    setUploadingLogo(true);
    try {
      const uploaded = await uploadFile(file);
      // Only the key is held here — it's persisted when the form is saved, so
      // an accidental pick can still be undone by leaving without saving.
      setLogoFileKey(uploaded.key);
      setSaved(false);
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setLogoError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? i18n.t('err_logo_upload')));
    } finally {
      setUploadingLogo(false);
    }
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!legalName.trim()) errors.legalName = i18n.t('err_legal_name_required');
    if (vatNumber.trim() && !VAT_PATTERN.test(vatNumber.trim())) {
      errors.vatNumber = i18n.t('err_vat_number');
    }
    if (crNumber.trim() && !CR_PATTERN.test(crNumber.trim())) {
      errors.crNumber = i18n.t('err_cr_number');
    }
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      errors.email = i18n.t('err_email_format');
    }
    if (postalCode.trim() && !POSTAL_CODE_PATTERN.test(postalCode.trim())) {
      errors.postalCode = i18n.t('err_postal_code');
    }
    if (additionalNumber.trim() && !ADDITIONAL_NUMBER_PATTERN.test(additionalNumber.trim())) {
      errors.additionalNumber = i18n.t('err_additional_number');
    }
    // Normalize before checking, as the server does: "Alfa " is a valid slug, so the merchant is not refused for it.
    if (slug.trim() && !SLUG_PATTERN.test(slug.trim().toLowerCase())) {
      errors.slug = i18n.t('err_slug_format');
    }
    return errors;
  }

  /** What will actually be sent: `null` when unchanged, so the field is not sent at all. */
  const slugToSend = (() => {
    const next = slug.trim().toLowerCase();
    return next && next !== savedSlug ? next : null;
  })();

  const emailChanged = email.trim() !== savedEmail;

  async function handleSave() {
    setSaved(false);
    setFormError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const profile = await updateCompanyProfile({
        ...(slugToSend ? { slug: slugToSend } : {}),
        legalName: legalName.trim(),
        vatNumber: vatNumber.trim(),
        crNumber: crNumber.trim(),
        phone: phone.trim(),
        email: email.trim(),
        ...(emailChanged && currentPassword ? { currentPassword } : {}),
        website: website.trim(),
        address: address.trim(),
        street: street.trim(),
        buildingNumber: buildingNumber.trim(),
        district: district.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        additionalNumber: additionalNumber.trim(),
        unitNumber: unitNumber.trim(),
        logoFileKey,
        masterDataLocked,
        writeOffRequiresTwoPersons,
        vatPeriod,
      });
      // The slug is read from the server's answer, not from screen state: the server normalized and accepted it.
      setSlug(profile.slug ?? '');
      setSavedSlug(profile.slug ?? null);
      setSavedEmail(profile.email ?? '');
      setCurrentPassword('');
      setSaved(true);
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      const message = Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? i18n.t('err_company_profile_save'));
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('company_profile.page.title')}</div>
          <div className="page-sub">{t('company_profile.page.subtitle')}</div>
        </div>
        {canEdit && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {t('company_profile.page.save')}
            </button>
          </div>
        )}
      </div>

      {!canEdit && <div className="empty-state" style={{ marginBottom: 16 }}>{t('company_profile.page.read_only')}</div>}
      {saved && <p style={{ color: 'var(--emerald)', fontSize: 12 }}>{t('company_profile.page.saved')}</p>}
      {formError && <p className="error-text">{formError}</p>}

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          {t('company_profile.page.basic_title')}
        </div>
        <div className="field">
          <label>{t('company_profile.page.legal_name')}</label>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.legal_name_placeholder')} />
          {fieldErrors.legalName && <p className="error-text">{fieldErrors.legalName}</p>}
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('company_profile.page.vat_number')}</label>
            <input className="num" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.vat_number_placeholder')} />
            {fieldErrors.vatNumber && <p className="error-text">{fieldErrors.vatNumber}</p>}
          </div>
          <div className="field">
            <label>{t('company_profile.page.cr_number')}</label>
            <input className="num" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} disabled={!canEdit} placeholder="1234567890" />
            {fieldErrors.crNumber && <p className="error-text">{fieldErrors.crNumber}</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          {t('company_profile.page.slug_title')}
        </div>
        <div className="field">
          <label>{t('company_profile.page.slug_label')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
            <input className="num" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.slug_placeholder')} style={{ maxWidth: 220 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('company_profile.page.slug_domain')}</span>
          </div>
          {fieldErrors.slug && <p className="error-text">{fieldErrors.slug}</p>}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            {t('company_profile.page.slug_hint')}
          </p>
          {/* Warn before saving, not after: the old slug stays reserved and never returns, even to its owner. */}
          {canEdit && savedSlug && slugToSend && (
            <p className="error-text" style={{ marginTop: 6 }}>
              {t('company_profile.page.slug_replace', { old: savedSlug, next: slugToSend })}
            </p>
          )}
          {canEdit && !savedSlug && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{t('company_profile.page.slug_none')}</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          {t('company_profile.page.logo_title')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 8,
              border: '1px dashed var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {logoPreviewUrl ? (
              <img src={logoPreviewUrl} alt={t('company_profile.page.logo_title')} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('company_profile.page.no_logo')}</span>
            )}
          </div>
          <div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
              {t('company_profile.page.logo_hint')}
            </p>
            {canEdit && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input ref={logoInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleLogoPick} style={{ display: 'none' }} />
                <button className="btn btn-ghost btn-sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                  {uploadingLogo
                    ? t('company_profile.page.uploading')
                    : logoFileKey
                      ? t('company_profile.page.replace_logo')
                      : t('company_profile.page.upload_logo')}
                </button>
                {logoFileKey && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setLogoFileKey('')} disabled={uploadingLogo}>
                    {t('company_profile.page.remove')}
                  </button>
                )}
              </div>
            )}
            {logoError && <p className="error-text">{logoError}</p>}
            {canEdit && logoFileKey && <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{t('company_profile.page.save_to_apply')}</p>}
          </div>
        </div>
      </div>

      <ZatcaOnboardingCard canEdit={canEdit} />

      {/* Lives here, in the company's own settings, rather than in a section of
          its own — it is a property of the company like its VAT number is. */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          {t('company_profile.page.protection_title')}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={masterDataLocked} disabled={!canEdit} onChange={(e) => setMasterDataLocked(e.target.checked)} />
          {t('company_profile.page.lock_label')}
        </label>
        <p className="hint" style={{ marginTop: 6 }}>
          {t('company_profile.page.lock_hint')}
        </p>
        {/* Two people by default; a one-person company turns it off here. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', marginTop: 14 }}>
          <input
            type="checkbox"
            data-testid="company-writeoff-two-persons"
            style={{ width: 'auto' }}
            checked={writeOffRequiresTwoPersons}
            disabled={!canEdit}
            onChange={(e) => setWriteOffRequiresTwoPersons(e.target.checked)}
          />
          {t('company_profile.page.writeoff_label')}
        </label>
        <p className="hint" style={{ marginTop: 6 }}>
          {t('company_profile.page.writeoff_hint')}
        </p>
      </div>

      {/* The VAT period is a property of the company like its VAT number, so it lives here.
          The system never switches it by itself: the change takes effect by a notice from
          ZATCA with its own effective date, so the system measures and warns on the return,
          and the merchant declares. */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          {t('company_profile.page.vat_period_title')}
        </div>
        <div className="field" style={{ maxWidth: 320 }}>
          <label>{t('company_profile.page.vat_period_label')}</label>
          <select data-testid="company-vat-period" value={vatPeriod} disabled={!canEdit} onChange={(e) => setVatPeriod(e.target.value as 'QUARTERLY' | 'MONTHLY')}>
            <option value="QUARTERLY">{t('company_profile.page.quarterly')}</option>
            <option value="MONTHLY">{t('company_profile.page.monthly')}</option>
          </select>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {t('company_profile.page.vat_period_hint')}
        </p>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          {t('company_profile.page.contact_title')}
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('company_profile.page.phone')}</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.phone_placeholder')} />
          </div>
          <div className="field">
            <label>{t('company_profile.page.email')}</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.email_placeholder')} />
            {fieldErrors.email && <p className="error-text">{fieldErrors.email}</p>}
            <p className="hint">{t('company_profile.page.email_hint')}</p>
          </div>
        </div>
        {canEdit && emailChanged && (
          <div className="field">
            <label htmlFor="profile-current-password">{t('company_profile.page.current_password')}</label>
            <input id="profile-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <p className="hint">{t('company_profile.page.current_password_hint')}</p>
          </div>
        )}
        <div className="field">
          <label>{t('company_profile.page.website')}</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.website_placeholder')} />
        </div>
        <div className="field">
          <label>{t('company_profile.page.address')}</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.address_placeholder')} />
          <p className="hint">{t('company_profile.page.address_hint')}</p>
        </div>

        {/* ZATCA reads the address from these fields, not from the line above:
            a standard (B2B) invoice is rejected without them. Kept separate
            rather than parsed out of the free-text line, because guessing
            wrong would put incorrect data on a tax document. */}
        <div className="section-title">{t('company_profile.page.national_address_title')}</div>
        <div className="grid-2">
          <div className="field">
            <label>{t('company_profile.page.street')}</label>
            <input value={street} onChange={(e) => setStreet(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.street_placeholder')} />
          </div>
          <div className="field">
            <label>{t('company_profile.page.building_number')}</label>
            <input value={buildingNumber} onChange={(e) => setBuildingNumber(e.target.value)} disabled={!canEdit} placeholder="1234" />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>{t('company_profile.page.district')}</label>
            <input value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.district_placeholder')} />
          </div>
          <div className="field">
            <label>{t('company_profile.page.city')}</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} disabled={!canEdit} placeholder={t('company_profile.page.city_placeholder')} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('company_profile.page.postal_code')}</label>
            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} disabled={!canEdit} placeholder="12345" />
            {fieldErrors.postalCode && <p className="error-text">{fieldErrors.postalCode}</p>}
          </div>
          <div className="field">
            <label>{t('company_profile.page.additional_number')}</label>
            <input value={additionalNumber} onChange={(e) => setAdditionalNumber(e.target.value)} disabled={!canEdit} placeholder="1234" />
            {fieldErrors.additionalNumber && <p className="error-text">{fieldErrors.additionalNumber}</p>}
          </div>
        </div>
        <div className="field">
          <label>{t('company_profile.page.unit_number')}</label>
          <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} disabled={!canEdit} placeholder="12" />
          <p className="hint">{t('company_profile.page.unit_number_hint')}</p>
        </div>
      </div>
    </div>
  );
}
