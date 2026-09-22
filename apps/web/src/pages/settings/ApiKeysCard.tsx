import { useEffect, useState } from 'react';
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyRow } from '../../api/apiKeys';
import { listTemplates, type PermissionTemplate } from '../../api/templates';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-SA') : '—');

/**
 * **مفاتيحُ الأنظمة** (`ق-١٢٩١` · ي/⑫A3) — بيد **مالك المنشأة** وحدَه (قاعدةُ الفاعل `§3.5`).
 *
 * ⚠️ **والرمزُ يُعرَض مرّةً واحدة**: لا يُخزَّن عندنا إلا مهشَّماً، فلا مسارَ يُعيده.
 * والبطاقةُ تقول ذلك **قبل** الإنشاء لا بعده — فمن أغلق النافذة قبل أن ينسخه يعرف
 * أن عليه إنشاءَ غيره، ولا يبحث عمّا لا يوجد.
 */
export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [k, t] = await Promise.all([listApiKeys(), listTemplates()]);
    setKeys(k);
    // **القوالبُ المفتوحة على كلِّ الشاشات لا تُعرض** — الخادمُ يردّها، والشاشةُ لا تغري بها.
    setTemplates(t.filter((x) => !x.isAllScreens));
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
      setError(d?.message ?? 'تعذّر إنشاء المفتاح');
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
      setError(d?.message ?? 'تعذّر إبطال المفتاح');
    }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">مفاتيح الأنظمة</div>
          <div className="page-sub">
            تُعطى لنظام خارجي يتصل ببياناتك — بصلاحيات القالب الذي تختاره وحده. والمفتاح يُعرض مرة واحدة عند إنشائه، فانسخه قبل إغلاق الرسالة.
          </div>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {fresh && (
        <div className="card" style={{ background: 'var(--bg)', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>انسخ المفتاح الآن — لن يُعرض مرة أخرى</div>
          <code data-testid="fresh-api-key" style={{ wordBreak: 'break-all', display: 'block', marginBottom: 8 }}>
            {fresh}
          </code>
          <button className="btn btn-ghost btn-sm" onClick={() => setFresh(null)}>
            نسختُه — أغلِق
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input className="input" placeholder="اسم المفتاح — مثل: متجرنا الإلكتروني" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">اختر قالب الصلاحيات…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" disabled={busy || name.trim().length < 2 || !templateId} onClick={submit}>
          إنشاء مفتاح
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="page-sub">لا مفاتيح بعد.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>القالب</th>
              <th>البادئة</th>
              <th>آخر استعمال</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>{k.permissionTemplateName}</td>
                <td>
                  <code>mk_{k.prefix}…</code>
                </td>
                <td>{day(k.lastUsedAt)}</td>
                <td>{k.revokedAt ? `مُبطَل ${day(k.revokedAt)}` : 'ساري'}</td>
                <td>
                  {!k.revokedAt && (
                    <button className="btn btn-ghost btn-sm" onClick={() => revoke(k.id)}>
                      إبطال
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
