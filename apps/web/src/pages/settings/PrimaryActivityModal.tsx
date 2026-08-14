import { useEffect, useState } from 'react';
import { previewPrimaryActivity, setPrimaryActivity, type Activity, type ScreenChangePreview } from '../../api/activities';
import { usePermissions } from '../../auth/PermissionsContext';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * تأكيد تغيير النشاط الرئيسي — **يعرض ما سيختفي بالاسم قبل أن يقع**.
 *
 * ## لماذا نافذةٌ لا زرّ
 *
 * تغيير النشاط الرئيسي يغيّر ما يراه **كل موظف** في المنشأة. ونقرةٌ واحدة
 * تُخفي أربع شاشات بلا أن يرى أحدٌ ماذا اختفى تجعل المالك يكتشف الأثر من
 * شكوى موظف — لا من قراره هو.
 *
 * ⚠️ **والخادم يفرضها لا يجاملها**: `PATCH /activities/primary` يرفض بلا
 * `confirmed`. فالواجهة **مضطرّةٌ** لعرض المعاينة — لا مخيَّرة. وحارسٌ في
 * الخادم يمنع أن يصير العلَم اختيارياً.
 *
 * ## والقائمة من الخادم لا من هنا
 *
 * `willHide` محسوبةٌ هناك بأسمائها العربية. واشتقاقُها في الواجهة نسخةٌ
 * ثانية من الخريطة تفترق عند أول تعديل — فيُعرض للمالك أثرٌ غير الذي يقع.
 */
export function PrimaryActivityModal({
  activity,
  onDone,
  onCancel,
}: {
  /** `null` يعني **التراجع**: إطفاء الترشيح وإعادة كل الشاشات. */
  activity: Activity | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { refresh } = usePermissions();
  const [preview, setPreview] = useState<ScreenChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    previewPrimaryActivity(activity?.id ?? null)
      .then(setPreview)
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر حساب أثر التغيير')));
  }, [activity]);

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      await setPrimaryActivity(activity?.id ?? null);
      // الصلاحيات تُقرأ حيّةً — والشاشات تتغيّر فوراً بلا إعادة دخول.
      refresh();
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر تغيير النشاط الرئيسي'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="تأكيد النشاط الرئيسي">
        <div className="modal-head">
          <div className="modal-title">{activity ? `اجعل «${activity.name}» النشاط الرئيسي` : 'إلغاء الترشيح — إظهار كل الشاشات'}</div>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {!preview && !error && <p>جارٍ حساب الأثر…</p>}

        {preview && (
          <>
            {preview.willHide.length === 0 && preview.willShow.length === 0 && (
              <p className="muted" data-testid="primary-no-change">لا تتغيّر أي شاشة.</p>
            )}

            {preview.willHide.length > 0 && (
              <div className="field">
                {/* ⭐ **بالاسم لا بالعدد**: «ستُخفى 4 شاشات» لا يُمكّن المالك
                  * من الحكم — قد تكون الأربع بلا قيمة، وقد تكون فيها واحدة
                  * يعمل عليها نصف موظفيه. */}
                <label className="error" data-testid="will-hide-count">
                  ستُخفى {preview.willHide.length} شاشات:
                </label>
                <ul data-testid="will-hide">
                  {preview.willHide.map((s) => (
                    <li key={s.screen} data-testid={`hide-${s.screen}`}>{s.label}</li>
                  ))}
                </ul>
                <p className="hint">
                  ⚠️ الشاشات تختفي و<strong>البيانات تبقى كما هي</strong> — ولا يُحذف صفٌّ واحد. ويمكن التراجع في أي وقت.
                </p>
              </div>
            )}

            {preview.willShow.length > 0 && (
              <div className="field">
                <label data-testid="will-show-count">ستظهر {preview.willShow.length} شاشات:</label>
                <ul data-testid="will-show">
                  {preview.willShow.map((s) => (
                    <li key={s.screen} data-testid={`show-${s.screen}`}>{s.label}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="muted">
              الشاشات المتاحة: {preview.currentCount} ← {preview.nextCount}
            </p>

            <div className="modal-actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={apply} data-testid="primary-confirm">
                تأكيد
              </button>
              <button type="button" onClick={onCancel} disabled={saving}>إلغاء</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
