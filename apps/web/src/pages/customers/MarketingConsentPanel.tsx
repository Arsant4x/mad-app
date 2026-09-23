import { useEffect, useState } from 'react';
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
 * **الموافقةُ التسويقية — تُسجَّل قبل أوّل رسالة** (`ق-١٣٠٣` · ك/⑰A1).
 *
 * **والحالةُ من الخادم لا تُحسب هنا**: قرارُ «أيجوز أن أرسل؟» له موضعٌ واحد، وشاشةٌ تعيد
 * حسابَه تخطئ في حالةٍ واحدة (رجوعٌ بعد موافقة) **والخطأُ رسالةٌ خرجت ولا تُستردّ**.
 *
 * **والسجلُّ معروضٌ لا مخفيّ**: اللائحة (م٢٨/٣) توجب الاحتفاظ بالإثبات — **وإثباتٌ لا يُقرأ
 * ليس إثباتاً**؛ ومن يُسأل «متى وافق؟» يجد الجواب هنا لا في قاعدة البيانات.
 */
const CHANNEL_LABEL: Record<MarketingChannel, string> = { SMS: 'رسائل نصية', EMAIL: 'بريد إلكتروني', WHATSAPP: 'واتساب' };
const SOURCE_LABEL: Record<ConsentSource, string> = {
  IN_PERSON: 'شفهياً في الفرع',
  PHONE: 'عبر الهاتف',
  WEB_FORM: 'نموذج الموقع',
  WRITTEN: 'خطياً',
  IMPORTED: 'منقولة من نظام سابق',
};

export function MarketingConsentPanel({ customerId, canRecord }: { customerId: string; canRecord: boolean }) {
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
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر تسجيل الموافقة'));
    } finally {
      setBusy(null);
    }
  }

  if (!state) return null;

  return (
    <>
      <div className="card-title" style={{ marginBottom: 10 }}>
        الموافقة على الرسائل التسويقية
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px' }}>
        لا تُرسَل مواد دعائية إلا بموافقة العميل، ولكل قناة موافقتها. وله الرجوع عنها في أي وقت — ويُسجَّل الرجوع واقعةً جديدة ولا يُمحى ما قبله.
      </p>

      {canRecord && (
        <div className="field" style={{ maxWidth: 260, marginBottom: 10 }}>
          <label>كيف وصلت الموافقة</label>
          <select value={source} onChange={(e) => setSource(e.target.value as ConsentSource)}>
            {CONSENT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      <table style={{ marginBottom: 14 }}>
        <thead>
          <tr>
            <th>القناة</th>
            <th>الحالة</th>
            {canRecord && <th></th>}
          </tr>
        </thead>
        <tbody>
          {MARKETING_CHANNELS.map((channel) => {
            const verdict = state.channels[channel];
            return (
              <tr key={channel}>
                <td>{CHANNEL_LABEL[channel]}</td>
                <td>
                  {verdict.allowed ? (
                    <span className="badge paid">موافق — منذ {dfmt(verdict.since)}</span>
                  ) : verdict.reason === 'WITHDRAWN' ? (
                    <span className="badge overdue">رجع عن الموافقة{verdict.at ? ` — ${dfmt(verdict.at)}` : ''}</span>
                  ) : (
                    <span className="badge">لم يوافق</span>
                  )}
                </td>
                {canRecord && (
                  <td>
                    <button className="btn btn-ghost btn-sm" disabled={busy === channel} onClick={() => toggle(channel, !verdict.allowed)}>
                      {verdict.allowed ? 'سجّل رجوعاً' : 'سجّل موافقة'}
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
          <summary style={{ fontSize: 12, cursor: 'pointer' }}>سجل الموافقات ({state.events.length})</summary>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>القناة</th>
                <th>الواقعة</th>
                <th>المصدر</th>
              </tr>
            </thead>
            <tbody>
              {state.events.map((e) => (
                <tr key={e.id}>
                  <td className="num">{dfmt(e.at)}</td>
                  <td>{CHANNEL_LABEL[e.channel]}</td>
                  <td>{e.granted ? 'موافقة' : 'رجوع عن الموافقة'}</td>
                  <td>{SOURCE_LABEL[e.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
