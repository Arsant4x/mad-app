import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceRecord } from '../../api/attendance';
import { toLocalISODate, today } from '../../lib/format';
import { HrPage } from './HrPage';

vi.mock('../../api/employees', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listEmployees: vi.fn() }));
vi.mock('../../api/leaves', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listLeaveTypes: vi.fn(),
  listLeaveRequests: vi.fn(),
}));
vi.mock('../../api/attendance', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listAttendance: vi.fn(),
  updateAttendance: vi.fn(),
}));
// Every action held: this file measures the check out button by day, not the grant.
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).allGrantedModule());

import { listAttendance } from '../../api/attendance';
import { listEmployees } from '../../api/employees';
import { listLeaveRequests, listLeaveTypes } from '../../api/leaves';

// File budget: a first estimate before it is measured under the full suite's load.
vi.setConfig({ testTimeout: 15_000 });

function presentWithoutCheckOut(date: string): AttendanceRecord {
  // A different name per day lets the test wait for the chosen day's rows to render.
  const fullName = date === today() ? 'سارة العتيبي' : 'خالد الزهراني';
  return { id: `a-${date}`, date, status: 'PRESENT', checkIn: '08:00', checkOut: null, notes: null, employee: { id: 'e1', fullName } };
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

describe('HR page: the check out now button', () => {
  beforeEach(() => {
    vi.mocked(listEmployees).mockResolvedValue([]);
    vi.mocked(listLeaveTypes).mockResolvedValue([]);
    vi.mocked(listLeaveRequests).mockResolvedValue([]);
    vi.mocked(listAttendance).mockImplementation(async (date?: string) => [presentWithoutCheckOut(date ?? today())]);
  });

  it('is shown for a present row without a check out on today', async () => {
    render(<HrPage />);
    expect(await screen.findByText('سارة العتيبي')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'انصراف الآن' })).toBeTruthy();
  });

  it('is not shown for a present row without a check out on a past day', async () => {
    const { container } = render(<HrPage />);
    await screen.findByText('سارة العتيبي');
    const day = yesterday();
    fireEvent.change(container.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: day } });
    expect(await screen.findByText('خالد الزهراني')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'انصراف الآن' })).toBeNull();
  });
});
