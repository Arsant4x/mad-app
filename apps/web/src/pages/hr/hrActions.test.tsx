import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { today } from '../../lib/format';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { HrPage } from './HrPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/employees', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listEmployees: vi.fn() }));
vi.mock('../../api/leaves', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listLeaveTypes: vi.fn(), listLeaveRequests: vi.fn() }));
vi.mock('../../api/attendance', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listAttendance: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listAttendance } from '../../api/attendance';
import { listEmployees } from '../../api/employees';
import { listLeaveRequests, listLeaveTypes } from '../../api/leaves';

beforeEach(() => {
  resetGrants('employees:view');
  vi.mocked(listEmployees).mockResolvedValue([]);
  vi.mocked(listLeaveTypes).mockResolvedValue([{ id: 'lt1', name: 'Annual', annualDays: 21, paid: true }] as never);
  vi.mocked(listLeaveRequests).mockResolvedValue([
    {
      id: 'r1',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      days: 2,
      reason: null,
      status: 'PENDING',
      requestedById: null,
      requestedByName: null,
      decidedAt: null,
      decidedNote: null,
      decidedById: null,
      decidedByName: null,
      employee: { id: 'e1', fullName: 'Sara' },
      leaveType: { id: 'lt1', name: 'Annual', paid: true, annualDays: 21 },
    },
  ] as never);
  vi.mocked(listAttendance).mockResolvedValue([{ id: 'a1', date: today(), status: 'PRESENT', checkIn: '08:00', checkOut: null, notes: null, employee: { id: 'e1', fullName: 'Present Sara' } }]);
});

async function shown() {
  render(<HrPage />);
  await screen.findByText('Present Sara');
  fireEvent.click(screen.getByText(i18n.t('hr.types.show')));
}

/** Attendance records, edits and deletes; leave types and requests add, are decided by review, and deleted by delete. */
describe('HR controls follow the actions', () => {
  it('a view only employee reads attendance, leave types and requests with no control', async () => {
    await shown();
    expect(hasButton(i18n.t('hr.attendance.add'))).toBe(false);
    expect(hasButton(i18n.t('hr.attendance.check_out_now'))).toBe(false);
    expect(hasButton(i18n.t('hr.common.delete'))).toBe(false);
    expect(hasButton(i18n.t('hr.requests.add'))).toBe(false);
    expect(hasButton(i18n.t('hr.types.add'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('employees:record').add('employees:edit').add('employees:delete').add('employees:add').add('employees:review');
    await shown();
    expect(hasButton(i18n.t('hr.attendance.add'))).toBe(true);
    expect(hasButton(i18n.t('hr.attendance.check_out_now'))).toBe(true);
    expect(hasButton(i18n.t('hr.common.delete'))).toBe(true);
    expect(hasButton(i18n.t('hr.requests.add'))).toBe(true);
    expect(hasButton(i18n.t('hr.types.add'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('hr.requests.approve'), i18n.t('hr.requests.reject'), i18n.t('hr.requests.delete')]);
  });

  it('review decides a request without being able to delete it', async () => {
    grants.add('employees:review');
    await shown();
    expect(rowMenuLabels()).toEqual([i18n.t('hr.requests.approve'), i18n.t('hr.requests.reject')]);
  });
});
