import { useEffect, useMemo, useState } from 'react';
import { ALLOWED_SCREENS, SCREEN_ACTIONS, SCREEN_LABELS, ACTION_LABELS } from '../../api/templates';
import { createDelegation, getDelegationView, revokeDelegation, type DelegationView } from '../../api/delegations';
import { usePermissions, type ExtinctionReason } from '../../auth/PermissionsContext';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * شجرة التفويض — **مفتوحةٌ من الموظف لا من شاشة مستقلة**.
 *
 * السبب: التفويض **علاقة بين شخصين** لا إعداد نظام. وشاشةٌ مستقلة تسأل
 * أولاً «لمن؟» — أي تعيد بناء قائمة الموظفين التي يقف المستخدم فيها أصلاً.
 *
 * ## الحالات الثلاث — ولماذا لا تكفي حالتان
 *
 * | الحالة | العرض | لماذا |
 * |---|---|---|
 * | يملكها المفوِّض ولم تُمنح | مربّع فارغ | متاحةٌ للمنح |
 * | مُنحت ونافذة | مربّع مُعلَّم | نافذة الآن |
 * | **مُنحت وانطفأت** | مُعلَّم **بشطب** + السبب | لا يجوز إخفاؤها |
 *
 * والثالثة أهمّها: التقاطع يُطفئ منحةً **دون أن يمسّ صفّها**. فلو عُرضت
 * «غير ممنوحة» لظنّ المفوِّض أنه لم يمنح، فمنح مرةً أخرى **بلا أثر** —
 * لأن العطب فوقه لا عنده. ولا رسالة خطأ في أيٍّ من المرّات: كل منحةٍ نجحت
 * فعلاً، والتقاطع أطفأها بعدها.
 *
 * ## وما لا يملكه المفوِّض لا يُعرض إطلاقاً
 *
 * لا رمادياً ولا معطَّلاً. عرضُه يدعو لمحاولةٍ يرفضها الخادم، ورفضٌ بلا
 * سببٍ مفهوم أسوأ من الغياب. والترشيح يأتي من `grantable` **محسوباً في
 * الخادم** — والواجهة تعرضه ولا تشتقّه.
 *
 * ⚠️ وهذا **عرضٌ لا منع**: `DelegationsService.grant` يفحص السقف على كل
 * منحة، وحارسٌ يطرق النقطة بلا متصفح يثبت ذلك.
 */

const REASON_TEXT: Record<ExtinctionReason, string> = {
  NOT_IN_ROOT: 'لم تعد في قالب الصلاحيات',
  REVOKED: 'سُحبت من فوقك',
  NARROWED: 'لا يملكها من فوقك',
};

interface Props {
  granteeId: string;
  granteeName: string;
  onClose: () => void;
}

export function DelegationModal({ granteeId, granteeName, onClose }: Props) {
  const { refresh } = usePermissions();
  const [view, setView] = useState<DelegationView | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getDelegationView(granteeId)
      .then((v) => {
        setView(v);
        setPicked(new Set());
      })
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل التفويض')));
  };

  useEffect(load, [granteeId]);

  const grantable = useMemo(() => new Set(view?.grantable ?? []), [view]);
  const active = useMemo(() => new Set(view?.active ?? []), [view]);
  const extinguished = useMemo(() => new Map((view?.extinguished ?? []).map((e) => [e.grant, e])), [view]);

  /**
   * الشاشات المعروضة = ما للمفوِّض فيها فعلٌ واحد على الأقل.
   *
   * ⚠️ يُشتقّ من `grantable` القادمة من الخادم، لا من `ALLOWED_SCREENS`
   * كاملةً: عرضُ الشجرة كلها يُظهر ما لا يملكه المفوِّض.
   */
  const screens = useMemo(
    () => ALLOWED_SCREENS.filter((s) => SCREEN_ACTIONS.some((a) => grantable.has(`${s}:${a}`))),
    [grantable],
  );

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (!picked.size) return;
    setBusy(true);
    setError(null);
    try {
      await createDelegation(granteeId, 'root', [...picked]);
      load();
      // الصلاحيات تُقرأ حيّةً — والمنح يغيّرها فوراً لا عند التنقّل التالي.
      refresh();
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر حفظ التفويض'));
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeDelegation(id);
      load();
      refresh();
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر سحب التفويض'));
    } finally {
      setBusy(false);
    }
  };

  return (
    // `overlay` + `modal-head` — نفس صدفة `CompanyUserModal` لا صدفةً ثانية.
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`تفويض ${granteeName}`}>
        <div className="modal-head">
          <div className="modal-title">تفويض الصلاحيات — {granteeName}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {!view && !error && <p>جارٍ التحميل…</p>}

        {view && screens.length === 0 && (
          <p className="muted" data-testid="deleg-nothing-to-grant">
            لا تملك صلاحياتٍ يمكن تفويضها. ولا يمنح أحدٌ ما لا يملك.
          </p>
        )}

        {view && screens.length > 0 && (
          <>
            <p className="muted">يُعرض ما تملكه أنت وحده — ولا يمنح أحدٌ ما لا يملك.</p>
            <div className="deleg-tree" data-testid="deleg-tree">
              {screens.map((screen) => (
                <fieldset key={screen} className="deleg-screen">
                  <legend>{SCREEN_LABELS[screen]}</legend>
                  {SCREEN_ACTIONS.filter((a) => grantable.has(`${screen}:${a}`)).map((action) => {
                    const key = `${screen}:${action}`;
                    const dead = extinguished.get(key);
                    const isActive = active.has(key);
                    return (
                      <label
                        key={key}
                        className={dead ? 'deleg-grant extinguished' : isActive ? 'deleg-grant active' : 'deleg-grant'}
                        data-testid={`grant-${key}`}
                        data-state={dead ? 'extinguished' : isActive ? 'active' : 'available'}
                      >
                        <input
                          type="checkbox"
                          checked={isActive || dead != null || picked.has(key)}
                          disabled={isActive || dead != null || busy}
                          onChange={() => toggle(key)}
                        />
                        <span>{ACTION_LABELS[action]}</span>
                        {dead && (
                          <em className="deleg-reason" data-testid={`reason-${key}`}>
                            {REASON_TEXT[dead.reason]}
                          </em>
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>

            <div className="deleg-links">
              <h4>التفويضات القائمة</h4>
              {view.links.length === 0 && <p className="muted">لا تفويض بعد.</p>}
              {view.links.map((l) => (
                <div key={l.id} className="deleg-link" data-testid={`link-${l.id}`} data-state={l.state}>
                  <span>{l.grants.map((g) => g.split(':')[0]).filter((v, i, a) => a.indexOf(v) === i).map((s) => SCREEN_LABELS[s as keyof typeof SCREEN_LABELS] ?? s).join(' · ')}</span>
                  <span className="num">{l.grants.length} صلاحية</span>
                  {/* المسحوب **يبقى ظاهراً مختوماً** — لا يُحذف من العرض كما لا يُحذف من السجل. */}
                  {l.state === 'ACTIVE' ? (
                    <button type="button" onClick={() => doRevoke(l.id)} disabled={busy}>سحب</button>
                  ) : (
                    <span className="badge sealed">مسحوب</span>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" onClick={submit} disabled={busy || picked.size === 0} data-testid="deleg-submit">
                تفويض {picked.size > 0 ? `(${picked.size})` : ''}
              </button>
              <button type="button" onClick={onClose} disabled={busy}>إغلاق</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
