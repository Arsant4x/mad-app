import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTask, type TaskAssigneeKind, type TaskPriority } from '../api/tasks';
import { listCompanyUsers, type CompanyUser } from '../api/companyUsers';
import type { ScreenKey } from '../api/templates';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../auth/PermissionsContext';
import { apiErrorMessage } from '../lib/apiError';

/**
 * The picker value carries the kind and the ID together: `OWNER:<companyId>` for the owner and
 * `USER:<id>` for a sub account, so an ID is never sent without its space and the kind is never guessed.
 */
const OWNER_PREFIX = 'OWNER:';
const USER_PREFIX = 'USER:';
function splitAssignee(value: string): { assigneeId: string; assigneeKind: TaskAssigneeKind } | null {
  if (value.startsWith(OWNER_PREFIX)) return { assigneeId: value.slice(OWNER_PREFIX.length), assigneeKind: 'OWNER' };
  if (value.startsWith(USER_PREFIX)) return { assigneeId: value.slice(USER_PREFIX.length), assigneeKind: 'USER' };
  return null;
}

/**
 * Assigns a task from inside a document: one component mounted in contracts, invoices and maintenance
 * requests, so the three cannot drift apart.
 *
 *     <AssignTaskButton screen="contracts" entityId={contract.id} />
 *
 * Only the screen and the ID are passed, never the document's title or content: the assigner writes the
 * title and the server does not read the document, so the component opens no leak.
 *
 * The button is hidden from anyone who cannot view the document. The server refuses to link a task to a
 * document the assigner cannot see (`task_target_not_visible`); otherwise assigning would reveal a
 * document's existence and ID. Hiding the button here only saves a refused attempt; the server enforces it.
 */
// The screen comes from the shared list, not free text: it is what the server accepts in `targetScreen`.
export function AssignTaskButton({ screen, entityId }: { screen: ScreenKey; entityId: string }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [title, setTitle] = useState('');
  // The value is `OWNER:…` or `USER:…`: the kind is part of the choice, not an assumption added later.
  const [assignee, setAssignee] = useState('');
  const [dueAnchor, setDueAnchor] = useState('');
  const [recurEveryDays, setRecurEveryDays] = useState(0);
  // The internal ticket: a priority and a department, two fields on the task itself.
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    listCompanyUsers()
      .then((u) => setUsers(u.filter((x) => x.status === 'ACTIVE')))
      .catch((e) => setError(apiErrorMessage(e, t('common.assign_task.load_users_failed'))));
  }, [open]);

  // A lookup in a set the server already decided; no rule lives here.
  if (!can(screen, 'view')) return null;

  const submit = async () => {
    const picked = splitAssignee(assignee);
    if (!picked) {
      setError(t('common.assign_task.pick_assignee_error'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTask({
        title: title.trim(),
        ...picked,
        targetScreen: screen,
        targetId: entityId,
        recurEveryDays: recurEveryDays > 0 ? recurEveryDays : undefined,
        // A recurring task needs an anchor; the database enforces it with a constraint too.
        dueAnchor: dueAnchor ? new Date(dueAnchor).toISOString() : undefined,
        priority,
        department: department.trim() || undefined,
      });
      setDone(true);
      setOpen(false);
      setTitle('');
      setAssignee('');
    } catch (e) {
      setError(apiErrorMessage(e, t('common.assign_task.assign_failed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} data-testid="assign-task-open">
        {t('common.assign_task.open')}
      </button>
      {done && <span className="muted" data-testid="assign-task-done"> {t('common.assign_task.assigned')}</span>}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('common.assign_task.dialog_label')}>
            <div className="modal-head">
              <div className="modal-title">{t('common.assign_task.title')}</div>
              <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            {error && <p className="error" role="alert">{error}</p>}

            <div className="field">
              <label>{t('common.assign_task.task_title')}</label>
              {/* The assigner writes the title; it is never taken from the document, so the assignee
                * reads it without reading the document. */}
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('common.assign_task.task_title_placeholder')} data-testid="assign-title" />
            </div>

            <div className="field">
              <label>{t('common.assign_task.assignee')}</label>
              {/* The owner can be assigned too: in a company with one person the list of sub accounts
                  was empty and the button disabled with no reason. The owner comes first, as the
                  company ID tagged OWNER, never a bare ID. */}
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} data-testid="assign-assignee">
                <option value="">{t('common.assign_task.pick_assignee')}</option>
                {user?.companyId && (
                  <option value={`${OWNER_PREFIX}${user.companyId}`}>{t('common.assign_task.owner')}{user.actorType === 'COMPANY' ? ` (${user.displayName})` : ''}</option>
                )}
                {users.map((u) => (
                  <option key={u.id} value={`${USER_PREFIX}${u.id}`}>{u.name}</option>
                ))}
              </select>
            </div>

            <div className="two-col">
              <div className="field">
                <label>{t('common.assign_task.priority')}</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} data-testid="assign-priority">
                  <option value="NORMAL">{t('common.assign_task.priority_normal')}</option>
                  <option value="HIGH">{t('common.assign_task.priority_high')}</option>
                  <option value="URGENT">{t('common.assign_task.priority_urgent')}</option>
                </select>
              </div>
              <div className="field">
                <label>{t('common.assign_task.department')}</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t('common.assign_task.department_placeholder')} maxLength={60} data-testid="assign-department" />
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label>{t('common.assign_task.first_due')}</label>
                <input type="date" value={dueAnchor} onChange={(e) => setDueAnchor(e.target.value)} data-testid="assign-due" />
              </div>
              <div className="field">
                <label>{t('common.assign_task.recur_every')}</label>
                <input
                  type="number"
                  min={0}
                  value={recurEveryDays}
                  onChange={(e) => setRecurEveryDays(Number(e.target.value))}
                  data-testid="assign-recur"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || title.trim().length < 2 || !assignee || (recurEveryDays > 0 && !dueAnchor)}
                onClick={submit}
                data-testid="assign-submit"
              >
                {t('common.assign_task.submit')}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={saving}>{t('common.assign_task.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
