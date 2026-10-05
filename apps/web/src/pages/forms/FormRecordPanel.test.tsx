import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormInstance } from '../../api/forms';
import { FormRecordPanel } from './FormRecordPanel';

vi.mock('../../api/forms', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  setContractFormValues: vi.fn(),
  sealContractForm: vi.fn(),
  verifyContractForm: vi.fn(),
  deleteContractForm: vi.fn(),
}));

import { sealContractForm, setContractFormValues, verifyContractForm } from '../../api/forms';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيس.
vi.setConfig({ testTimeout: 15_000 });

/**
 * ⚖️ **السجلُّ في شاشة «النماذج»** (توجيه ٢٧٨ · `ق-١٦٣٨` · الموجة ١د): التعبئةُ «تسجيل» والختمُ «مراجعة»، والمختومُ يُقرأ ببصمته
 * ورقمه ولا يُحرَّر، والمطبوعُ يحمل بصمةَ التحقّق وسطرَ «مكمّلٌ لنموذج إيجار».
 */
const contract = { id: 'c1', no: 'EJ-2026-0042', tenant: 'محمّد', unitNo: '305', propertyName: 'برج النخيل' };
const HASH = 'a'.repeat(64);

const draft: FormInstance = {
  status: 'DRAFT',
  id: 'f1',
  templateVersionId: 't1',
  template: { id: 't1', familyId: 't1', version: 4, name: 'تسليمُ شقّة', formType: { id: 'ft', code: 'UNIT_HANDOVER', name: 'تسليمُ وحدة' } },
  linkedEntityType: 'contract',
  linkedEntityId: 'c1',
  formDate: '2026-10-04',
  no: null,
  sealSeq: null,
  contentHash: null,
  prevHash: null,
  filledByName: 'salem',
  sealedByName: null,
  sealedAt: null,
  createdAt: '2026-10-04T10:00:00.000Z',
  items: [
    {
      itemId: 'i1',
      lineNo: 1,
      label: 'قراءةُ عدّاد الكهرباء',
      itemType: 'METER_READING',
      required: true,
      minValue: null,
      maxValue: null,
      isBlocking: false,
      unit: null,
      helpText: null,
      text: null,
      number: null,
      bool: null,
      note: null,
      outOfRange: false,
    },
  ],
};

const sealed: FormInstance = {
  ...draft,
  status: 'SEALED',
  no: 'FRM-2026-0001',
  sealSeq: 1,
  contentHash: HASH,
  sealedByName: 'salem',
  sealedAt: '2026-10-04T11:20:00.000Z',
  items: [{ ...draft.items[0], number: '48213' }],
};

const mount = (record: FormInstance, perms: { canRecord: boolean; canReview: boolean }, onChanged = vi.fn()) =>
  render(<FormRecordPanel contract={contract} record={record} {...perms} onChanged={onChanged} onDeleted={() => {}} onClose={() => {}} />);

beforeEach(() => vi.clearAllMocks());

