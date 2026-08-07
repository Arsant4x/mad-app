import { useEffect, useState } from 'react';
import {
  createIntegration,
  deleteIntegration,
  KIND_LABELS,
  listIntegrations,
  PROVIDERS_BY_KIND,
  setIntegrationEnabled,
  type IntegrationConnection,
  type IntegrationKind,
} from '../../api/integrations';
import { ConfirmModal } from '../../components/ConfirmModal';

/**
 * الربط والتكاملات — للمالك وحده (المفاتيح ملك التاجر، قاعدة الفاعل §3.5).
 * المفاتيح تُدخل مرة وتُعرض مقنَّعة للأبد؛ فكّها يحدث في الخادم لحظة
 * استدعاء المزوّد فقط.
 */
export function IntegrationsCard() {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<IntegrationKind>('PAYMENT_GATEWAY');
  const [provider, setProvider] = useState('MOCK');
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
      setError('مفتاح API مطلوب.');
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
      setError(d?.message ?? 'تعذّر إنشاء الربط');
    }
  }

  async function toggle(c: IntegrationConnection) {
    setError(null);
    try {
      await setIntegrationEnabled(c.id, !c.enabled);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر تغيير الحالة');
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteIntegration(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">الربط والتكاملات</div>
          <div className="page-sub">بوابات الدفع والتقسيط والمتاجر — المفاتيح تُخزَّن مشفّرة وتُعرض مقنَّعة</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
          + ربط جديد
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>النوع</th>
            <th>المزوّد</th>
            <th>المفتاح</th>
            <th>الحالة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {connections.length === 0 && (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">لا يوجد ربط بعد — عند توفر مفاتيح مزوّدك الحقيقي يُوصَل من هنا بلا تطوير إضافي</div>
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
              <td>{c.enabled ? <span className="badge paid">فعّال</span> : <span className="badge draft">معطَّل</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(c)}>
                  {c.enabled ? 'تعطيل' : 'تفعيل'}
                </button>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(c)}>
                  حذف
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
              <div className="modal-title">ربط مزوّد</div>
              <button className="modal-close" onClick={() => setAdding(false)}>
                ✕
              </button>
            </div>
            <div className="field">
              <label>النوع</label>
              <select
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as IntegrationKind;
                  setKind(k);
                  setProvider(PROVIDERS_BY_KIND[k][0]?.value ?? 'MOCK');
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
              <label>المزوّد</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {PROVIDERS_BY_KIND[kind].map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>تسمية (اختياري)</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: جهاز الفرع الرئيسي" />
            </div>
            <div className="field">
              <label>مفتاح API</label>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            </div>
            <div className="field">
              <label>معرّف التاجر (اختياري)</label>
              <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setAdding(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={handleAdd}>
                حفظ الربط
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="حذف الربط"
          body={`حذف ربط "${KIND_LABELS[pendingDelete.kind]}"؟ ستتوقف العمليات عبر هذا المزوّد فوراً.`}
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
