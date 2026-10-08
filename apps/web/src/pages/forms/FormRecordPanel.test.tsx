import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormInstance } from '../../api/forms';
import { FormRecordPanel } from './FormRecordPanel';

vi.mock('../../api/forms', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  setContractFormValues: vi.fn(),
  verifyContractForm: vi.fn(),
  deleteContractForm: vi.fn(),
  sendContractForm: vi.fn(),
  resendContractFormLink: vi.fn(),
  reviseContractForm: vi.fn(),
  contractFormDeviceLink: vi.fn(),
  paperSignContractForm: vi.fn(),
  contractFormEvents: vi.fn(),
  requestContractFormSubstitute: vi.fn(),
}));

// لوحةُ الرسم في jsdom بلا لوحةٍ حقيقية: زرٌّ يسلّم صورةً كما يسلّمها الرسم.
vi.mock('../../components/SignaturePad', () => ({
  SignaturePad: ({ onChange, label }: { onChange: (b: Blob | null) => void; label?: string }) => (
    <button type="button" onClick={() => onChange(new Blob(['png'], { type: 'image/png' }))}>
      {`ارسم ${label ?? ''}`}
    </button>
  ),
}));

import { paperSignContractForm, requestContractFormSubstitute, reviseContractForm, sendContractForm, setContractFormValues, verifyContractForm } from '../../api/forms';

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
  sealFormat: null,
  createdAt: '2026-10-04T10:00:00.000Z',
  revisionGroupId: 'f1',
  revisionNo: 1,
  previousRevisionId: null,
  sentAt: null,
  signDeadline: null,
  nafathRequired: false,
  signatures: [],
  objection: null,
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

const awaiting: FormInstance = {
  ...draft,
  status: 'AWAITING_SIGNATURE',
  sentAt: '2026-10-04T10:30:00.000Z',
  signDeadline: '2026-10-11T10:30:00.000Z',
  items: [{ ...draft.items[0], number: '48213' }],
  signatures: [
    {
      id: 's1',
      role: 'STAFF',
      level: 'DRAWN_STAFF_SESSION',
      channel: 'STAFF_DEVICE',
      signerName: 'salem',
      mobileMasked: null,
      witnessUserName: null,
      authorityType: null,
      authorityRef: null,
      authorityVerification: null,
      signedAt: '2026-10-04T10:30:00.000Z',
    },
  ],
};

const mount = (record: FormInstance, perms: { canRecord: boolean; canReview: boolean }, onChanged = vi.fn(), onRevised = vi.fn()) =>
  render(<FormRecordPanel contract={contract} record={record} {...perms} onChanged={onChanged} onRevised={onRevised} onDeleted={() => {}} onClose={() => {}} />);

beforeEach(() => vi.clearAllMocks());

