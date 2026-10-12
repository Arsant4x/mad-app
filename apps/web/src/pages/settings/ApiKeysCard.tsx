import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiKeyUsage, createApiKey, listApiKeys, revokeApiKey, type ApiKeyRow, type UsageRow } from '../../api/apiKeys';
import { listTemplates, type PermissionTemplate } from '../../api/templates';
import { formatDate } from '../../i18n/format';

const day = (iso: string | null) => (iso ? formatDate(iso) : '—');

/**
 * System API keys, managed by the company owner only.
 *
 * The token is shown once: it is stored hashed, so no route can return it again.
 * The card says so before creation, so whoever closes the notice before copying
 * knows to create another one rather than look for it.
 */
export function ApiKeysCard() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [usage, setUsage] = useState<{ quota: number | null; period: string; rows: UsageRow[] } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [k, tpl, u] = await Promise.all([listApiKeys(), listTemplates(), apiKeyUsage()]);
    setKeys(k);
    // Templates open on every screen are not offered: the server refuses them anyway.
    setTemplates(tpl.filter((x) => !x.isAllScreens));
    setUsage(u);
  }

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const created = await createApiKey({ name: name.trim(), permissionTemplateId: templateId });
      setFresh(created.token);
      setName('');
      setTemplateId('');
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('settings.api_keys.err_create'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeApiKey(id);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('settings.api_keys.err_revoke'));
    }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{t('settings.api_keys.title')}</div>
          <div className="page-sub">{t('settings.api_keys.subtitle')}</div>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {usage && (
        <p className="page-sub" data-testid="api-usage">
          {t('settings.api_keys.usage_prefix', { period: usage.period })}
          <strong>{usage.rows.find((r) => r.period === usage.period)?.count ?? 0}</strong>
          {usage.quota === null ? t('settings.api_keys.usage_unlimited') : t('settings.api_keys.usage_of', { quota: usage.quota })}
        </p>
      )}

      {fresh && (
        <div className="card" style={{ background: 'var(--bg)', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('settings.api_keys.copy_now')}</div>
          <code data-testid="fresh-api-key" style={{ wordBreak: 'break-all', display: 'block', marginBottom: 8 }}>
            {fresh}
          </code>
          <button className="btn btn-ghost btn-sm" onClick={() => setFresh(null)}>
            {t('settings.api_keys.copied_close')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input className="input" placeholder={t('settings.api_keys.name_placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">{t('settings.api_keys.choose_template')}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" disabled={busy || name.trim().length < 2 || !templateId} onClick={submit}>
          {t('settings.api_keys.create')}
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="page-sub">{t('settings.api_keys.empty')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('settings.api_keys.col_name')}</th>
              <th>{t('settings.api_keys.col_template')}</th>
              <th>{t('settings.api_keys.col_prefix')}</th>
              <th>{t('settings.api_keys.col_last_used')}</th>
              <th>{t('settings.api_keys.col_status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>{k.permissionTemplateName}</td>
                <td>
                  <code>{`mk_${k.prefix}…`}</code>
                </td>
                <td>{day(k.lastUsedAt)}</td>
                <td>{k.revokedAt ? t('settings.api_keys.revoked', { date: day(k.revokedAt) }) : t('settings.api_keys.active')}</td>
                <td>
                  {!k.revokedAt && (
                    <button className="btn btn-ghost btn-sm" onClick={() => revoke(k.id)}>
                      {t('settings.api_keys.revoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
