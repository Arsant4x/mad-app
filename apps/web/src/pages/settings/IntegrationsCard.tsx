import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createIntegration,
  deleteIntegration,
  KIND_LABELS,
  listIntegrations,
  hasAnyProvider,
  PROVIDERS_BY_KIND,
  setIntegrationEnabled,
  type IntegrationConnection,
  type IntegrationKind,
} from '../../api/integrations';
import { ConfirmModal } from '../../components/ConfirmModal';

/**
 * Integrations, for the owner only (the keys belong to the merchant).
 * Keys are entered once and always shown masked; they are decrypted on the
 * server only at the moment the provider is called.
 */
export function IntegrationsCard() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<IntegrationKind>('PAYMENT_GATEWAY');
  // No default provider: a mock default here used to be sent and accepted even when nobody chose it.
  const [provider, setProvider] = useState('');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IntegrationConnection | null>(null);

  async function reload() {
    setConnections(await listIntegrations());
  }

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  async function handleAdd() {
    setError(null);
    if (!apiKey.trim()) {
      setError(t('settings.integrations.err_api_key_required'));
      return;
    }
    try {
      await createIntegration({
        kind,
        provider,
        label: label.trim() || undefined,
        credentials: { apiKey: apiKey.trim(), ...(merchantId.trim() ? { merchantId: merchantId.trim() } : {}) },
      });
      setAdding(false);
      setLabel('');
      setApiKey('');
      setMerchantId('');
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('settings.integrations.err_create'));
    }
  }

  async function toggle(c: IntegrationConnection) {
    setError(null);
    try {
      await setIntegrationEnabled(c.id, !c.enabled);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('settings.integrations.err_toggle'));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteIntegration(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  /**
   * The section is not rendered until a real provider exists, not even to show
   * an existing connection.
   *
   * The only option used to be a mock provider whose adapter approved every card
   * payment without collecting money, so a section offering only that is an
   * invitation to a financial hole. It comes back by itself as soon as the first
   * real provider is listed in `PROVIDERS_BY_KIND`.
   */
  if (!hasAnyProvider()) return null;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{t('settings.integrations.title')}</div>
          <div className="page-sub">{t('settings.integrations.subtitle')}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
          {t('settings.integrations.add')}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>{t('settings.integrations.col_kind')}</th>
            <th>{t('settings.integrations.col_provider')}</th>
            <th>{t('settings.integrations.col_key')}</th>
            <th>{t('settings.integrations.col_status')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {connections.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">{t('settings.integrations.empty')}</div>
              </td>
            </tr>
          )}
          {connections.map((c) => (
            <tr key={c.id}>
              <td>{KIND_LABELS[c.kind]}</td>
              <td>
                {c.provider}
                {c.label ? ` — ${c.label}` : ''}
              </td>
              <td className="num">{c.credentials.apiKey ?? '••••'}</td>
              <td>
                {c.enabled ? (
                  <span className="badge paid">{t('settings.integrations.active')}</span>
                ) : (
                  <span className="badge draft">{t('settings.integrations.inactive')}</span>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(c)}>
                  {c.enabled ? t('settings.integrations.disable') : t('settings.integrations.enable')}
                </button>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(c)}>
                  {t('settings.integrations.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding && (
        <div className="overlay" onClick={() => setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <div className="modal-title">{t('settings.integrations.modal_title')}</div>
              <button className="modal-close" onClick={() => setAdding(false)}>
                ✕
              </button>
            </div>
            <div className="field">
              <label>{t('settings.integrations.col_kind')}</label>
              <select
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as IntegrationKind;
                  setKind(k);
                  setProvider(PROVIDERS_BY_KIND[k][0]?.value ?? '');
                }}
              >
                {Object.entries(KIND_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('settings.integrations.col_provider')}</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {PROVIDERS_BY_KIND[kind].map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('settings.integrations.label_label')}</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('settings.integrations.label_placeholder')} />
            </div>
            <div className="field">
              <label>{t('settings.integrations.api_key_label')}</label>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('settings.integrations.api_key_placeholder')} />
            </div>
            <div className="field">
              <label>{t('settings.integrations.merchant_id_label')}</label>
              <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setAdding(false)}>
                {t('settings.integrations.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleAdd}>
                {t('settings.integrations.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('settings.integrations.delete_title')}
          body={t('settings.integrations.delete_body', { kind: KIND_LABELS[pendingDelete.kind] })}
          confirmLabel={t('settings.integrations.delete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