describe('⚖️ السجلُّ المعبّأ في شاشة «النماذج» (ق-١٦٣٨)', () => {
  it('⭐ التوقيعُ والإرسال «مراجعة»: من يعبّئ ولا يراجع لا يرى الزرّ، ومن يراجع يراه، ولا ختمَ باليد (توجيه ٢٨٧ ⑨)', () => {
    const { unmount } = mount(draft, { canRecord: true, canReview: false });
    expect(screen.queryByRole('button', { name: 'توقيعٌ وإرسال' })).toBeNull();
    expect(screen.getByRole('button', { name: 'حفظٌ كمسوّدة' })).toBeTruthy();
    unmount();
    mount(draft, { canRecord: true, canReview: true });
    expect(screen.getByRole('button', { name: 'توقيعٌ وإرسال' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ختم' })).toBeNull();
  });

  it('⭐ التوقيعُ يحفظ ما لم يُحفظ أوّلاً ثم يرسل الرسمَ، ولا يُرسل قبل أن يُرسم', async () => {
    vi.mocked(setContractFormValues).mockResolvedValue({ ...draft, items: [{ ...draft.items[0], number: '7' }] });
    vi.mocked(sendContractForm).mockResolvedValue({ form: awaiting, delivery: 'SENT' });
    const onChanged = vi.fn();
    mount(draft, { canRecord: true, canReview: true }, onChanged);
    fireEvent.change(screen.getByLabelText('قراءةُ عدّاد الكهرباء'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'توقيعٌ وإرسال' }));
    const submit = () => screen.getAllByRole('button', { name: 'توقيعٌ وإرسال' }).at(-1)! as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'ارسم توقيعُ الموظّف' }));
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await waitFor(() => expect(sendContractForm).toHaveBeenCalledWith('c1', 'f1', expect.any(Blob), null, null));
    expect(vi.mocked(setContractFormValues).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sendContractForm).mock.invocationCallOrder[0]);
    expect(onChanged).toHaveBeenLastCalledWith(awaiting);
  });

  it('⭐ الشخصُ الاعتباريّ: حقولُ الممثّل إلزاميّةٌ قبل الإرسال، وتُرسل مع الرسم (توجيه ٢٨٧ ⑥)', async () => {
    vi.mocked(sendContractForm).mockResolvedValue({ form: awaiting, delivery: 'SENT' });
    mount({ ...draft, items: [{ ...draft.items[0], number: '1' }] }, { canRecord: true, canReview: true });
    fireEvent.click(screen.getByRole('button', { name: 'توقيعٌ وإرسال' }));
    fireEvent.click(screen.getByRole('button', { name: 'ارسم توقيعُ الموظّف' }));
    fireEvent.click(screen.getByLabelText(/شخصٌ اعتباريّ/));
    const submit = () => screen.getAllByRole('button', { name: 'توقيعٌ وإرسال' }).at(-1)! as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('اسمُ الممثّل'), { target: { value: 'مدير الشركة' } });
    fireEvent.change(screen.getByLabelText('جوالُ الممثّل'), { target: { value: '0555123456' } });
    fireEvent.change(screen.getByLabelText('رقمُ السجلّ التجاريّ'), { target: { value: '1010101010' } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await waitFor(() =>
      expect(sendContractForm).toHaveBeenCalledWith(
        'c1',
        'f1',
        expect.any(Blob),
        expect.objectContaining({ name: 'مدير الشركة', mobile: '0555123456', authorityType: 'CR_MANAGER', authorityRef: '1010101010' }),
        null,
      ),
    );
  });

  it('⭐ ما ينتظر التوقيع لا يُحرَّر ولا يُحذف، وله إعادةُ الرابط وجهازُ الموظّف والورقيّ، والورقيُّ هنا بلا رسم', async () => {
    vi.mocked(paperSignContractForm).mockResolvedValue({ form: { ...awaiting, status: 'SEALED' }, finalCopy: 'SENT' });
    mount(awaiting, { canRecord: true, canReview: true });
    expect(screen.queryByLabelText('قراءةُ عدّاد الكهرباء')).toBeNull();
    expect(screen.queryByRole('button', { name: 'حذفُ المسوّدة' })).toBeNull();
    expect(screen.getByText('ينتظر التوقيع')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إعادةُ إرسال الرابط' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'توقيعٌ على هذا الجهاز' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'توقيعٌ ورقيّ' }));
    expect(screen.queryByRole('button', { name: /^ارسم/ })).toBeNull();
    const file = new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('صورةُ الورقة الموقَّعة'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'رفعٌ وختم' }));
    await waitFor(() => expect(paperSignContractForm).toHaveBeenCalledWith('c1', 'f1', file, null, ''));
  });

  it('⭐ المستلمُ البديل «مراجعة»: اسمُه وجوالُه إلزاميّان، ويُرسل طلبُ الموافقة ولا رمزَ يعود للموظّف (توجيه ٢٨٧ ⑦)', async () => {
    vi.mocked(requestContractFormSubstitute).mockResolvedValue({ form: awaiting, delivery: 'SENT' });
    const { unmount } = mount(awaiting, { canRecord: true, canReview: false });
    expect(screen.queryByRole('button', { name: 'مستلمٌ بديل' })).toBeNull();
    unmount();
    mount(awaiting, { canRecord: true, canReview: true });
    fireEvent.click(screen.getByRole('button', { name: 'مستلمٌ بديل' }));
    const submit = () => screen.getByRole('button', { name: 'إرسالُ طلب الموافقة' }) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('اسمُ البديل'), { target: { value: 'أخو المستأجر' } });
    fireEvent.change(screen.getByLabelText('جوالُ البديل'), { target: { value: '0566123101' } });
    fireEvent.click(submit());
    await waitFor(() => expect(requestContractFormSubstitute).toHaveBeenCalledWith('c1', 'f1', { name: 'أخو المستأجر', mobile: '0566123101' }));
    expect(await screen.findByText(/يوافق به على البديل برمزه/)).toBeTruthy();
    // ولا خانةَ لرقم الهويّة في نموذجٍ لا يشترط نفاذ.
    expect(screen.queryByLabelText('رقمُ هويّة البديل')).toBeNull();
  });

  it('⭐ البديلُ في نموذجٍ يشترط نفاذ: رقمُ هويّته إلزاميٌّ ويُرسل معه (ق-١٦٧٧)', async () => {
    vi.mocked(requestContractFormSubstitute).mockResolvedValue({ form: awaiting, delivery: 'SENT' });
    mount({ ...awaiting, nafathRequired: true }, { canRecord: true, canReview: true });
    fireEvent.click(screen.getByRole('button', { name: 'مستلمٌ بديل' }));
    const submit = () => screen.getByRole('button', { name: 'إرسالُ طلب الموافقة' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText('اسمُ البديل'), { target: { value: 'أخو المستأجر' } });
    fireEvent.change(screen.getByLabelText('جوالُ البديل'), { target: { value: '0566123101' } });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('رقمُ هويّة البديل'), { target: { value: '1098765432' } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await waitFor(() =>
      expect(requestContractFormSubstitute).toHaveBeenCalledWith('c1', 'f1', { name: 'أخو المستأجر', mobile: '0566123101', nationalId: '1098765432' }),
    );
  });

  it('⭐ الورقيّ عن شخصٍ اعتباريّ: الموقّعُ يُختار صراحةً، والممثّلُ المعيَّن اختيارٌ لا خاناتٌ متروكة (ق-١٦٧٨)', async () => {
    vi.mocked(paperSignContractForm).mockResolvedValue({ form: { ...awaiting, status: 'SEALED' }, finalCopy: 'SENT' });
    mount(awaiting, { canRecord: true, canReview: true });
    fireEvent.click(screen.getByRole('button', { name: 'توقيعٌ ورقيّ' }));
    const file = new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('صورةُ الورقة الموقَّعة'), { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText(/شخصٌ اعتباريّ ووقّع عنه ممثّلُه/));
    const submit = screen.getByRole('button', { name: 'رفعٌ وختم' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/الممثّلُ المعيَّن عند الإرسال هو من وقّع/));
    expect(screen.queryByLabelText('من وقّع الورقةَ بيده')).toBeNull();
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(paperSignContractForm).toHaveBeenCalledWith('c1', 'f1', file, null, '', null, null, true));
    expect(await screen.findByText(/جوال المستأجر المسجَّل/)).toBeTruthy();
  });

  it('⭐ الورقيّ عن شخصٍ اعتباريّ يُرسل اسمَ الموقّع وسندَه، ولا يُرفع قبل رقم السند (ق-١٦٧٥)', async () => {
    vi.mocked(paperSignContractForm).mockResolvedValue({ form: { ...awaiting, status: 'SEALED' }, finalCopy: 'SENT' });
    mount(awaiting, { canRecord: true, canReview: true });
    fireEvent.click(screen.getByRole('button', { name: 'توقيعٌ ورقيّ' }));
    const file = new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('صورةُ الورقة الموقَّعة'), { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText(/شخصٌ اعتباريّ ووقّع عنه ممثّلُه/));
    fireEvent.click(screen.getByLabelText(/وقّع غيرُه/));
    fireEvent.change(screen.getByLabelText('من وقّع الورقةَ بيده'), { target: { value: 'مدير المؤسسة' } });
    const submit = screen.getByRole('button', { name: 'رفعٌ وختم' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('صفةُ الموقّع'), { target: { value: 'NAJIZ_POA' } });
    fireEvent.change(screen.getByLabelText('رقمُ الوكالة'), { target: { value: '445566' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(paperSignContractForm).toHaveBeenCalledWith('c1', 'f1', file, null, 'مدير المؤسسة', { authorityType: 'NAJIZ_POA', authorityRef: '445566' }, null),
    );
  });

  it('⭐ المعترَضُ عليه يُرى اعتراضُه، والنسخةُ المعدّلة «تسجيل» وتُفتح مكانه (ق-١٦٦٩)', async () => {
    const objected: FormInstance = {
      ...awaiting,
      status: 'OBJECTED',
      objection: { note: 'القراءةُ خطأ', byName: 'محمّد', mobileMasked: '0555 ••• 442', hasPhoto: false, objectedAt: '2026-10-05T09:00:00.000Z' },
    };
    const revised: FormInstance = { ...draft, id: 'f2', revisionNo: 2, previousRevisionId: 'f1' };
    vi.mocked(reviseContractForm).mockResolvedValue(revised);
    const onRevised = vi.fn();
    mount(objected, { canRecord: true, canReview: false }, vi.fn(), onRevised);
    expect(screen.getByTestId('form-objection').textContent).toContain('القراءةُ خطأ');
    fireEvent.click(screen.getByRole('button', { name: 'نسخةٌ معدّلة' }));
    await waitFor(() => expect(onRevised).toHaveBeenCalledWith(revised));
  });

  it('الحفظُ يرسل ما تغيّر وحدَه بنوع بنده', async () => {
    vi.mocked(setContractFormValues).mockResolvedValue({ ...draft, items: [{ ...draft.items[0], number: '48213' }] });
    mount(draft, { canRecord: true, canReview: false });
    fireEvent.change(screen.getByLabelText('قراءةُ عدّاد الكهرباء'), { target: { value: '48213' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظٌ كمسوّدة' }));
    await waitFor(() => expect(setContractFormValues).toHaveBeenCalledWith('c1', 'f1', [{ itemId: 'i1', number: 48213, note: null }]));
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
