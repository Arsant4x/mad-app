import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SCREEN_ROUTES, commentTask, listMyTasks, listTaskLog, transitionTask, type MyTask, type TaskLogLine, type TaskPriority, type TaskStatus } from '../../api/tasks';
import { SCREEN_LABELS } from '../../api/templates';
import { apiErrorMessage } from '../../lib/apiError';
import { formatDate, formatDateTime } from '../../i18n/format';

/**
 * "My tasks": what I was assigned, not the company's tasks.
 *
 * The assignee sees that a task exists, not the content of its document. The
 * title (written by the assigner) and the screen name always show; the link
 * shows only when `canOpenTarget` is true. Someone asked to review a contract
 * without `contracts:view` knows there is a task on a contract and cannot open it.
 *
 * `canOpenTarget` and `allowedTransitions` arrive computed by the server.
 * Deriving them here would be a second copy of a server rule; storing them
 * would go stale on the first revocation. An assignee without `review` never
 * sees the "done" button, and the server refuses a hand-made request as well.
 */

const STATUS_KEYS: Record<TaskStatus, string> = {
  OPEN: 'tasks.status.OPEN',
  IN_PROGRESS: 'tasks.status.IN_PROGRESS',
  BLOCKED: 'tasks.status.BLOCKED',
  DONE: 'tasks.status.DONE',
  CANCELLED: 'tasks.status.CANCELLED',
};

/** Display labels for the server's closed priority list. */
const PRIORITY_KEYS: Record<TaskPriority, string> = {
  URGENT: 'tasks.priority.URGENT',
  HIGH: 'tasks.priority.HIGH',
  NORMAL: 'tasks.priority.NORMAL',
};

const TRANSITION_KEYS: Record<TaskStatus, string> = {
  OPEN: 'tasks.transition.OPEN',
  IN_PROGRESS: 'tasks.transition.IN_PROGRESS',
  BLOCKED: 'tasks.transition.BLOCKED',
  DONE: 'tasks.transition.DONE',
  CANCELLED: 'tasks.transition.CANCELLED',
};

export function MyTasksPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Task thread: the log opens for one task at a time; a comment is a line in it with no transition.
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
      setError(apiErrorMessage(e, t('tasks.log_load_failed')));
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
      setError(apiErrorMessage(e, t('tasks.comment_failed')));
    } finally {
      setBusy(null);
    }
  };

  const load = () =>
    listMyTasks()
      .then(setTasks)
      .catch((e) => setError(apiErrorMessage(e, t('tasks.load_failed'))));

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
      setError(apiErrorMessage(e, t('tasks.transition_failed')));
    } finally {
      setBusy(null);
    }
  };

  const live = tasks?.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED') ?? [];
  const closed = tasks?.filter((task) => task.status === 'DONE' || task.status === 'CANCELLED') ?? [];

  return (
    <div className="page">
      <div className="topbar">
        <h2>{t('tasks.title')}</h2>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!tasks && !error && <p>{t('tasks.loading')}</p>}

      {tasks && tasks.length === 0 && (
        <p className="muted" data-testid="tasks-empty">{t('tasks.empty')}</p>
      )}

      {tasks && tasks.length > 0 && (
        <>
          <table className="table" data-testid="my-tasks">
            <thead>
              <tr>
                <th>{t('tasks.col.task')}</th>
                <th>{t('tasks.col.priority')}</th>
                <th>{t('tasks.col.department')}</th>
                <th>{t('tasks.col.document')}</th>
                <th>{t('tasks.col.status')}</th>
                <th>{t('tasks.col.due')}</th>
                <th>{t('tasks.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {[...live, ...closed].map((task) => (
                <tr key={task.id} data-testid={`task-${task.id}`} data-status={task.status} data-overdue={task.isOverdue}>
                  <td>{task.title}</td>
                  <td data-testid={`priority-${task.id}`}>
                    <span className={task.priority === 'URGENT' ? 'badge overdue' : task.priority === 'HIGH' ? 'badge sealed' : 'badge'}>
                      {PRIORITY_KEYS[task.priority] ? t(PRIORITY_KEYS[task.priority]) : '—'}
                    </span>
                  </td>
                  <td data-testid={`department-${task.id}`}>{task.department || <span className="muted">—</span>}</td>
                  <td>
                    {/* No target: a dash. Openable target: a link. Target that cannot be
                      * opened: the screen name as plain text, so the assignee knows a
                      * document exists without reaching it. */}
                    {!task.target ? (
                      <span className="muted">—</span>
                    ) : task.canOpenTarget ? (
                      <Link to={`${SCREEN_ROUTES[task.target.screen] ?? '/'}`} data-testid={`open-${task.id}`}>
                        {SCREEN_LABELS[task.target.screen as keyof typeof SCREEN_LABELS] ?? task.target.screen}
                      </Link>
                    ) : (
                      <span className="muted" data-testid={`locked-${task.id}`}>
                        {t('tasks.locked_target', { screen: SCREEN_LABELS[task.target.screen as keyof typeof SCREEN_LABELS] ?? task.target.screen })}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={task.status === 'DONE' ? 'badge' : 'badge sealed'}>{t(STATUS_KEYS[task.status])}</span>
                  </td>
                  <td data-testid={`due-${task.id}`}>
                    {task.dueAt ? (
                      <span className={task.isOverdue ? 'error' : undefined}>
                        {formatDate(task.dueAt)}
                        {task.isOverdue ? t('tasks.overdue_suffix') : ''}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {/* Buttons come from the server's computed `allowedTransitions`,
                      * not from a transition table copied here. */}
                    {task.allowedTransitions.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      task.allowedTransitions.map((to) => (
                        <button
                          key={to}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy === task.id}
                          onClick={() => move(task.id, to)}
                          data-testid={`move-${task.id}-${to}`}
                        >
                          {t(TRANSITION_KEYS[to])}
                        </button>
                      ))
                    )}
                    {/* Task thread: a comment without a transition. */}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => showLog(task.id)} data-testid={`log-${task.id}`}>
                      💬
                    </button>
                  </td>
                </tr>
              ))}
              {openLog && (
                <tr data-testid={`thread-${openLog}`}>
                  <td colSpan={7}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {log.length === 0 && <span className="muted">{t('tasks.no_lines')}</span>}
                      {log.map((l) => (
                        <div key={l.id} style={{ fontSize: 13 }}>
                          <span className="muted">
                            #{l.seq} · {formatDateTime(l.createdAt)} ·{' '}
                            {l.fromStatus === l.toStatus
                              ? t('tasks.comment')
                              : t('tasks.log_transition', { from: l.fromStatus ? t(STATUS_KEYS[l.fromStatus]) : t('tasks.created'), to: t(STATUS_KEYS[l.toStatus]) })}
                          </span>
                          {l.note && <div>{l.note}</div>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('tasks.comment_placeholder')} style={{ flex: 1 }} data-testid={`draft-${openLog}`} />
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy === openLog || !draft.trim()} onClick={() => sendComment(openLog)} data-testid={`send-${openLog}`}>
                          {t('tasks.send')}
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
