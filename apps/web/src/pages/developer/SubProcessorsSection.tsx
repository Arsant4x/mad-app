import { useEffect, useState } from 'react';
import { getConsentOverview, publishConsentVersion, retireSubProcessor, upsertSubProcessor, type ConsentOverview } from '../../api/consent';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

/**
 * قائمةُ المعالجين الفرعيين ونشرُ نسخها (`ق-٥٨١` · `ق-٥٨٩`).
 *
 * ⚠️ **والنشرُ حدثٌ لا تحرير**: تعديلُ صفٍّ في القائمة **لا يُلزم أحداً** — حتى تُنشَر
 * نسخةٌ بمهلتها، فتصير هي النصَّ الذي تُطلب الموافقةُ عليه. **وبلا ذلك تصير القائمةُ
 * إعلاناً لا موافقة.**
 *
 * ⛔ **والمهلةُ يرفضها الخادمُ لا هذه الشاشة** — وهي هنا مكتوبةٌ ليقرأها الناشر قبل أن يُردّ.
 */
export function SubProcessorsSection() {
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
        <div className="card-title">المعالجون الفرعيون وموافقةُ التجّار</div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>المعالج</th>
            <th>الغرض</th>
            <th>الموقع</th>
            <th>فئاتُ البيانات</th>
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
                  <span className="hint">رُفع في {dfmt(s.removedAt)}</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => retireSubProcessor(s.id), 'تعذّر رفعُه من القائمة')}>
                    ارفعه من القائمة
                  </button>
                )}
              </td>
            </tr>
          ))}
          {data.subProcessors.length === 0 && (
            <tr>
              <td colSpan={5} className="hint">لا معالجَ فرعياً مسجَّلاً بعد.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="field-row" style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="الغرض" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        <input placeholder="الموقع الجغرافيّ" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <input placeholder="فئاتُ البيانات (مفصولةٌ بفاصلة)" value={form.dataCategories} onChange={(e) => setForm({ ...form, dataCategories: e.target.value })} />
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
              'تعذّرت الإضافة',
            )
          }
        >
          أضف معالجاً
        </button>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>نشرُ نسخةٍ جديدة — وموافقةُ التجّار تُطلب عليها</div>
        <p className="hint">
          النشرُ يلتقط القائمةَ الحالية ({active.length} معالجاً) نصّاً ثابتاً، ويُشعر كلَّ تاجرٍ لم يقبلها.
          <strong> ومهلةُ السريان {data.noticeDays} يوماً على الأقلّ</strong> — وما دونها يرفضه الخادم.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="ما الذي تغيّر — بلغة التاجر" value={summary} onChange={(e) => setSummary(e.target.value)} style={{ minWidth: 280 }} />
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy || summary.trim().length < 5 || !effectiveFrom} onClick={() => setPublishing(true)}>
            انشر النسخة
          </button>
        </div>

        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>النسخة</th>
              <th>نُشرت</th>
              <th>تسري</th>
              <th>ما تغيّر</th>
              <th>قبِلها</th>
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
                <td colSpan={5} className="hint">لا نسخةَ منشورةً بعد — فلا موافقةَ مطلوبةٌ من أحد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {publishing && (
        <ConfirmModal
          title="نشرُ نسخةٍ من قائمة المعالجين الفرعيين"
          body={`ستُنشر النسخةُ بـ${active.length} معالجاً وتسري في ${effectiveFrom}. ويُشعَر كلُّ تاجرٍ الآن، ويُذكَّر قبل السريان — ومن لم يقبل بعد السريان يُمنع حتى يقبل أو ينزّل بياناته ويُغلق حسابه. هل تريد النشر؟`}
          confirmLabel="انشر"
          onConfirm={() => {
            setPublishing(false);
            return run(() => publishConsentVersion(summary.trim(), new Date(effectiveFrom).toISOString()).then(() => { setSummary(''); setEffectiveFrom(''); }), 'تعذّر النشر');
          }}
          onCancel={() => setPublishing(false)}
        />
      )}
    </div>
  );
}
