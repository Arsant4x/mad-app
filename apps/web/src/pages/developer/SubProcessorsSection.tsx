import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConsentOverview, publishConsentVersion, retireSubProcessor, upsertSubProcessor, type ConsentOverview } from '../../api/consent';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

/**
 * The sub-processor list and its published versions.
 *
 * Publishing is an event, not an edit: changing a row binds nobody until a version is published with
 * its notice period, and that version becomes the text merchants are asked to accept. Without it the
 * list would be an announcement, not consent.
 *
 * The server rejects a short notice period, not this screen; it is shown here so the publisher reads
 * it before being refused.
 */
export function SubProcessorsSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<ConsentOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', purpose: '', location: '', dataCategories: '' });
  const [summary, setSummary] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [publishing, setPublishing] = useState(false);

  async function reload() {
    setData(await getConsentOverview());
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? fallback);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const active = data.subProcessors.filter((s) => !s.removedAt);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div className="card-title">{t('developer.sub_processors.title')}</div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>{t('developer.sub_processors.col_processor')}</th>
            <th>{t('developer.sub_processors.col_purpose')}</th>
            <th>{t('developer.sub_processors.col_location')}</th>
            <th>{t('developer.sub_processors.col_categories')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.subProcessors.map((s) => (
            <tr key={s.id} style={s.removedAt ? { opacity: 0.55 } : undefined}>
              <td>{s.name}</td>
              <td>{s.purpose}</td>
              <td>{s.location}</td>
              <td>{s.dataCategories.join(' · ')}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {s.removedAt ? (
                  <span className="hint">{t('developer.sub_processors.removed_on', { date: dfmt(s.removedAt) })}</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => retireSubProcessor(s.id), t('developer.sub_processors.err_retire'))}>
                    {t('developer.sub_processors.retire')}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {data.subProcessors.length === 0 && (
            <tr>
              <td colSpan={5} className="hint">{t('developer.sub_processors.empty')}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="field-row" style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder={t('developer.sub_processors.ph_name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder={t('developer.sub_processors.ph_purpose')} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        <input placeholder={t('developer.sub_processors.ph_location')} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <input placeholder={t('developer.sub_processors.ph_categories')} value={form.dataCategories} onChange={(e) => setForm({ ...form, dataCategories: e.target.value })} />
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy || !form.name.trim() || !form.location.trim()}
          onClick={() =>
            run(
              () =>
                upsertSubProcessor({
                  name: form.name.trim(),
                  purpose: form.purpose.trim(),
                  location: form.location.trim(),
                  dataCategories: form.dataCategories.split(',').map((s) => s.trim()).filter(Boolean),
                }).then(() => setForm({ name: '', purpose: '', location: '', dataCategories: '' })),
              t('developer.sub_processors.err_add'),
            )
          }
        >
          {t('developer.sub_processors.add')}
        </button>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>{t('developer.sub_processors.publish_title')}</div>
        <p className="hint">
          {t('developer.sub_processors.publish_hint_lead', { n: active.length })}
          <strong> {t('developer.sub_processors.publish_hint_notice', { n: data.noticeDays })}</strong> {t('developer.sub_processors.publish_hint_tail')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder={t('developer.sub_processors.ph_summary')} value={summary} onChange={(e) => setSummary(e.target.value)} style={{ minWidth: 280 }} />
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy || summary.trim().length < 5 || !effectiveFrom} onClick={() => setPublishing(true)}>
            {t('developer.sub_processors.publish')}
          </button>
        </div>

        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>{t('developer.sub_processors.col_version')}</th>
              <th>{t('developer.sub_processors.col_published')}</th>
              <th>{t('developer.sub_processors.col_effective')}</th>
              <th>{t('developer.sub_processors.col_changed')}</th>
              <th>{t('developer.sub_processors.col_accepted')}</th>
            </tr>
          </thead>
          <tbody>
            {data.versions.map((v) => (
              <tr key={v.version}>
                <td className="num">{v.version}</td>
                <td className="num">{dfmt(v.publishedAt)}</td>
                <td className="num">{dfmt(v.effectiveFrom)}</td>
                <td>{v.summary}</td>
                <td className="num">{data.acceptances[String(v.version)] ?? 0}</td>
              </tr>
            ))}
            {data.versions.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">{t('developer.sub_processors.no_versions')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {publishing && (
        <ConfirmModal
          title={t('developer.sub_processors.confirm_title')}
          body={t('developer.sub_processors.confirm_body', { n: active.length, date: effectiveFrom })}
          confirmLabel={t('developer.sub_processors.confirm')}
          onConfirm={() => {
            setPublishing(false);
            return run(() => publishConsentVersion(summary.trim(), new Date(effectiveFrom).toISOString()).then(() => { setSummary(''); setEffectiveFrom(''); }), t('developer.sub_processors.err_publish'));
          }}
          onCancel={() => setPublishing(false)}
        />
      )}
    </div>
  );
}
