import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SCREEN_ROUTES, commentTask, listMyTasks, listTaskLog, transitionTask, type MyTask, type TaskLogLine, type TaskPriority, type TaskStatus } from '../../api/tasks';
import { SCREEN_LABELS } from '../../api/templates';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * لوحة «مهامي» — **ما كُلِّفتُ به**، لا مهام المنشأة.
 *
 * ## القاعدة التي تُرى هنا بالعين
 *
 * > المكلَّف يرى **وجود** المهمة ولا يرى **محتوى** المستند.
 *
 * فالعنوان يُعرض دائماً — كتبه المُسنِد لا المستند — واسمُ الشاشة يُعرض
 * دائماً، **والرابط يظهر بـ`canOpenTarget` وحده**. ومن كُلِّف بمراجعة عقدٍ
 * لا يملك `contracts:view` يعرف أن عليه مهمة، ويعرف أنها على عقد، ولا
 * يفتحه.
 *
 * ⚠️ و**`canOpenTarget` يأتي محسوباً** — لا يُشتقّ هنا ولا يُخزَّن هناك.
 * اشتقاقُه في الواجهة نسخةٌ ثانية من قاعدةٍ تعيش في الخادم، وتخزينُه نسخةٌ
 * تتقادم عند أول سحب.
 *
 * ## وأزرار الانتقال تأتي محسوبةً كذلك
 *
 * `allowedTransitions` هي ما يسمح به التفويض **على شاشة المستند** لهذا
 * الفاعل الآن — لا كل الانتقالات الممكنة نظرياً. فمكلَّفٌ بلا `review` لا
 * يرى زرّ «تمّت» أصلاً، **والخادم يرفضه أيضاً لو صُنع الطلب بيد**.
 */

const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: 'مفتوحة',
  IN_PROGRESS: 'قيد العمل',
  BLOCKED: 'متعثّرة',
  DONE: 'تمّت',
  CANCELLED: 'أُلغيت',
};

/** الأولوية (SPEC 14.2) — تسمياتُ العرض للقائمة المغلقة في الخادم. */
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  URGENT: 'عاجل',
  HIGH: 'مرتفع',
  NORMAL: 'عادي',
};

const TRANSITION_LABELS: Record<TaskStatus, string> = {
  OPEN: 'إعادة فتح',
  IN_PROGRESS: 'ابدأ',
  BLOCKED: 'تعثّرت',
  DONE: 'تمّت',
  CANCELLED: 'إلغاء',
};

