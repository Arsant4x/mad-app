import { apiClient } from './client';

/**
 * عميل المهام — **ينقل ولا يحسب**.
 *
 * `canOpenTarget` و`isOverdue` و`allowedTransitions` كلها **نتائج حسمها
 * الخادم**. ولا دالة في هذا الملف تشتقّ واحدةً منها: اشتقاقُها هنا نسخةٌ
 * ثانية تفترق عند أول تعديل، ويرى المستخدم زرّاً يرفضه الخادم.
 */

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
/** الأولوية (SPEC 14.2) — القائمةُ المغلقة في الخادم، وهذه نسختُها للعرض. */
export type TaskPriority = 'URGENT' | 'HIGH' | 'NORMAL';

/** سطرٌ من سجل المهمّة — انتقالٌ، أو تعليقٌ حين يستوي الطرفان. */
export interface TaskLogLine {
  id: string;
  seq: number;
  actorId: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  note: string | null;
  createdAt: string;
}

export interface TaskTarget {
  screen: string;
  entityId: string;
}

export interface MyTask {
  id: string;
  title: string;
  target: TaskTarget | null;
  /** ⚠️ **محسوبٌ في الخادم** — لا يُشتقّ هنا ولا يُخزَّن هناك. */
  canOpenTarget: boolean;
  status: TaskStatus;
  /** التذكرةُ الداخلية (SPEC 1.11): أولويةٌ وقسم — حقلان على المهمّة لا محرّك. */
  priority: TaskPriority;
  department: string | null;
  assigneeId: string;
  createdById: string;
  dueAt: string | null;
  isOverdue: boolean;
  /** الانتقالات المسموحة **لهذا الفاعل الآن** — لا كل الممكنة نظرياً. */
  allowedTransitions: TaskStatus[];
}

export interface TaskCounters {
  open: number;
  overdue: number;
}

export interface CreateTaskInput {
  title: string;
  assigneeId: string;
  targetScreen?: string;
  targetId?: string;
  note?: string;
  recurEveryDays?: number;
  dueAnchor?: string;
  priority?: TaskPriority;
  department?: string;
}

export const listMyTasks = () => apiClient.get<MyTask[]>('/tasks/mine').then((r) => r.data);
export const getTaskCounters = () => apiClient.get<TaskCounters>('/tasks/counters').then((r) => r.data);
export const createTask = (input: CreateTaskInput) => apiClient.post<MyTask>('/tasks', input).then((r) => r.data);
export const transitionTask = (id: string, to: TaskStatus, note?: string) =>
  apiClient.patch<MyTask>(`/tasks/${id}/status`, { to, note }).then((r) => r.data);
/** تعليقٌ بلا انتقال — لطرفَي المهمّة (SPEC 1.11). */
export const commentTask = (id: string, note: string) => apiClient.post<MyTask>(`/tasks/${id}/comments`, { note }).then((r) => r.data);
export const listTaskLog = (id: string) => apiClient.get<TaskLogLine[]>(`/tasks/${id}/log`).then((r) => r.data);

/** مسار الشاشة في الواجهة — يُستعمل لفتح المستند حين يُسمح. */
export const SCREEN_ROUTES: Record<string, string> = {
  contracts: '/contracts',
  invoice: '/invoices',
  maintenance: '/maintenance',
  properties: '/properties',
  customers: '/customers',
  suppliers: '/suppliers',
  products: '/products',
  employees: '/employees',
};