describe('⚖️ السجلُّ المعبّأ في شاشة «النماذج» (ق-١٦٣٨)', () => {
  it('⭐ الختمُ «مراجعة»: من يعبّئ ولا يراجع لا يرى زرَّ الختم، ومن يراجع يراه', () => {
    const { unmount } = mount(draft, { canRecord: true, canReview: false });
    expect(screen.queryByRole('button', { name: 'ختم' })).toBeNull();
    expect(screen.getByRole('button', { name: 'حفظٌ كمسوّدة' })).toBeTruthy();
    unmount();
    mount(draft, { canRecord: true, canReview: true });
    expect(screen.getByRole('button', { name: 'ختم' })).toBeTruthy();
  });

  it('الحفظُ يرسل ما تغيّر وحدَه بنوع بنده', async () => {
    vi.mocked(setContractFormValues).mockResolvedValue({ ...draft, items: [{ ...draft.items[0], number: '48213' }] });
    mount(draft, { canRecord: true, canReview: false });
    fireEvent.change(screen.getByLabelText('قراءةُ عدّاد الكهرباء'), { target: { value: '48213' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظٌ كمسوّدة' }));
    await waitFor(() => expect(setContractFormValues).toHaveBeenCalledWith('c1', 'f1', [{ itemId: 'i1', number: 48213, note: null }]));
  });

  it('⭐ الختمُ يحفظ ما لم يُحفظ أوّلاً ثم يختم، فلا يُختم غيرُ ما على الشاشة', async () => {
    vi.mocked(setContractFormValues).mockResolvedValue({ ...draft, items: [{ ...draft.items[0], number: '7' }] });
    vi.mocked(sealContractForm).mockResolvedValue(sealed);
    const onChanged = vi.fn();
    mount(draft, { canRecord: true, canReview: true }, onChanged);
    fireEvent.change(screen.getByLabelText('قراءةُ عدّاد الكهرباء'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'ختم' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'ختم' }).at(-1)!);
    await waitFor(() => expect(sealContractForm).toHaveBeenCalledWith('c1', 'f1'));
    expect(vi.mocked(setContractFormValues).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sealContractForm).mock.invocationCallOrder[0]);
    expect(onChanged).toHaveBeenLastCalledWith(sealed);
  });

  it('⭐ المختومُ يُقرأ ببصمته ورقمه ولا يُحرَّر، والمطبوعُ يحمل سطرَ إيجار', () => {
    mount(sealed, { canRecord: true, canReview: true });
    expect(screen.queryByLabelText('قراءةُ عدّاد الكهرباء')).toBeNull();
    const block = screen.getByTestId('form-seal-block');
    expect(block.textContent).toContain('FRM-2026-0001');
    expect(block.textContent).toContain(HASH);
    expect(block.textContent).toContain('أوّلُ ختمٍ في المنشأة');
    const sheet = screen.getByTestId('form-print-sheet');
    expect(sheet.className).toBe('print-receipt');
    expect(sheet.textContent).toContain('مكمّلٌ لنموذج إيجار');
    expect(screen.queryByRole('button', { name: 'ختم' })).toBeNull();
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeTruthy();
  });

  it('⭐ «الحالة» قائمةٌ من السلّم الثابت، والقيمةُ القديمة تُرى ولا تُختار، ويُرسل الرمز (ق-١٦٤١/٥)', async () => {
    const cond = { ...draft.items[0], itemId: 'i2', lineNo: 2, label: 'حالةُ الخزائن', itemType: 'CONDITION' as const, required: false, text: 'خدشٌ قديم' };
    const withCond: FormInstance = { ...draft, items: [draft.items[0], cond] };
    vi.mocked(setContractFormValues).mockResolvedValue({ ...withCond, items: [draft.items[0], { ...cond, text: 'DAMAGED' }] });
    mount(withCond, { canRecord: true, canReview: false });
    const select = screen.getByLabelText('حالةُ الخزائن') as HTMLSelectElement;
    const options = [...select.options].map((o) => ({ value: o.value, text: o.textContent, disabled: o.disabled }));
    expect(options).toEqual([
      { value: '', text: '', disabled: false },
      { value: 'GOOD', text: 'جيّد', disabled: false },
      { value: 'FAIR', text: 'مقبول', disabled: false },
      { value: 'DAMAGED', text: 'تالف', disabled: false },
      { value: 'خدشٌ قديم', text: 'قيمةٌ قديمة: خدشٌ قديم', disabled: true },
    ]);
    fireEvent.change(select, { target: { value: 'DAMAGED' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظٌ كمسوّدة' }));
    await waitFor(() => expect(setContractFormValues).toHaveBeenCalledWith('c1', 'f1', [{ itemId: 'i2', text: 'DAMAGED', note: null }]));
  });

  it('والتحقّقُ يقول إن المحتوى تغيّر حين لا تطابق البصمةُ المعادة', async () => {
    vi.mocked(verifyContractForm).mockResolvedValue({ no: 'FRM-2026-0001', contentHash: HASH, recomputedHash: 'b'.repeat(64), contentIntact: false, chainLinked: true, valid: false });
    mount(sealed, { canRecord: false, canReview: false });
    fireEvent.click(screen.getByRole('button', { name: 'تحقّق' }));
    await waitFor(() => expect(screen.getByTestId('form-verification').textContent).toContain('محتوى السجلّ تغيّر'));
  });
});
