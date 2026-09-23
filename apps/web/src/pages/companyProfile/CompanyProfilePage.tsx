import { useEffect, useRef, useState } from 'react';
import { getCompanyProfile, updateCompanyProfile, type CompanyProfileInput } from '../../api/companyProfile';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES, getFileDownloadUrl, uploadFile } from '../../api/files';
import { ZatcaOnboardingCard } from './ZatcaOnboardingCard';
import { useAuth } from '../../auth/AuthContext';
import i18n from '../../i18n';

const VAT_PATTERN = /^3\d{13}3$/;
const CR_PATTERN = /^\d{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
/** الرقم الإضافي أربع خانات — نفس صرامة الرمز البريدي وعند الكتابة فقط. */
const ADDITIONAL_NUMBER_PATTERN = /^\d{4}$/;
/**
 * معرّفُ النطاق الفرعيّ (`ق-١٣٠٣`) — **والخادمُ هو الحَكَم**: هذا النمطُ يقول للتاجر
 * ما الخطأ قبل الإرسال، وقيدُ `CHECK` في القاعدة هو الذي يمنع. (كما `VAT_PATTERN`.)
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

type FieldErrors = Partial<Record<keyof CompanyProfileInput, string>>;

export function CompanyProfilePage() {
  const { user } = useAuth();
  const canEdit = user?.actorType === 'COMPANY';

  const [loading, setLoading] = useState(true);
  const [legalName, setLegalName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [street, setStreet] = useState('');
  const [buildingNumber, setBuildingNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [additionalNumber, setAdditionalNumber] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  // ⚠️ **المعرّفُ يُرسَل حين يتغيّر وحده** — ولذلك تُحفظ قيمتُه المحمَّلة: منشأةٌ لم تختره
  //    بعدُ كانت سترسله `''` مع كلِّ حفظ، **فيُردّ حفظُها كلُّه** بحكم «لا يُمحى».
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
    // التطبيعُ قبل الفحص كما في الخادم — «Alfa » معرّفٌ صحيح، فلا يُردّ على التاجر ما يقصده.
    if (slug.trim() && !SLUG_PATTERN.test(slug.trim().toLowerCase())) {
      errors.slug = i18n.t('err_slug_format');
    }
    return errors;
  }

  /** ما سيُرسَل فعلاً — `null` حين لا تغيير، فلا يُرسَل الحقلُ أصلاً. */
  const slugToSend = (() => {
    const next = slug.trim().toLowerCase();
    return next && next !== savedSlug ? next : null;
  })();

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
        vatPeriod,
      });
      // **يُقرأ المعرّفُ من ردّ الخادم لا من حالة الشاشة** — فهو الذي طبّعه وقبله.
      setSlug(profile.slug ?? '');
      setSavedSlug(profile.slug ?? null);
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
          <div className="page-title">بيانات المنشأة</div>
          <div className="page-sub">البيانات القانونية والضريبية التي تظهر على الفاتورة الضريبية</div>
        </div>
        {canEdit && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              حفظ البيانات
            </button>
          </div>
        )}
      </div>

      {!canEdit && <div className="empty-state" style={{ marginBottom: 16 }}>عرض فقط — تعديل بيانات المنشأة متاح لحساب الشركة الرئيسي فقط.</div>}
      {saved && <p style={{ color: 'var(--emerald)', fontSize: 12 }}>تم حفظ البيانات بنجاح</p>}
      {formError && <p className="error-text">{formError}</p>}

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          البيانات الأساسية
        </div>
        <div className="field">
          <label>الاسم القانوني الكامل</label>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!canEdit} placeholder="مثال: شركة أفق العقارية المحدودة" />
          {fieldErrors.legalName && <p className="error-text">{fieldErrors.legalName}</p>}
        </div>
        <div className="two-col">
          <div className="field">
            <label>الرقم الضريبي (VAT)</label>
            <input className="num" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} disabled={!canEdit} placeholder="3XXXXXXXXXXXX3" />
            {fieldErrors.vatNumber && <p className="error-text">{fieldErrors.vatNumber}</p>}
          </div>
          <div className="field">
            <label>رقم السجل التجاري</label>
            <input className="num" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} disabled={!canEdit} placeholder="1234567890" />
            {fieldErrors.crNumber && <p className="error-text">{fieldErrors.crNumber}</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          معرّف النطاق الفرعي
        </div>
        <div className="field">
          <label>المعرّف</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
            <input className="num" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canEdit} placeholder="alfa" style={{ maxWidth: 220 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>.rikzapp.com</span>
          </div>
          {fieldErrors.slug && <p className="error-text">{fieldErrors.slug}</p>}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            حروف إنجليزية صغيرة وأرقام وشرطة، من ٣ إلى ٤٠ حرفاً. يُستخدم في رابط متجرك وروابط مستنداتك.
          </p>
          {/* ⚠️ التحذيرُ قبل الحفظ لا بعده — فالقديمُ يُحجز ولا يعود، ولو لصاحبه. */}
          {canEdit && savedSlug && slugToSend && (
            <p className="error-text" style={{ marginTop: 6 }}>
              سيُستبدل «{savedSlug}» بـ«{slugToSend}» — والمعرّف القديم يبقى محجوزاً ولا يعود إليك، لأن الروابط المنشورة به تظل تشير إليه.
            </p>
          )}
          {canEdit && !savedSlug && <p style={{ fontSize: 11, color: 'var(--muted)' }}>لم تختر معرّفاً بعد. يُحفظ مع «حفظ البيانات».</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          شعار المنشأة
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
              <img src={logoPreviewUrl} alt="شعار المنشأة" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>لا يوجد شعار</span>
            )}
          </div>
          <div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
              يظهر على الفاتورة الضريبية المطبوعة. الأنواع المسموحة: PDF أو صورة (JPEG/PNG/WebP)، بحد أقصى 10 ميغابايت.
            </p>
            {canEdit && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input ref={logoInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleLogoPick} style={{ display: 'none' }} />
                <button className="btn btn-ghost btn-sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                  {uploadingLogo ? 'جارٍ الرفع…' : logoFileKey ? 'استبدال الشعار' : 'رفع شعار'}
                </button>
                {logoFileKey && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setLogoFileKey('')} disabled={uploadingLogo}>
                    إزالة
                  </button>
                )}
              </div>
            )}
            {logoError && <p className="error-text">{logoError}</p>}
            {canEdit && logoFileKey && <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>اضغط «حفظ البيانات» لتثبيت التغيير.</p>}
          </div>
        </div>
      </div>

      <ZatcaOnboardingCard canEdit={canEdit} />

      {/* Lives here, in the company's own settings, rather than in a section of
          its own — it is a property of the company like its VAT number is. */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          حماية البيانات الرئيسية
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={masterDataLocked} disabled={!canEdit} onChange={(e) => setMasterDataLocked(e.target.checked)} />
          قفل العقارات والعقود — لا يعدّلها إلا المالك أو موظف مُستثنى
        </label>
        <p className="hint" style={{ marginTop: 6 }}>
          عند التفعيل تبقى القراءة والتقارير كما هي للجميع، ويُمنع فقط الإضافة والتعديل والحذف على العقارات والعقود.
          استثنِ موظفاً بعينه من شاشة «حسابات الموظفين».
        </p>
      </div>

      {/* ⑥A2 (`ق-١٣٢٥`) — الفترةُ الضريبية صفةٌ للمنشأة كرقمها الضريبيّ، فمكانُها هنا.
          ⚠️ **ولا يقلبها النظامُ آلياً**: الانتقالُ يقع بإشعارٍ من الهيئة له تاريخُ سريان
          (مادّةُ الفترة الضريبية ف٤ · ف٦) — فالنظامُ يقيس ويُنبّه في الإقرار، والتاجرُ يُعلن. */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          الفترة الضريبية
        </div>
        <div className="field" style={{ maxWidth: 320 }}>
          <label>فترة تقديم إقرار ضريبة القيمة المضافة</label>
          <select data-testid="company-vat-period" value={vatPeriod} disabled={!canEdit} onChange={(e) => setVatPeriod(e.target.value as 'QUARTERLY' | 'MONTHLY')}>
            <option value="QUARTERLY">ربع سنوية</option>
            <option value="MONTHLY">شهرية</option>
          </select>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          الفترة شهرية لمن تجاوزت توريداته الخاضعة أربعين مليون ريال خلال اثني عشر شهراً، وربع سنوية لغيره. والانتقال بينهما يقع بإشعار من
          الهيئة له تاريخ سريان — فأعلِن هنا ما أقرّته لك، ولا يغيّرها النظام من تلقائه. وشاشة الإقرار تنبّهك إن قاست توريداتك فوق الحد.
        </p>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          بيانات التواصل
        </div>
        <div className="two-col">
          <div className="field">
            <label>الجوال</label>
            <input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} placeholder="05XXXXXXXX" />
          </div>
          <div className="field">
            <label>البريد الإلكتروني</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} placeholder="info@example.com" />
            {fieldErrors.email && <p className="error-text">{fieldErrors.email}</p>}
          </div>
        </div>
        <div className="field">
          <label>الموقع الإلكتروني</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} disabled={!canEdit} placeholder="https://example.com" />
        </div>
        <div className="field">
          <label>العنوان</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEdit} placeholder="المدينة، الحي، الشارع" />
          <p className="hint">يظهر على المستندات المطبوعة. الفوترة الإلكترونية تحتاج العنوان مفصّلاً في الحقول التالية.</p>
        </div>

        {/* ZATCA reads the address from these fields, not from the line above:
            a standard (B2B) invoice is rejected without them. Kept separate
            rather than parsed out of the free-text line, because guessing
            wrong would put incorrect data on a tax document. */}
        <div className="section-title">العنوان الوطني (مطلوب للفوترة الإلكترونية)</div>
        <div className="grid-2">
          <div className="field">
            <label>الشارع</label>
            <input value={street} onChange={(e) => setStreet(e.target.value)} disabled={!canEdit} placeholder="طريق الملك فهد" />
          </div>
          <div className="field">
            <label>رقم المبنى</label>
            <input value={buildingNumber} onChange={(e) => setBuildingNumber(e.target.value)} disabled={!canEdit} placeholder="1234" />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>الحي</label>
            <input value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!canEdit} placeholder="العليا" />
          </div>
          <div className="field">
            <label>المدينة</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} disabled={!canEdit} placeholder="الرياض" />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>الرمز البريدي</label>
            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} disabled={!canEdit} placeholder="12345" />
            {fieldErrors.postalCode && <p className="error-text">{fieldErrors.postalCode}</p>}
          </div>
          <div className="field">
            <label>الرقم الإضافي</label>
            <input value={additionalNumber} onChange={(e) => setAdditionalNumber(e.target.value)} disabled={!canEdit} placeholder="1234" />
            {fieldErrors.additionalNumber && <p className="error-text">{fieldErrors.additionalNumber}</p>}
          </div>
        </div>
        <div className="field">
          <label>رقم الوحدة (شقة/مكتب)</label>
          <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} disabled={!canEdit} placeholder="12" />
          <p className="hint">بهذين الحقلين يكتمل العنوان الوطني السعودي (7 حقول) الذي تطلبه ZATCA وإيجار.</p>
        </div>
      </div>
    </div>
  );
}
