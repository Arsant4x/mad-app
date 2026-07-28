import { useEffect, useState } from 'react';
import { getCompanyProfile, updateCompanyProfile, type CompanyProfileInput } from '../../api/companyProfile';
import { useAuth } from '../../auth/AuthContext';

const VAT_PATTERN = /^3\d{13}3$/;
const CR_PATTERN = /^\d{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      })
      .finally(() => setLoading(false));
  }, []);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!legalName.trim()) errors.legalName = 'الاسم القانوني مطلوب';
    if (vatNumber.trim() && !VAT_PATTERN.test(vatNumber.trim())) {
      errors.vatNumber = 'الرقم الضريبي يجب أن يتكوّن من 15 رقماً ويبدأ وينتهي بالرقم 3';
    }
    if (crNumber.trim() && !CR_PATTERN.test(crNumber.trim())) {
      errors.crNumber = 'رقم السجل التجاري يجب أن يتكوّن من 10 أرقام بالضبط';
    }
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'صيغة البريد الإلكتروني غير صحيحة';
    }
    return errors;
  }

  async function handleSave() {
    setSaved(false);
    setFormError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await updateCompanyProfile({
        legalName: legalName.trim(),
        vatNumber: vatNumber.trim(),
        crNumber: crNumber.trim(),
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        address: address.trim(),
      });
      setSaved(true);
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      const message = Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر حفظ بيانات المنشأة');
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
        </div>
      </div>
    </div>
  );
}