export function MyTasksPage() {
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // حوارُ المهمّة (SPEC 1.11): السجلُّ يُفتح لمهمّةٍ واحدة، والتعليقُ سطرٌ فيه بلا انتقال.
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [log, setLog] = useState<TaskLogLine[]>([]);
  const [draft, setDraft] = useState('');

  const showLog = async (id: string) => {
    if (openLog === id) {
      setOpenLog(null);
      return;
    }
    setError(null);
    try {
      setLog(await listTaskLog(id));
      setOpenLog(id);
      setDraft('');
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر تحميل سجل المهمة'));
    }
  };

  const sendComment = async (id: string) => {
    if (!draft.trim()) return;
    setBusy(id);
    setError(null);
    try {
      await commentTask(id, draft.trim());
      setLog(await listTaskLog(id));
      setDraft('');
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر إرسال التعليق'));
    } finally {
      setBusy(null);
    }
  };

  const load = () =>
    listMyTasks()
      .then(setTasks)
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل المهام')));

  useEffect(() => {
    load();
  }, []);

  const move = async (id: string, to: TaskStatus) => {
    setBusy(id);
    setError(null);
    try {
      await transitionTask(id, to);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر تغيير حالة المهمة'));
    } finally {
      setBusy(null);
    }
  };

  const live = tasks?.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED') ?? [];
  const closed = tasks?.filter((t) => t.status === 'DONE' || t.status === 'CANCELLED') ?? [];

  return (
    <div className="page">
      <div className="topbar">
        <h2>مهامي</h2>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!tasks && !error && <p>جارٍ التحميل…</p>}

      {tasks && tasks.length === 0 && (
        <p className="muted" data-testid="tasks-empty">لا مهام مُسنَدة إليك.</p>
      )}

      {tasks && tasks.length > 0 && (
        <>
          <table className="table" data-testid="my-tasks">
            <thead>
              <tr>
                <th>المهمة</th>
                <th>الأولوية</th>
                <th>القسم</th>
                <th>المستند</th>
                <th>الحالة</th>
                <th>الموعد</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {[...live, ...closed].map((t) => (
                <tr key={t.id} data-testid={`task-${t.id}`} data-status={t.status} data-overdue={t.isOverdue}>
                  <td>{t.title}</td>
                  <td data-testid={`priority-${t.id}`}>
                    <span className={t.priority === 'URGENT' ? 'badge overdue' : t.priority === 'HIGH' ? 'badge sealed' : 'badge'}>
                      {PRIORITY_LABELS[t.priority] ?? '—'}
                    </span>
                  </td>
                  <td data-testid={`department-${t.id}`}>{t.department || <span className="muted">—</span>}</td>
                  <td>
                    {/* ⭐ **القاعدة بالعين**: لا هدف ⇒ شرطة · هدفٌ يُفتح ⇒ رابط ·
                      * هدفٌ لا يُفتح ⇒ **اسم الشاشة نصّاً بلا رابط**. والثالثة هي
                      * القاعدة: يعرف أن هناك مستنداً، ولا يصل إليه. */}
                    {!t.target ? (
                      <span className="muted">—</span>
                    ) : t.canOpenTarget ? (
                      <Link to={`${SCREEN_ROUTES[t.target.screen] ?? '/'}`} data-testid={`open-${t.id}`}>
                        {SCREEN_LABELS[t.target.screen as keyof typeof SCREEN_LABELS] ?? t.target.screen}
                      </Link>
                    ) : (
                      <span className="muted" data-testid={`locked-${t.id}`}>
                        {SCREEN_LABELS[t.target.screen as keyof typeof SCREEN_LABELS] ?? t.target.screen} — لا تملك صلاحية فتحه
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={t.status === 'DONE' ? 'badge' : 'badge sealed'}>{STATUS_LABELS[t.status]}</span>
                  </td>
                  <td data-testid={`due-${t.id}`}>
                    {t.dueAt ? (
                      <span className={t.isOverdue ? 'error' : undefined}>
                        {new Date(t.dueAt).toLocaleDateString('ar-SA')}
                        {t.isOverdue ? ' — متأخّرة' : ''}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {/* الأزرار من `allowedTransitions` المحسوبة في الخادم —
                      * لا من جدول انتقالاتٍ منسوخٍ هنا. */}
                    {t.allowedTransitions.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      t.allowedTransitions.map((to) => (
                        <button
                          key={to}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy === t.id}
                          onClick={() => move(t.id, to)}
                          data-testid={`move-${t.id}-${to}`}
                        >
                          {TRANSITION_LABELS[to]}
                        </button>
                      ))
                    )}
                    {/* حوارُ المهمّة — تعليقٌ بلا انتقال (SPEC 1.11). */}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => showLog(t.id)} data-testid={`log-${t.id}`}>
                      💬
                    </button>
                  </td>
                </tr>
              ))}
              {openLog && (
                <tr data-testid={`thread-${openLog}`}>
                  <td colSpan={7}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {log.length === 0 && <span className="muted">لا سطور بعد</span>}
                      {log.map((l) => (
                        <div key={l.id} style={{ fontSize: 13 }}>
                          <span className="muted">
                            #{l.seq} · {new Date(l.createdAt).toLocaleString('ar-SA')} ·{' '}
                            {l.fromStatus === l.toStatus ? 'تعليق' : `${l.fromStatus ? STATUS_LABELS[l.fromStatus] : 'إنشاء'} ← ${STATUS_LABELS[l.toStatus]}`}
                          </span>
                          {l.note && <div>{l.note}</div>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="تعليقٌ لطرف المهمّة الآخر — لا يغيّر حالتها" style={{ flex: 1 }} data-testid={`draft-${openLog}`} />
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy === openLog || !draft.trim()} onClick={() => sendComment(openLog)} data-testid={`send-${openLog}`}>
                          أرسل
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
