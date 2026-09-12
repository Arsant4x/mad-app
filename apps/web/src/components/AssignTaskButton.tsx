import { useEffect, useState } from 'react';
import { createTask, type TaskAssigneeKind, type TaskPriority } from '../api/tasks';
import { listCompanyUsers, type CompanyUser } from '../api/companyUsers';
import { useAuth } from '../auth/AuthContext';
import { usePermissions } from '../auth/PermissionsContext';
import { apiErrorMessage } from '../lib/apiError';

/**
 * قيمةُ المنتقي تحمل **الوسمَ والمعرّفَ معاً** (`ق-٦٣٩`): `OWNER:<companyId>` للمالك،
 * و`USER:<id>` لحسابٍ فرعيّ — فلا يُرسَل معرّفٌ بلا فضائه، ولا يُملأ الوسمُ بالظنّ.
 */
const OWNER_PREFIX = 'OWNER:';
const USER_PREFIX = 'USER:';
function splitAssignee(value: string): { assigneeId: string; assigneeKind: TaskAssigneeKind } | null {
  if (value.startsWith(OWNER_PREFIX)) return { assigneeId: value.slice(OWNER_PREFIX.length), assigneeKind: 'OWNER' };
  if (value.startsWith(USER_PREFIX)) return { assigneeId: value.slice(USER_PREFIX.length), assigneeKind: 'USER' };
  return null;
}

/**
 * إسناد مهمة **من داخل المستند** — مكوّنٌ واحد يُركَّب في الثلاث.
 *
 * ## لماذا واحدٌ لا ثلاث نسخ
 *
 * العقود والفواتير والبلاغات تحتاج الشيء نفسه: «أسنِد هذا المستند لفلان».
 * وثلاث نسخ تفترق عند أول تعديل — تُصلَح إحداها وتبقى اثنتان، **بلا شكوى**.
 * وهي عائلة العطب التي أنتجت `RowMenu` أصلاً: مكوّنٌ واحد لعشرين شاشة.
 *
 * ## والاستعمال يمرّ الشاشة والمعرّف فقط
 *
 *     <AssignTaskButton screen="contracts" entityId={contract.id} />
 *
 * ولا يمرّ **عنوان المستند ولا محتواه**: العنوان يكتبه المُسنِد، والخادم
 * لا يقرأ المستند أصلاً. فالمكوّن لا يفتح باباً لتسريب ما لا يُسرَّب.
 *
 * ## ⚠️ والزرّ لا يظهر لمن لا يرى المستند
 *
 * الخادم يرفض ربط مهمةٍ بمستندٍ لا يراه المُسنِد (`task_target_not_visible`)
 * — وإلا صار الإسناد **قناة تسريب معكوسة**: من لا يملك `contracts:view`
 * يربط مهمةً بعقدٍ لم يره فيكشف وجوده ومعرّفه لمن يفتحه.
 *
 * وإخفاء الزر هنا **عرضٌ لا منع**: يوفّر محاولةً ترفضها الخادم، والمنع
 * هناك لا هنا.
 */
export function AssignTaskButton({ screen, entityId }: { screen: string; entityId: string }) {
  const { can } = usePermissions();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [title, setTitle] = useState('');
  // ⚠️ القيمةُ `OWNER:…` أو `USER:…` — الوسمُ جزءٌ من الاختيار لا افتراضٌ يُلحَق به.
  const [assignee, setAssignee] = useState('');
  const [dueAnchor, setDueAnchor] = useState('');
  const [recurEveryDays, setRecurEveryDays] = useState(0);
  // التذكرةُ الداخلية (SPEC 1.11 · 14.2): أولويةٌ وقسم — حقلان على المهمّة نفسِها.
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    listCompanyUsers()
      .then((u) => setUsers(u.filter((x) => x.status === 'ACTIVE')))
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل الموظفين')));
  }, [open]);

  // ⚠️ بحثٌ في مجموعةٍ محسومة من الخادم — لا قاعدة هنا.
  if (!can(screen, 'view')) return null;

  const submit = async () => {
    const picked = splitAssignee(assignee);
    if (!picked) {
      setError('اختر المكلَّف.');
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
        // مهمةٌ متكرّرة تحتاج مرساة — والقاعدة تفرضها بقيدٍ أيضاً.
        dueAnchor: dueAnchor ? new Date(dueAnchor).toISOString() : undefined,
        priority,
        department: department.trim() || undefined,
      });
      setDone(true);
      setOpen(false);
      setTitle('');
      setAssignee('');
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر إسناد المهمة'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} data-testid="assign-task-open">
        ⊕ أسنِد مهمة
      </button>
      {done && <span className="muted" data-testid="assign-task-done"> أُسنِدت</span>}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="إسناد مهمة">
            <div className="modal-head">
              <div className="modal-title">إسناد مهمة على هذا المستند</div>
              <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            {error && <p className="error" role="alert">{error}</p>}

            <div className="field">
              <label>عنوان المهمة</label>
              {/* العنوان يكتبه المُسنِد — **ولا يُؤخذ من المستند**. فالمكلَّف
                * يقرأه دون أن يقرأ المستند، وهي القاعدة بعينها. */}
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: راجع بند التأمين" data-testid="assign-title" />
            </div>

            <div className="field">
              <label>المكلَّف</label>
              {/* ⭐ المالكُ مكلَّفٌ ممكن (ق-٦٣٩): كان المنتقي حساباتٍ فرعيةً وحدَها، وفي منشأةٍ
                  بفاعلٍ واحدٍ يبقى فارغاً والزرُّ معطَّلاً بلا رسالةٍ تقول لماذا. والخيارُ
                  الأولُ الآن هو المالك — بمعرّف المنشأة موسوماً OWNER لا بمعرّفٍ عارٍ. */}
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} data-testid="assign-assignee">
                <option value="">اختر المكلَّف</option>
                {user?.companyId && (
                  <option value={`${OWNER_PREFIX}${user.companyId}`}>المالك{user.actorType === 'COMPANY' ? ` (${user.displayName})` : ''}</option>
                )}
                {users.map((u) => (
                  <option key={u.id} value={`${USER_PREFIX}${u.id}`}>{u.name}</option>
                ))}
              </select>
            </div>

            <div className="two-col">
              <div className="field">
                <label>الأولوية</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} data-testid="assign-priority">
                  <option value="NORMAL">عادي</option>
                  <option value="HIGH">مرتفع</option>
                  <option value="URGENT">عاجل</option>
                </select>
              </div>
              <div className="field">
                <label>القسم المختصّ (اختياري)</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="مثال: محاسبة" maxLength={60} data-testid="assign-department" />
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label>أول موعد استحقاق (اختياري)</label>
                <input type="date" value={dueAnchor} onChange={(e) => setDueAnchor(e.target.value)} data-testid="assign-due" />
              </div>
              <div className="field">
                <label>تتكرّر كل (يوم)</label>
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
                إسناد
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={saving}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
