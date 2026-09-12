import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyTasksPage } from './MyTasksPage';
import { SCREEN_LABELS } from '../../api/templates';

vi.mock('../../api/tasks', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listMyTasks: vi.fn(),
  transitionTask: vi.fn(),
}));

import { listMyTasks } from '../../api/tasks';

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'راجع بند التأمين',
  target: { screen: 'contracts', entityId: 'c-1' },
  canOpenTarget: false,
  status: 'OPEN',
  assigneeId: 'emp',
  assigneeKind: 'USER',
  createdById: 'owner',
  dueAt: null,
  isOverdue: false,
  allowedTransitions: [],
  ...over,
});

const mount = (tasks: Record<string, unknown>[]) => {
  vi.mocked(listMyTasks).mockResolvedValue(tasks as never);
  return render(
    <MemoryRouter>
      <MyTasksPage />
    </MemoryRouter>,
  );
};

beforeEach(() => vi.clearAllMocks());

describe('لوحة «مهامي» — القاعدة بالعين', () => {
  it('⭐ المكلَّف يرى وجود المهمة والمستند، ولا يفتحه', async () => {
    // العنوان يكتبه المُسنِد لا المستند، واسم الشاشة يُعرض — والرابط وحده
    // يغيب. فيعرف أن عليه مهمة، ويعرف أنها على عقد، ولا يصل إليه.
    mount([task({ canOpenTarget: false })]);
    await waitFor(() => expect(screen.getByTestId('task-t1')).toBeInTheDocument());

    expect(screen.getByText('راجع بند التأمين')).toBeInTheDocument();
    // ⚠️ الاسم **مقروءٌ من مصدره** لا مكتوباً هنا: كتبتُه «العقود» في أول
    // صياغة وهو «عقود الإيجار»، فسقط الاختبار على تسميةٍ لا على سلوك.
    // وقائمةٌ منسوخة في اختبار تتعفّن كما تتعفّن في شيفرة.
    expect(screen.getByTestId('locked-t1')).toHaveTextContent(SCREEN_LABELS.contracts);
    expect(screen.getByTestId('locked-t1')).toHaveTextContent('لا تملك صلاحية فتحه');
    expect(screen.queryByTestId('open-t1')).toBeNull();
  });

  it('⭐ ومن يملك الشاشة يرى الرابط', async () => {
    mount([task({ canOpenTarget: true })]);
    await waitFor(() => expect(screen.getByTestId('open-t1')).toBeInTheDocument());
    expect(screen.getByTestId('open-t1')).toHaveAttribute('href', '/contracts');
    expect(screen.queryByTestId('locked-t1')).toBeNull();
  });

  it('⭐ الأزرار من `allowedTransitions` المحسوبة — لا من جدولٍ منسوخ', async () => {
    // مكلَّفٌ بلا `review` لا يرى «تمّت» أصلاً. ولو نُسخ جدول الانتقالات
    // هنا لظهر الزرّ ثم رفضه الخادم — وهو أسوأ من غيابه.
    mount([task({ status: 'IN_PROGRESS', allowedTransitions: ['BLOCKED', 'CANCELLED'] })]);
    await waitFor(() => expect(screen.getByTestId('move-t1-BLOCKED')).toBeInTheDocument());
    expect(screen.getByTestId('move-t1-CANCELLED')).toBeInTheDocument();
    expect(screen.queryByTestId('move-t1-DONE')).toBeNull();
  });

  it('⭐ حالةٌ نهائية بلا انتقالات ⇒ لا أزرار', async () => {
    mount([task({ status: 'DONE', allowedTransitions: [] })]);
    await waitFor(() => expect(screen.getByTestId('task-t1')).toBeInTheDocument());
    expect(screen.getByTestId('task-t1')).toHaveAttribute('data-status', 'DONE');
    expect(screen.queryByTestId('move-t1-OPEN')).toBeNull();
  });

  it('⭐ التأخّر يُعرض كما يأتي من الخادم — لا يُحسب هنا', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    mount([task({ dueAt: past, isOverdue: true })]);
    await waitFor(() => expect(screen.getByTestId('due-t1')).toBeInTheDocument());
    expect(screen.getByTestId('due-t1')).toHaveTextContent('متأخّرة');
    expect(screen.getByTestId('task-t1')).toHaveAttribute('data-overdue', 'true');
  });

  it('⭐ ولا يُحسب التأخّر محلياً: موعدٌ ماضٍ و`isOverdue: false` يُعرض غير متأخّر', async () => {
    // الحارس الحاسم: لو اشتقّت الواجهة التأخّر من `dueAt` لتجاهلت جواب
    // الخادم — وهي نسخةٌ ثانية من قاعدةٍ تعيش هناك.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    mount([task({ dueAt: past, isOverdue: false })]);
    await waitFor(() => expect(screen.getByTestId('due-t1')).toBeInTheDocument());
    expect(screen.getByTestId('due-t1')).not.toHaveTextContent('متأخّرة');
    expect(screen.getByTestId('task-t1')).toHaveAttribute('data-overdue', 'false');
  });

  it('مهمةٌ بلا مستند تُعرض بشرطة لا بفراغ', async () => {
    mount([task({ target: null })]);
    await waitFor(() => expect(screen.getByTestId('task-t1')).toBeInTheDocument());
    expect(screen.queryByTestId('locked-t1')).toBeNull();
    expect(screen.queryByTestId('open-t1')).toBeNull();
  });

  it('لا مهام ⇒ رسالةٌ صريحة لا جدولٌ فارغ', async () => {
    mount([]);
    await waitFor(() => expect(screen.getByTestId('tasks-empty')).toBeInTheDocument());
  });
});
