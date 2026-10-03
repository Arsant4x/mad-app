import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '../../api/customers';
import type { Property } from '../../api/properties';
import type { Unit } from '../../api/units';
import { ContractModal } from './ContractModal';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (12.5 ث).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 38_000 });

/**
 * **المستأجرُ يُختار بمعرّفه لا يُكتب باسمه** (`ق-١٠٢٨`/① · `ق-١٠٢٩`/③):
 * ① النموذجُ يرسل `customerId` المختار ولا يرسل `tenant`/`phone` — فالخادمُ لا يقبلهما.
 * ② بلا عميلٍ مختار لا يُرسَل شيء.
 * ③ «عميلٌ جديد» يمرّ بمسار العملاء؛ وحين يردّ الخادمُ «أهو نفسُه؟» يُعرض السؤالُ ولا يُفترض الجواب،
 *    والتأكيدُ يعيد الطلبَ بـ`allowSameName` ثم يختار المُنشأ.
 */
const unit = { id: 'u1', propertyId: 'p1', unitNo: 'A-1', type: 'تجاري', rentMonthly: '1000' } as unknown as Unit;
const property = { id: 'p1', name: 'عقار الاختبار' } as unknown as Property;
const customer = (id: string, name: string, phone = ''): Customer => ({ id, name, vatNumber: null, phone, creditLimit: '0', archived: false }) as unknown as Customer;

function fillRequired() {
  // أوّلُ حقلٍ بـ`0.00` هو قيمةُ العقد (الثاني مبلغُ التأمين)
  fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '12000' } });
  const [classification, vatInclusion] = screen.getAllByRole('combobox').filter((s) => (s as HTMLSelectElement).options[0]?.textContent?.includes('اختر'));
  fireEvent.change(classification, { target: { value: 'COMMERCIAL' } });
  fireEvent.change(vatInclusion, { target: { value: 'EXCLUSIVE' } });
}

describe('نموذجُ العقد — منتقي العميل', () => {
  it('① يرسل customerId المختار ولا يرسل اسماً ولا هاتفاً', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ContractModal units={[unit]} properties={[property]} customers={[customer('c1', 'سعد الغامدي', '0500000001'), customer('c2', 'نورة العتيبي')]} onCancel={() => {}} onSave={onSave} onCreateCustomer={vi.fn()} />);
    const picker = screen.getByRole('listbox');
    fireEvent.change(picker, { target: { value: 'c2' } });
    fillRequired();
    fireEvent.click(screen.getByText('إضافة العقد'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.customerId).toBe('c2');
    expect(payload).not.toHaveProperty('tenant');
    expect(payload).not.toHaveProperty('phone');
  });

  it('② بلا عميلٍ مختار لا يُرسَل شيء', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ContractModal units={[unit]} properties={[property]} customers={[customer('c1', 'سعد الغامدي')]} onCancel={() => {}} onSave={onSave} onCreateCustomer={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByText('إضافة العقد'));
    await waitFor(() => expect(document.querySelector('.error-text')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('③ «عميلٌ جديد»: تنبيهُ «أهو نفسُه؟» يُعرض ولا يُفترض، والتأكيدُ يعيد الطلبَ بعلَمه ثم يختار المُنشأ', async () => {
    const created = customer('c9', 'خالد الدوسري', '0500000009');
    const onCreateCustomer = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 409, data: { message: 'يوجد عميلٌ بهذا الاسم — أهو نفسُه؟ اختره من القائمة، أو أكِّد الإنشاء إن كان شخصاً آخر بالاسم نفسِه' } } })
      .mockResolvedValueOnce(created);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ContractModal units={[unit]} properties={[property]} customers={[customer('c1', 'خالد الدوسري')]} onCancel={() => {}} onSave={onSave} onCreateCustomer={onCreateCustomer} />);
    fireEvent.click(screen.getByText('+ عميلٌ جديد'));
    fireEvent.change(screen.getByPlaceholderText('اسم المستأجر'), { target: { value: 'خالد الدوسري' } });
    // ②A1: بلا صفةٍ لا يُرسَل شيء — الشاشةُ تسأل، والخادمُ يرفض؛ ثم تُختار فيمضي.
    fireEvent.click(screen.getByText('حفظ العميل واختياره'));
    expect(onCreateCustomer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('صفة المستأجر'), { target: { value: 'NATURAL' } });
    fireEvent.click(screen.getByText('حفظ العميل واختياره'));
    await waitFor(() => expect(screen.getByText(/أهو نفسُه/)).toBeTruthy());
    expect(onCreateCustomer).toHaveBeenCalledTimes(1);
    expect(onCreateCustomer.mock.calls[0][0]).not.toHaveProperty('allowSameName');
    fireEvent.click(screen.getByText(/نعم، شخصٌ آخر/));
    await waitFor(() => expect(onCreateCustomer).toHaveBeenCalledTimes(2));
    expect(onCreateCustomer.mock.calls[1][0]).toMatchObject({ name: 'خالد الدوسري', kind: 'NATURAL', allowSameName: true });
    await waitFor(() => expect((screen.getByRole('listbox') as HTMLSelectElement).value).toBe('c9'));
  });

  it('④ ⚖️ عقارُ تشغيل: المؤجّرُ يُعلَن ولا يُفترض، والمالكُ مؤجّراً يُرسل اسمَه ورقمَه (السؤال ٥٧٧)', async () => {
    const managedProperty = { id: 'p1', name: 'عقار التشغيل', ownership: 'managed', opRate: '10.00' } as unknown as Property;
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ContractModal units={[unit]} properties={[managedProperty]} customers={[customer('c1', 'سعد الغامدي')]} onCancel={() => {}} onSave={onSave} onCreateCustomer={vi.fn()} />);
    fireEvent.change(screen.getByRole('listbox'), { target: { value: 'c1' } });
    fillRequired();
    // بلا مؤجّرٍ مختار لا يُرسل شيء.
    fireEvent.click(screen.getByText('إضافة العقد'));
    await waitFor(() => expect(screen.getByText(/اختر المؤجّر/)).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
    // والمالكُ مؤجّراً بلا اسمه لا يُرسل كذلك.
    fireEvent.change(screen.getByLabelText('من المؤجّر في العقد؟'), { target: { value: 'OWNER' } });
    fireEvent.click(screen.getByText('إضافة العقد'));
    await waitFor(() => expect(screen.getByText(/اكتب اسم المالك/)).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('اسم المالك'), { target: { value: 'مالكُ المحلّات' } });
    fireEvent.change(screen.getByLabelText('الرقم الضريبيّ للمالك'), { target: { value: '300000000000003' } });
    fireEvent.click(screen.getByText('إضافة العقد'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ lessor: 'OWNER', ownerName: 'مالكُ المحلّات', ownerVatNumber: '300000000000003' });
  });

  it('⑤ وعلى عقارٍ مملوك لا حقلَ للمؤجّر ولا يُرسل — فالمؤجّرُ المنشأةُ واقعةً', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ContractModal units={[unit]} properties={[property]} customers={[customer('c1', 'سعد الغامدي')]} onCancel={() => {}} onSave={onSave} onCreateCustomer={vi.fn()} />);
    expect(screen.queryByLabelText('من المؤجّر في العقد؟')).toBeNull();
    fireEvent.change(screen.getByRole('listbox'), { target: { value: 'c1' } });
    fillRequired();
    fireEvent.click(screen.getByText('إضافة العقد'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('lessor');
  });
});
