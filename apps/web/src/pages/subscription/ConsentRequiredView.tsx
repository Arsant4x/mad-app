import { useState } from 'react';
import { acceptConsent, type ConsentState } from '../../api/consent';
import { exportAllData } from '../../api/subscription';
import { ConfirmModal } from '../../components/ConfirmModal';
import { DeletionRequestCard } from './DeletionRequestCard';
import { dfmt } from '../../lib/format';

/**
 * ⭐ **اختيارٌ لا حجب** (`ق-٥٨٩`): ليست شاشةَ منعٍ بل شاشةَ قرار — **«الخدمةُ صارت تقتضي
 * هذا: اقبل، أو خذ بياناتك واخرج»**.
 *
 * ⚠️ **ولا زرَّ واحدٌ فيها**: **ثلاثةٌ معاً** — «أوافق» · «نزّل بياناتي» · «أغلق حسابي».
 * **فشاشةٌ بخيارٍ واحدٍ حجبٌ لا اختيار**، وهو الشرطُ الثالث بنصّه.
 *
 * ⚠️ **والقائمةُ تُعرض كاملةً بمواقعها** — فالموافقةُ على نصٍّ يُقرأ لا على عنوانٍ يُصدَّق.
 */
export function ConsentRequiredView({ state, onAccepted, onLogout }: { state: ConsentState; onAccepted: (next: ConsentState) => void; onLogout: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exiting, setExiting] = useState(false);
  const list = state.current;

  /** «نزّل بياناتي» — **مسارٌ يعمل هنا لا وعدٌ في نصّ**: المسارُ نفسُه الذي في صفحة الاشتراك. */
  async function download() {
    setError(null);
    setBusy(true);
    try {
      const data = await exportAllData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `mad-app-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر تصدير البيانات');
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (state.requiredVersion === null) return;
    setError(null);
    setBusy(true);
    try {
      onAccepted(await acceptConsent(state.requiredVersion));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر تسجيل موافقتك');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 760, margin: '40px auto' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>تغيّرت قائمةُ من يعالج بياناتك — وقرارُك مطلوب</div>
      <p>
        نستعين بمزوّدين لتشغيل الخدمة (تخزينٌ ونسخٌ احتياطيّ وما شابه)، وهم «معالجون فرعيون» لبياناتك.
        <strong> والنظامُ يوجب موافقتك قبل ذلك</strong>، فأنت جهةُ التحكم في بيانات عملائك ونحن نعالجها نيابةً عنك.
      </p>
      {list && (
        <p className="hint">
          النسخة {list.version} — نُشرت في {dfmt(list.publishedAt)} وسرت في {dfmt(list.effectiveFrom)} (بمهلة {state.noticeDays} يوماً معلَنة). {list.summary}
        </p>
      )}

      {list && list.entries.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>المعالج</th>
              <th>الغرض</th>
              <th>الموقع</th>
              <th>فئاتُ البيانات</th>
            </tr>
          </thead>
          <tbody>
            {list.entries.map((e) => (
              <tr key={e.name}>
                <td>{e.name}</td>
                <td>{e.purpose}</td>
                <td>{e.location}</td>
                <td>{e.dataCategories.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: 14 }}>
        <strong>وأمامك ثلاثةٌ — وكلُّها مفتوحةٌ الآن:</strong> أن تقبل فتعود الخدمة كما كانت، أو تنزّل نسخةً كاملة من بياناتك، أو تطلب إغلاق حسابك.
        والتصديرُ وطلبُ الإغلاق يعملان في هذه الشاشة، فلا تُحبس داخل حسابك.
      </p>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirming(true)}>
          أوافق على القائمة
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={download}>
          نزّل بياناتي
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setExiting((v) => !v)}>
          أغلق حسابي
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          تسجيل الخروج
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

      {/* ⭐ ومسارُ الإغلاق **نفسُه** لا نسخةٌ منه — فبطاقةٌ واحدةٌ تحكم الطلبَ أينما عُرضت. */}
      {exiting && <DeletionRequestCard />}

      {confirming && (
        <ConfirmModal
          title="الموافقة على قائمة المعالجين الفرعيين"
          body={`ستُسجَّل موافقتك على النسخة ${state.requiredVersion ?? ''} من القائمة باسمك وتاريخها، ويعود عملُ الحساب كما كان. هل تريد المتابعة؟`}
          confirmLabel="نعم، أوافق"
          onConfirm={() => {
            setConfirming(false);
            return accept();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
