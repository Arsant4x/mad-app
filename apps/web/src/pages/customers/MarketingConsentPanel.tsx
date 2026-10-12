import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CONSENT_SOURCES,
  MARKETING_CHANNELS,
  getMarketingConsent,
  recordMarketingConsent,
  type ConsentSource,
  type MarketingChannel,
  type MarketingConsentState,
} from '../../api/customers';
import { dfmt } from '../../lib/format';

/**
 * Marketing consent, recorded before the first message.
 *
 * The state comes from the server and is not computed here: "may I send?" has one
 * place to be decided, and a screen recomputing it would get one case wrong (a
 * withdrawal after consent), where the mistake is a message that cannot be recalled.
 *
 * The history is shown, not hidden: the regulation requires keeping the proof,
 * and proof nobody can read is no proof.
 */
const channelKey = (channel: MarketingChannel) => `customers.consent.channel.${channel.toLowerCase()}`;
const sourceKey = (source: ConsentSource) => `customers.consent.source.${source.toLowerCase()}`;

export function MarketingConsentPanel({ customerId, canRecord }: { customerId: string; canRecord: boolean }) {
  const { t } = useTranslation();
  const [state, setState] = useState<MarketingConsentState | null>(null);
  const [source, setSource] = useState<ConsentSource>('IN_PERSON');
  const [busy, setBusy] = useState<MarketingChannel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMarketingConsent(customerId).then(setState).catch(() => setState(null));
  }, [customerId]);

  async function toggle(channel: MarketingChannel, granted: boolean) {
    setError(null);
    setBusy(channel);
    try {
      await recordMarketingConsent(customerId, { channel, granted, source });
      setState(await getMarketingConsent(customerId));
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('customers.consent.err_record')));
    } finally {
      setBusy(null);
    }
  }

  if (!state) return null;

  return (
    <>
      <div className="card-title" style={{ marginBottom: 10 }}>
        {t('customers.consent.title')}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px' }}>
        {t('customers.consent.intro')}
      </p>

      {canRecord && (
        <div className="field" style={{ maxWidth: 260, marginBottom: 10 }}>
          <label>{t('customers.consent.source_label')}</label>
          <select value={source} onChange={(e) => setSource(e.target.value as ConsentSource)}>
            {CONSENT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(sourceKey(s))}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      <table style={{ marginBottom: 14 }}>
        <thead>
          <tr>
            <th>{t('customers.consent.col_channel')}</th>
            <th>{t('customers.consent.col_status')}</th>
            {canRecord && <th></th>}
          </tr>
        </thead>
        <tbody>
          {MARKETING_CHANNELS.map((channel) => {
            const verdict = state.channels[channel];
            return (
              <tr key={channel}>
                <td>{t(channelKey(channel))}</td>
                <td>
                  {verdict.allowed ? (
                    <span className="badge paid">{t('customers.consent.allowed_since', { date: dfmt(verdict.since) })}</span>
                  ) : verdict.reason === 'WITHDRAWN' ? (
                    <span className="badge overdue">{verdict.at ? t('customers.consent.withdrawn_at', { date: dfmt(verdict.at) }) : t('customers.consent.withdrawn')}</span>
                  ) : (
                    <span className="badge">{t('customers.consent.not_granted')}</span>
                  )}
                </td>
                {canRecord && (
                  <td>
                    <button className="btn btn-ghost btn-sm" disabled={busy === channel} onClick={() => toggle(channel, !verdict.allowed)}>
                      {verdict.allowed ? t('customers.consent.record_withdrawal') : t('customers.consent.record_consent')}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {state.events.length > 0 && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 12, cursor: 'pointer' }}>{t('customers.consent.history', { n: state.events.length })}</summary>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>{t('customers.consent.col_date')}</th>
                <th>{t('customers.consent.col_channel')}</th>
                <th>{t('customers.consent.col_event')}</th>
                <th>{t('customers.consent.col_source')}</th>
              </tr>
            </thead>
            <tbody>
              {state.events.map((e) => (
                <tr key={e.id}>
                  <td className="num">{dfmt(e.at)}</td>
                  <td>{t(channelKey(e.channel))}</td>
                  <td>{e.granted ? t('customers.consent.event_granted') : t('customers.consent.event_withdrawn')}</td>
                  <td>{t(sourceKey(e.source))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
