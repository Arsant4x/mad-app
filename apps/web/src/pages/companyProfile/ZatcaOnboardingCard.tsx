import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../lib/money';
import { getPosIncidents, type PosOfflineIncidents } from '../../api/pos';
import { updateCompanyProfile } from '../../api/companyProfile';
import {
  getZatcaOnboarding,
  getZatcaUnreported,
  requestZatcaProduction,
  startZatcaOnboarding,
  submitZatcaOtp,
  type ZatcaOnboarding,
  type ZatcaUnreported,
} from '../../api/zatca';
import { formatDate, formatDateTime } from '../../i18n/format';

/**
 * The merchant's whole share of e-invoicing registration.
 *
 * Everything technical — the keypair, the CSR, the certificate exchange — is
 * done by the platform on their behalf, so this screen deliberately shows
 * *progress* rather than settings: there is no endpoint to type, no key to
 * paste, and nothing to install. The single input is the OTP from the merchant's
 * own Fatoora portal, which is the one thing only they can obtain.
 */
const STEP_LABEL_KEY: Record<ZatcaOnboarding['status'], string> = {
  NOT_STARTED: 'company_profile.zatca.status_not_started',
  AWAITING_OTP: 'company_profile.zatca.status_awaiting_otp',
  COMPLIANCE_ISSUED: 'company_profile.zatca.status_compliance_issued',
  PRODUCTION_ISSUED: 'company_profile.zatca.status_production_issued',
  FAILED: 'company_profile.zatca.status_failed',
};

