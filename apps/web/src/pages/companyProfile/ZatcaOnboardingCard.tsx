import { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/money';
import {
  getZatcaOnboarding,
  getZatcaUnreported,
  requestZatcaProduction,
  startZatcaOnboarding,
  submitZatcaOtp,
  type ZatcaOnboarding,
  type ZatcaUnreported,
} from '../../api/zatca';

/**
 * The merchant's whole share of e-invoicing registration.
 *
 * Everything technical — the keypair, the CSR, the certificate exchange — is
 * done by the platform on their behalf, so this screen deliberately shows
 * *progress* rather than settings: there is no endpoint to type, no key to
 * paste, and nothing to install. The single input is the OTP from the merchant's
 * own Fatoora portal, which is the one thing only they can obtain.
 */
const STEP_LABEL: Record<ZatcaOnboarding['status'], string> = {
  NOT_STARTED: 'لم يبدأ',
  AWAITING_OTP: 'بانتظار رمز التحقق',
  COMPLIANCE_ISSUED: 'تم إصدار شهادة الامتثال',
  PRODUCTION_ISSUED: 'مكتمل — جاهز لإرسال الفواتير',
  FAILED: 'تعذّر الإكمال',
};

export function ZatcaOnboardingCard({ canEdit }: { canEdit: boolean }) {
  const [state, setState] = useState<ZatcaOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  /** «صادرٌ لم يصل» (ق-١٨٢/٢) — يُقرأ مع الحالة، ويُعرض للمربوطة وغيرها بصياغةٍ مختلفة. */
  const [unreported, setUnreported] = useState<ZatcaUnreported | null>(null);

  useEffect(() => {
    getZatcaOnboarding()
      .then(setState)
      .catch(() => setError('تعذّر قراءة حالة الربط'))
      .finally(() => setLoading(false));
    getZatcaUnreported()
      .then(setUnreported)
      .catch(() => undefined);
  }, []);

  function serverMessage(e: unknown, fallback: string): string {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    if (Array.isArray(data?.message)) return data.message.join(' — ');
    return data?.message ?? fallback;
  }

  async function run(action: () => Promise<ZatcaOnboarding>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      setState(await action());
    } catch (e) {
      setError(serverMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !state) return null;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">الفوترة الإلكترونية (هيئة الزكاة والضريبة والجمارك)</div>
        <span className={state.status === 'PRODUCTION_ISSUED' ? 'badge paid' : 'badge'}>{STEP_LABEL[state.status]}</span>
      </div>

      <p className="hint">
        نتولّى عنك كل الجانب التقني — توليد المفاتيح وطلب الشهادات وحفظها بشكل مشفّر. الخطوة الوحيدة المطلوبة منك هي إدخال رمز التحقق
        (OTP) من بوابة «فاتورة» الخاصة بمنشأتك.
      </p>

      {!state.profileComplete && (
        <p className="error-text">أكمل الاسم النظامي والرقم الضريبي أعلاه أولاً — الشهادة تُصدر باسم منشأتك ورقمها الضريبي.</p>
      )}

      {error && <p className="error-text">{error}</p>}
      {state.lastError && <p className="error-text">آخر خطأ من الهيئة: {state.lastError}</p>}

      <table>
        <thead>
          <tr>
            <th>الخطوة</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>١ — توليد مفاتيح المنشأة وطلب التوقيع</td>
            <td>{state.hasKeys ? '✔ تم' : '—'}</td>
          </tr>
          <tr>
            <td>٢ — شهادة الامتثال (تحتاج رمز التحقق)</td>
            <td>{state.hasComplianceCertificate ? '✔ تم' : '—'}</td>
          </tr>
          <tr>
            <td>٣ — شهادة الإنتاج (تُفعّل إرسال الفواتير)</td>
            <td>{state.hasProductionCertificate ? '✔ تم' : '—'}</td>
          </tr>
        </tbody>
      </table>

      {canEdit && (
        <div style={{ marginTop: 14 }}>
          {!state.hasProductionCertificate && (
            <button
              className="btn btn-primary"
              disabled={busy || !state.profileComplete}
              onClick={() => run(() => startZatcaOnboarding({ environment: state.environment }), 'تعذّر بدء الربط')}
            >
              {state.hasKeys ? 'إعادة توليد المفاتيح' : 'ابدأ الربط'}
            </button>
          )}

          {state.hasKeys && !state.hasComplianceCertificate && (
            <div className="two-col" style={{ marginTop: 14 }}>
              <div className="field">
                <label>رمز التحقق من بوابة فاتورة</label>
                <input className="num" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" />
              </div>
              <div className="field" style={{ alignSelf: 'end' }}>
                <button className="btn btn-primary" disabled={busy || !otp.trim()} onClick={() => run(() => submitZatcaOtp(otp.trim()), 'تعذّر إرسال رمز التحقق')}>
                  إرسال الرمز
                </button>
              </div>
            </div>
          )}

          {state.hasComplianceCertificate && !state.hasProductionCertificate && (
            <button
              className="btn btn-primary"
              style={{ marginInlineStart: 8 }}
              disabled={busy}
              onClick={() => run(requestZatcaProduction, 'تعذّر طلب شهادة الإنتاج')}
            >
              اطلب شهادة الإنتاج
            </button>
          )}
        </div>
      )}

      {/* «صادرٌ لم يصل» (ق-١٨٢/٢): عدداً وأقدمَ وقائمةً — للمربوطة مخالفةٌ تُصحَّح، ولغيرها حالٌ يُعرَف. */}
      {unreported && unreported.count > 0 && (
        <div data-testid="zatca-unreported-report" style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            صادرٌ لم يصل الهيئة: {unreported.count} مستنداً
            {unreported.oldestIssueDate ? ` — أقدمها ${new Date(unreported.oldestIssueDate).toLocaleDateString('ar-SA')}` : ''}
            {unreported.failedQueue > 0 ? ` — ${unreported.failedQueue} في الطابور استُنفدت محاولاته وتعود عند الربط` : ''}
          </div>
          <p className="hint" style={{ marginBottom: 8 }}>
            {unreported.onboarded
              ? 'المنشأة مربوطة، فكلُّ مستندٍ هنا مخالفةٌ تُتدارك بالإبلاغ — يُعاد الإرسال تلقائياً، وما رُدّ يُصحَّح ثم يُعاد.'
              : 'المنشأة غير مربوطة بعد — هذه المستندات لن تصل الهيئة حتى يتمّ الربط؛ وحين يتمّ تعود كلُّها إلى الإرسال تلقائياً.'}
          </p>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>الإجمالي</th>
                <th>آخر رسالة</th>
              </tr>
            </thead>
            <tbody>
              {unreported.items.slice(0, 50).map((it) => (
                <tr key={it.id}>
                  <td className="num">{it.no}</td>
                  <td className="num">{new Date(it.issueDate).toLocaleDateString('ar-SA')}</td>
                  <td>{it.zatcaStatus}</td>
                  <td className="num">{formatMoney(Number(it.total))}</td>
                  <td style={{ color: 'var(--muted)' }}>{it.zatcaMessage ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {unreported.items.length > 50 && <p className="hint">يُعرض أول ٥٠ من {unreported.count}.</p>}
        </div>
      )}
    </div>
  );
}
