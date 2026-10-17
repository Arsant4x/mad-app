import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DueReminders } from '../../api/reminders';
import i18n from '../../i18n';
import { RemindersPage } from './RemindersPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/reminders', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDueReminders: vi.fn(),
}));
vi.mock('../../api/companyUsers', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listCompanyUsers: vi.fn(),
}));
const grants = new Set<string>();
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => grants.has(`${screen}:${action}`) }),
}));

import { listCompanyUsers } from '../../api/companyUsers';
import { getDueReminders } from '../../api/reminders';

const due: DueReminders = {
  enabled: true,
  policy: { enabled: true, daysBefore: 3, repeatEveryDays: 7, escalateAfterDays: null, escalateToUserId: null },
  total: 1,
  truncated: false,
  reminders: [
    {
      installmentId: 'i1',
      contractId: 'c1',
      contractNo: 'EJ-2026-0001',
      tenant: 'Tenant One',
      phone: null,
      unitNo: '101',
      propertyName: 'Tower',
      dueDate: '2026-10-01',
      amount: '1000.00',
      overdueDays: 5,
      lastSentAt: null,
      daysSinceLast: null,
      message: 'Rent is due',
    },
  ],
};

const recordSend = () => screen.queryByRole('button', { name: i18n.t('reminders.page.record_send') });

async function mount() {
  render(<RemindersPage />);
  await waitFor(() => expect(screen.getByText('Tenant One')).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  grants.clear();
  vi.mocked(getDueReminders).mockResolvedValue(due);
  vi.mocked(listCompanyUsers).mockResolvedValue([]);
});

/** Logging a sent reminder needs record on contracts; without it the server refuses, so the row does not offer it. */
describe('Recording a sent reminder follows the record action', () => {
  it('hides the record button from a view only employee and keeps copy', async () => {
    grants.add('contracts:view');
    await mount();
    expect(recordSend()).toBeNull();
    expect(screen.queryByRole('button', { name: i18n.t('reminders.page.copy') })).not.toBeNull();
  });

  it('shows the record button with record', async () => {
    grants.add('contracts:view').add('contracts:record');
    await mount();
    expect(recordSend()).not.toBeNull();
  });
});

/** The policy is shown to everyone who opens the screen and changed only with edit on contracts. */
describe('The reminder policy follows the edit action', () => {
  // The policy card is the first card on the screen: three numbers, the switch and the escalation picker.
  const policyControls = () => [...document.querySelector('.card')!.querySelectorAll('input, select')] as HTMLInputElement[];

  it('shows the policy read only to an employee without edit', async () => {
    grants.add('contracts:view').add('contracts:record');
    await mount();
    expect(policyControls().map((c) => c.disabled)).toEqual([true, true, true, true, true]);
  });

  it('lets an employee with edit change it', async () => {
    grants.add('contracts:view').add('contracts:edit');
    await mount();
    expect(policyControls().map((c) => c.disabled)).toEqual([false, false, false, false, false]);
  });
});
