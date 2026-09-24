import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BankModal } from './BankModal';
import type { Bank } from '../../api/banks';
import type { Branch } from '../../api/branches';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (1.0 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
vi.setConfig({ testTimeout: 5_000 });

const branches: Branch[] = [{ id: 'br1', name: 'فرع الصالة', type: null, hours: null, activityId: null, activity: null, propertyId: null, warehouseId: null }];
const bank: Bank = { archived: false, id: 'b1', branchId: 'br1', name: 'درج الصالة', iban: null, balance: '0.00', openingBalance: '0.00', openingDate: '2026-01-01' };

/**
 * 🔴 `ق-١٣٨٤` — **الرفضُ الكامن**: `UpdateBankDto` لا يقبل `branchId` (`CreateBankDto` وحدَه يقبله) و`forbidNonWhitelisted` يردّ `400`،
 * والنافذةُ كانت ترسله في التعديل — **فتعديلُ أيِّ حسابٍ له فرع (والأدراجُ حساباتٌ بفروع) يُردّ**. فالفرعُ يُحدَّد عند الإنشاء ويُعرض في التعديل قراءةً.
 */
describe('نافذةُ الحساب البنكي — الفرعُ عند الإنشاء وحدَه', () => {
  it('التعديلُ لا يرسل الفرعَ — ويعرضه قراءةً لا اختياراً', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BankModal editing={bank} branches={branches} onCancel={() => {}} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.name).toBe('درج الصالة');
    // ⭐ هذا ما كان يُردّ `400` — الحقلُ في جسم التعديل.
    expect('branchId' in payload).toBe(false);
    // والشاشةُ تقول الحقيقة: الفرعُ يُعرض قراءةً لا اختياراً يُردّ.
    expect(screen.queryByRole('option', { name: 'فرع الصالة' })).toBeNull();
    expect(screen.getByText(/فرع الصالة/)).toBeTruthy();
  });

  it('والإنشاءُ يرسل الفرعَ المختار', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BankModal editing={null} branches={branches} onCancel={() => {}} onSave={onSave} />);
    await userEvent.type(screen.getByPlaceholderText(/مصرف الراجحي/), 'بنك جديد');
    const branchSelect = screen.getByRole('option', { name: 'فرع الصالة' }).closest('select')!;
    await userEvent.selectOptions(branchSelect, 'br1');
    await userEvent.click(screen.getByRole('button', { name: 'إضافة الحساب' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as Record<string, unknown>).branchId).toBe('br1');
  });
});