export function ZatcaOnboardingCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ZatcaOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  /** Issued documents not yet accepted by ZATCA; shown for linked and unlinked companies with different wording. */
  const [unreported, setUnreported] = useState<ZatcaUnreported | null>(null);
  /** Inferred offline incidents and their separation threshold, a merchant setting. */
  const [incidents, setIncidents] = useState<PosOfflineIncidents | null>(null);
  const [gapInput, setGapInput] = useState<string>('');
  const [gapSaving, setGapSaving] = useState(false);

  useEffect(() => {
    getZatcaOnboarding()
      .then(setState)
      .catch(() => setError(t('company_profile.zatca.err_read')))
      .finally(() => setLoading(false));
    getZatcaUnreported()
      .then(setUnreported)
      .catch(() => undefined);
    getPosIncidents()
      .then((r) => {
        setIncidents(r);
        setGapInput(String(r.gapMinutes));
      })
      .catch(() => undefined);
  }, []);

  /** The threshold is a setting, not a constant: saved on the company profile, and the PATCH is partial so nothing else changes. */
  async function saveGap() {
    const minutes = Number(gapInput);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setError(t('company_profile.zatca.err_gap_range'));
      return;
    }
    setGapSaving(true);
    setError(null);
    try {
      await updateCompanyProfile({ posOfflineGapMinutes: minutes });
      setIncidents(await getPosIncidents());
    } catch (e) {
      setError(serverMessage(e, t('company_profile.zatca.err_gap_save')));
    } finally {
      setGapSaving(false);
    }
  }

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
        <div className="card-title">{t('company_profile.zatca.title')}</div>
        <span className={state.status === 'PRODUCTION_ISSUED' ? 'badge paid' : 'badge'}>{t(STEP_LABEL_KEY[state.status])}</span>
      </div>

      <p className="hint">{t('company_profile.zatca.intro')}</p>

      {!state.profileComplete && <p className="error-text">{t('company_profile.zatca.profile_incomplete')}</p>}

      {error && <p className="error-text">{error}</p>}
      {state.lastError && <p className="error-text">{t('company_profile.zatca.last_error', { message: state.lastError })}</p>}

      <table>
        <thead>
          <tr>
            <th>{t('company_profile.zatca.col_step')}</th>
            <th>{t('company_profile.zatca.col_status')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('company_profile.zatca.step_keys')}</td>
            <td>{state.hasKeys ? t('company_profile.zatca.done') : '—'}</td>
          </tr>
          <tr>
            <td>{t('company_profile.zatca.step_compliance')}</td>
            <td>{state.hasComplianceCertificate ? t('company_profile.zatca.done') : '—'}</td>
          </tr>
          <tr>
            <td>{t('company_profile.zatca.step_production')}</td>
            <td>{state.hasProductionCertificate ? t('company_profile.zatca.done') : '—'}</td>
          </tr>
        </tbody>
      </table>

      {canEdit && (
        <div style={{ marginTop: 14 }}>
          {!state.hasProductionCertificate && (
            <button
              className="btn btn-primary"
              disabled={busy || !state.profileComplete}
              onClick={() => run(() => startZatcaOnboarding({ environment: state.environment }), t('company_profile.zatca.err_start'))}
            >
              {state.hasKeys ? t('company_profile.zatca.regenerate_keys') : t('company_profile.zatca.start')}
            </button>
          )}

          {state.hasKeys && !state.hasComplianceCertificate && (
            <div className="two-col" style={{ marginTop: 14 }}>
              <div className="field">
                <label>{t('company_profile.zatca.otp_label')}</label>
                <input className="num" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" />
              </div>
              <div className="field" style={{ alignSelf: 'end' }}>
                <button
                  className="btn btn-primary"
                  disabled={busy || !otp.trim()}
                  onClick={() => run(() => submitZatcaOtp(otp.trim()), t('company_profile.zatca.err_otp'))}
                >
                  {t('company_profile.zatca.send_otp')}
                </button>
              </div>
            </div>
          )}

          {state.hasComplianceCertificate && !state.hasProductionCertificate && (
            <button
              className="btn btn-primary"
              style={{ marginInlineStart: 8 }}
              disabled={busy}
              onClick={() => run(requestZatcaProduction, t('company_profile.zatca.err_production'))}
            >
              {t('company_profile.zatca.request_production')}
            </button>
          )}
        </div>
      )}

      {/* Issued but not delivered: count, oldest and list. For a linked company each one is a breach to fix; otherwise a state to know. */}
      {unreported && unreported.count > 0 && (
        <div data-testid="zatca-unreported-report" style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {t('company_profile.zatca.unreported_title', { n: unreported.count })}
            {unreported.oldestIssueDate ? t('company_profile.zatca.unreported_oldest', { date: formatDate(unreported.oldestIssueDate) }) : ''}
            {unreported.failedQueue > 0 ? t('company_profile.zatca.unreported_failed', { n: unreported.failedQueue }) : ''}
          </div>
          <p className="hint" style={{ marginBottom: 8 }}>
            {unreported.onboarded ? t('company_profile.zatca.unreported_linked') : t('company_profile.zatca.unreported_unlinked')}
          </p>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>{t('company_profile.zatca.col_no')}</th>
                <th>{t('company_profile.zatca.col_date')}</th>
                <th>{t('company_profile.zatca.col_status')}</th>
                <th>{t('company_profile.zatca.col_total')}</th>
                <th>{t('company_profile.zatca.col_last_message')}</th>
              </tr>
            </thead>
            <tbody>
              {unreported.items.slice(0, 50).map((it) => (
                <tr key={it.id}>
                  <td className="num">{it.no}</td>
                  <td className="num">{formatDate(it.issueDate)}</td>
                  <td>{it.zatcaStatus}</td>
                  <td className="num">{formatMoney(Number(it.total))}</td>
                  <td style={{ color: 'var(--muted)' }}>{it.zatcaMessage ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {unreported.items.length > 50 && <p className="hint">{t('company_profile.zatca.first_fifty', { n: unreported.count })}</p>}
        </div>
      )}

      {/* Offline incidents, inferred on the server from ring times; the inference threshold is shown with the report. */}
      {incidents && (
        <div data-testid="pos-offline-incidents" style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('company_profile.zatca.incidents_title', { n: incidents.gapMinutes })}</div>
          <p className="hint" style={{ marginBottom: 8 }}>
            {t('company_profile.zatca.incidents_hint')}
          </p>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label className="hint" htmlFor="pos-gap-minutes">{t('company_profile.zatca.gap_label')}</label>
              <input id="pos-gap-minutes" type="number" min={1} max={1440} value={gapInput} onChange={(e) => setGapInput(e.target.value)} style={{ width: 90 }} />
              <button className="btn btn-ghost btn-sm" disabled={gapSaving || busy} onClick={saveGap}>
                {t('company_profile.zatca.save')}
              </button>
            </div>
          )}
          {incidents.items.length === 0 ? (
            <p className="hint">{t('company_profile.zatca.incidents_empty')}</p>
          ) : (
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>{t('company_profile.zatca.col_from')}</th>
                  <th>{t('company_profile.zatca.col_to')}</th>
                  <th>{t('company_profile.zatca.col_duration')}</th>
                  <th>{t('company_profile.zatca.col_invoices')}</th>
                  <th>{t('company_profile.zatca.col_gap')}</th>
                </tr>
              </thead>
              <tbody>
                {incidents.items.map((it) => (
                  <tr key={it.id}>
                    <td className="num">{formatDateTime(it.startedAt)}</td>
                    <td className="num">{formatDateTime(it.endedAt)}</td>
                    <td className="num">{t('company_profile.zatca.minutes_short', { n: it.durationMinutes })}</td>
                    <td className="num">{it.salesCount}</td>
                    <td className="num">{t('company_profile.zatca.minutes_short', { n: it.gapMinutes })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
