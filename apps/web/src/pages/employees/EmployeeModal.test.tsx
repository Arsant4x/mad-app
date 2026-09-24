import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeModal } from './EmployeeModal';
import type { Employee } from '../../api/employees';
import type { Branch } from '../../api/branches';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (1.4 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
vi.setConfig({ testTimeout: 5_000 });

const branches: Branch[] = [{ id: 'br1', name: 'فرع الصالة', type: null, hours: null, activityId: null, activity: null, propertyId: null, warehouseId: null }];
const employee: Employee = {
  archived: false,
  id: 'e1',
  branchId: 'br1',
  fullName: 'سارة العتيبي',
  jobTitle: null,
  department: null,
  hireDate: '2026-01-01',
  baseSalary: '5000.00',
  phone: null,
  status: 'ACTIVE',
};

/**
 * 🔴 `ق-١٣٨٤` — **الرفضُ الكامن**: `UpdateEmployeeDto` لا يقبل `branchId` (`CreateEmployeeDto` وحدَه يقبله) و`forbidNonWhitelisted` يردّ `400`،
 * والنافذةُ كانت ترسله في التعديل — **فتعديلُ أيِّ موظّفٍ له فرع يُردّ**. فالفرعُ يُحدَّد عند الإنشاء ويُعرض في التعديل قراءةً.
 */
describe('نافذةُ الموظّف — الفرعُ عند الإنشاء وحدَه', () => {
  it('التعديلُ لا يرسل الفرعَ — ويعرضه قراءةً لا اختياراً', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EmployeeModal editing={employee} branches={branches} onCancel={() => {}} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.fullName).toBe(employee.fullName);
    // ⭐ هذا ما كان يُردّ `400` — الحقلُ في جسم التعديل.
    expect('branchId' in payload).toBe(false);
    // والشاشةُ تقول الحقيقة: الفرعُ يُعرض قراءةً لا اختياراً يُردّ.
    expect(screen.queryByRole('option', { name: 'فرع الصالة' })).toBeNull();
    expect(screen.getByText(/فرع الصالة/)).toBeTruthy();
  });

  it('والإنشاءُ يرسل الفرعَ المختار', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EmployeeModal editing={null} branches={branches} onCancel={() => {}} onSave={onSave} />);
    await userEvent.type(screen.getByPlaceholderText(/سارة العتيبي/), 'موظّفٌ جديد');
    const branchSelect = screen.getByRole('option', { name: 'فرع الصالة' }).closest('select')!;
    await userEvent.selectOptions(branchSelect, 'br1');
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الموظف' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as Record<string, unknown>).branchId).toBe('br1');
  });
});
