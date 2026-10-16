import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OwnerTemplateModal } from './OwnerTemplateModal';

// File budget: a first estimate before it is measured under the full suite's load.
vi.setConfig({ testTimeout: 15_000 });

/** The salaries action has a box on the employees row only, and "every action" on that screen includes it. */
describe('Owner template editor: the salaries action', () => {
  const rowOf = (screenName: string) => screen.getByText(screenName).closest('tr')!;

  it('only the employees row has a salaries box, and a newly granted employees screen starts with it ticked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<OwnerTemplateModal editing={null} onCancel={() => {}} onSave={onSave} />);
    expect(screen.getByRole('columnheader', { name: 'الرواتب' })).toBeTruthy();
    // The screen box plus seven general actions on contracts, one more on employees.
    expect(rowOf('عقود الإيجار').querySelectorAll('input[type="checkbox"]')).toHaveLength(8);
    expect(rowOf('الموظفون والموارد البشرية').querySelectorAll('input[type="checkbox"]')).toHaveLength(9);

    await userEvent.type(screen.getByPlaceholderText(/محرِّر عقود/), 'شؤون الموظفين');
    await userEvent.click(rowOf('الموظفون والموارد البشرية').querySelector('input')!);
    await userEvent.click(rowOf('عقود الإيجار').querySelector('input')!);
    await userEvent.click(screen.getByRole('button', { name: 'إنشاء النموذج' }));
    const sent = onSave.mock.calls[0][0] as { screenActions: Record<string, string[]> };
    expect(sent.screenActions.employees).toContain('salaries');
    expect(sent.screenActions.contracts).not.toContain('salaries');
  });

  it('an existing template listing the employees screen without the action shows it unticked', () => {
    render(
      <OwnerTemplateModal
        editing={{ id: 't1', companyId: 'c1', name: 'كاتب', isSystem: false, isAllScreens: false, allowedScreens: ['employees'], screenActions: { employees: ['view', 'edit'] }, isNewUserDefault: false, createdAt: '' }}
        onCancel={() => {}}
        onSave={vi.fn()}
      />,
    );
    const boxes = [...rowOf('الموظفون والموارد البشرية').querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    // Screen box, then view, add, edit, delete, record, review, audit, salaries.
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false, true, false, false, false, false, false]);
  });
});
