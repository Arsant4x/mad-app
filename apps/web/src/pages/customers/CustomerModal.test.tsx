import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BUYER_ID_SCHEMES, type Customer } from '../../api/customers';
import { CustomerModal } from './CustomerModal';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (1.5 ث — ثلاثةُ أضعافه دون الافتراضيّ،
//    فالميزانيةُ الافتراضيُّ نفسُه). معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

/**
 * 🔴 **الرفضُ الكامن — إنشاءُ عميلٍ بلا معرّفٍ بديل يُردّ `400`** (وجده توليدُ أنواع الطلب — خطّةُ الأنواع ③ · `ق-١٤٠٤`).
 *
 * النافذةُ كانت ترسل `otherIdScheme: ''` حين لا يُختار مخطّط، و`CreateCustomerDto` يقبل قائمتَه وحدَها (`@IsOptional` لا يتخطّى الفارغ) —
 * **مقيسٌ بالجسم نفسِه على الخادم: `400` «مخطّط المعرّف البديل غير معروف»**. فكلُّ عميلٍ جديدٍ بلا معرّفٍ بديل كان يُردّ.
 * والتعديلُ يقبل الفارغَ (`UpdateCustomerDto` يتخطّى بـ`ValidateIf`) — والمحوُ فيه `null` بنوعه.
 */
describe('نافذةُ العميل — المعرّفُ البديل على السلك (ق-١٤٠٤)', () => {
  it('🔴 الإنشاءُ بلا مخطّطٍ لا يرسل فارغاً يردّه الخادم — ولا يرسل إلا قيمةً من قائمته', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CustomerModal editing={null} onCancel={() => {}} onSave={onSave} />);
    await userEvent.type(screen.getByPlaceholderText(/شركة الأفق/), 'عميلٌ بلا معرّفٍ بديل');
    await userEvent.selectOptions(screen.getByLabelText('صفة العميل'), 'NATURAL');
    await userEvent.click(screen.getByRole('button', { name: 'إضافة العميل' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
    // ⭐ هذا ما كان يُردّ `400`.
    expect(payload.otherIdScheme).not.toBe('');
    expect(payload.otherIdScheme === undefined || (BUYER_ID_SCHEMES as readonly unknown[]).includes(payload.otherIdScheme)).toBe(true);
    expect(payload.otherId).not.toBe('');
  });

  it('والتعديلُ يمحو المعرّفَ البديل بـnull لا بفارغ', async () => {
    const editing = { id: 'c1', name: 'عميلٌ له معرّف', kind: 'NATURAL', otherIdScheme: 'NAT', otherId: '1234567890', country: 'SA', vatNumber: null, phone: null, creditLimit: '0.00', archived: false } as unknown as Customer;
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CustomerModal editing={editing} onCancel={() => {}} onSave={onSave} />);
    await userEvent.selectOptions(screen.getByLabelText(/المعرّف البديل/), '');
    await userEvent.clear(screen.getByLabelText('رقم المعرّف'));
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.otherIdScheme).toBeNull();
    expect(payload.otherId).toBeNull();
  });
});
