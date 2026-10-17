import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '../../api/employees';
import i18n from '../../i18n';
import { EmployeesPage } from './EmployeesPage';

vi.mock('../../api/employees', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listEmployees: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  setEmployeeSalary: vi.fn(),
  getEmployeeSalary: vi.fn(),
}));
vi.mock('../../api/branches', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listBranches: vi.fn() }));
const grants = new Set<string>();
vi.mock('../../auth/PermissionsContext', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePermissions: () => ({ can: (screen: string, action: string) => grants.has(`${screen}:${action}`) }),
}));

import { listBranches } from '../../api/branches';
import { createEmployee, listEmployees, setEmployeeSalary } from '../../api/employees';

// File budget: a first estimate before it is measured under the full suite's load.
vi.setConfig({ testTimeout: 15_000 });

const employee: Employee = { archived: false, id: 'e1', branchId: null, fullName: 'سارة العتيبي', jobTitle: null, department: null, hireDate: '2026-01-01', phone: null, status: 'ACTIVE' };

describe('Employees page: the salary', () => {
  beforeEach(() => {
    grants.clear();
    vi.mocked(listBranches).mockResolvedValue([]);
    vi.mocked(listEmployees).mockResolvedValue([employee]);
    vi.mocked(createEmployee).mockReset();
    vi.mocked(setEmployeeSalary).mockReset();
  });

  it('the list has no salary column', async () => {
    grants.add('employees:salaries');
    render(<EmployeesPage />);
    expect(await screen.findByText('سارة العتيبي')).toBeTruthy();
    expect(screen.getByText('تاريخ التعيين')).toBeTruthy();
    expect(screen.queryByText('الراتب الأساسي')).toBeNull();
  });

  it('a new employee with a salary is created first, then the salary is set on its own path', async () => {
    grants.add('employees:salaries').add('employees:add');
    vi.mocked(createEmployee).mockResolvedValue({ ...employee, id: 'new1', fullName: 'موظّفٌ جديد' });
    vi.mocked(setEmployeeSalary).mockResolvedValue({ employeeId: 'new1', baseSalary: '4000.00' });
    render(<EmployeesPage />);
    await userEvent.click(await screen.findByRole('button', { name: '+ موظف جديد' }));
    await userEvent.type(screen.getByPlaceholderText(/سارة العتيبي/), 'موظّفٌ جديد');
    await userEvent.type(screen.getByLabelText('الراتب الأساسي'), '4000');
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الموظف' }));
    await vi.waitFor(() => expect(setEmployeeSalary).toHaveBeenCalledWith('new1', 4000));
    expect('baseSalary' in (vi.mocked(createEmployee).mock.calls[0][0] as Record<string, unknown>)).toBe(false);
  });

  it('without the salaries action the window has no salary field', async () => {
    grants.add('employees:add');
    render(<EmployeesPage />);
    await userEvent.click(await screen.findByRole('button', { name: '+ موظف جديد' }));
    expect(screen.getByPlaceholderText(/سارة العتيبي/)).toBeTruthy();
    expect(screen.queryByLabelText('الراتب الأساسي')).toBeNull();
  });
});

describe('Employees page: the controls follow the actions', () => {
  beforeEach(() => {
    grants.clear();
    vi.mocked(listBranches).mockResolvedValue([]);
    vi.mocked(listEmployees).mockResolvedValue([employee]);
  });

  async function menuLabels(): Promise<string[]> {
    const menu = screen.queryByTitle(i18n.t('common.row_menu.options'));
    if (!menu) return [];
    await userEvent.click(menu);
    return [...document.querySelectorAll('.action-menu button')].map((b) => (b.textContent ?? '').trim());
  }

  it('a view only employee gets no new button and no row actions', async () => {
    grants.add('employees:view');
    render(<EmployeesPage />);
    expect(await screen.findByText('سارة العتيبي')).toBeTruthy();
    expect(screen.queryByRole('button', { name: i18n.t('employees.new') })).toBeNull();
    expect(await menuLabels()).toEqual([]);
  });

  it('each action shows its own control', async () => {
    grants.add('employees:view').add('employees:add').add('employees:edit').add('employees:delete');
    render(<EmployeesPage />);
    expect(await screen.findByRole('button', { name: i18n.t('employees.new') })).toBeTruthy();
    expect(await menuLabels()).toEqual([i18n.t('employees.menu.edit'), i18n.t('employees.menu.archive'), i18n.t('employees.menu.delete')]);
  });
});
