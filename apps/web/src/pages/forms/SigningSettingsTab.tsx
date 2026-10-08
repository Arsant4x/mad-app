import { useEffect, useState } from 'react';
import { getFormSigningSettings, updateFormSigningSettings, type FormSigningSettings } from '../../api/forms';
import { useAuth } from '../../auth/AuthContext';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * ⚖️ **إعدادُ التوقيع** (توجيه ٢٨٧ ② و④ · النموذجُ المرئيُّ المُقرّ، الشاشة ٢ «قوالبُ المنشأة وإعدادُ التوقيع»).
 *
 * **الفاعلُ مالكُ المنشأة** (`CLAUDE.md §3.5`: «الحدُّ يضعه التاجر، والضابطُ مالكُ المنشأة»)، وغيرُه يرى ولا يحرّر — والخادمُ يردّ الكتابةَ
 * لغيره (`403`). **المدّةُ لكلِّ نوعٍ** من أنواع قوالب المنشأة، والافتراضُ سبعةُ أيّام (`ق-١٦٣٣` ⑬)، والتذكيرُ في منتصفها وقبل نهايتها بيوم.
 * **وحدُّ نفاذ** بقيمة العقد كلِّها بعملة المنشأة (`ق-١٦٣٥` ①): فوقه لا يوقّع المستأجرُ إلا بنفاذ، وتحته نفاذٌ خيارٌ له، والفارغُ لا يشترط.
 */
export function SigningSettingsTab() {
  const { user } = useAuth();
  const isOwner = user?.actorType === 'COMPANY';
  const [settings, setSettings] = useState<FormSigningSettings | null>(null);
  const [threshold, setThreshold] = useState('');
  const [periods, setPeriods] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function adopt(s: FormSigningSettings) {
    setSettings(s);
    setThreshold(s.nafathThreshold === null ? '' : String(Number(s.nafathThreshold)));
    setPeriods(Object.fromEntries(s.types.map((t) => [t.formTypeId, String(t.signPeriodDays)])));
  }

  useEffect(() => {
    getFormSigningSettings()
      .then(adopt)
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل إعداد التوقيع')));
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const value = threshold.trim();
      const changed = settings.types.filter((t) => periods[t.formTypeId] !== String(t.signPeriodDays));
      adopt(
        await updateFormSigningSettings({
          nafathThreshold: value === '' ? null : Number(value),
          periods: changed.map((t) => ({ formTypeId: t.formTypeId, signPeriodDays: Number(periods[t.formTypeId]) })),
        }),
      );
      setSaved(true);
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر حفظ إعداد التوقيع'));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return error ? <p className="error-text">{error}</p> : null;

  return (
    <div className="card" data-testid="signing-settings">
      <div className="card-title">إعدادُ التوقيع للمنشأة</div>
      <p className="hint">
        الموظّفُ يعبّئ النموذجَ ويوقّعه، ثم يصل رابطُه للمستأجر. ومدّةُ التوقيع تبدأ عند الإرسال، ويُذكَّر المستأجرُ في منتصفها وقبل نهايتها بيوم، وانقضاؤها
        بلا توقيعٍ لا يُعدّ موافقة.
      </p>

      {error && <p className="error-text">{error}</p>}
      {saved && <p className="hint">حُفظ إعدادُ التوقيع</p>}

      <table>
        <thead>
          <tr>
            <th>نوعُ النموذج</th>
            <th>مدّةُ التوقيع (أيّام)</th>
          </tr>
        </thead>
        <tbody>
          {settings.types.length === 0 && (
            <tr>
              <td colSpan={2}>
                <div className="empty-state">لا قوالبَ للمنشأة بعد؛ انسخ قالباً من «قوالب المنشأة» لتضبط مدّتَه</div>
              </td>
            </tr>
          )}
          {settings.types.map((t) => (
            <tr key={t.formTypeId}>
              <td>
                {t.name}
                {t.isDefault && <div className="hint">الافتراض</div>}
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="num"
                  aria-label={`مدّةُ التوقيع: ${t.name}`}
                  value={periods[t.formTypeId] ?? ''}
                  disabled={!isOwner || busy}
                  onChange={(e) => setPeriods((p) => ({ ...p, [t.formTypeId]: e.target.value }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="nafath-threshold">حدُّ العقد الذي يُشترط فيه نفاذ ({settings.currency})</label>
        <input
          id="nafath-threshold"
          type="number"
          min={0}
          step="0.01"
          className="num"
          aria-label="حدُّ نفاذ"
          placeholder="فارغٌ = لا يُشترط"
          value={threshold}
          disabled={!isOwner || busy}
          onChange={(e) => setThreshold(e.target.value)}
        />
        <div className="hint">عقدٌ قيمتُه كلُّها فوق هذا الحدّ لا يوقّعه المستأجرُ إلا بعد التحقّق من هويّته عبر نفاذ، وتحته نفاذٌ خيارٌ له.</div>
      </div>

      {isOwner ? (
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          حفظ
        </button>
      ) : (
        <p className="hint">يضبط هذا الإعدادَ مالكُ المنشأة.</p>
      )}
    </div>
  );
}
