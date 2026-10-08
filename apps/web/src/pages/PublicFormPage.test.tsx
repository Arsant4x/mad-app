import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormPublicView } from '../api/forms';
import { PublicFormPage } from './PublicFormPage';

vi.mock('../api/forms', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  openFormLink: vi.fn(),
  requestFormOtp: vi.fn(),
  verifyFormOtp: vi.fn(),
  startFormNafath: vi.fn(),
  pollFormNafath: vi.fn(),
  viewPublicForm: vi.fn(),
  signPublicForm: vi.fn(),
  objectPublicForm: vi.fn(),
  decidePublicSubstitute: vi.fn(),
}));

vi.mock('../components/SignaturePad', () => ({
  SignaturePad: ({ onChange }: { onChange: (b: Blob | null) => void }) => (
    <button type="button" onClick={() => onChange(new Blob(['png'], { type: 'image/png' }))}>
      ارسم
    </button>
  ),
}));

import { decidePublicSubstitute, objectPublicForm, openFormLink, requestFormOtp, signPublicForm, startFormNafath, verifyFormOtp, viewPublicForm } from '../api/forms';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): تقديرٌ أوّلٌ قبل أن يُقاس تحت حِمل الحزمة.
vi.setConfig({ testTimeout: 15_000 });

const TOKEN = 'A'.repeat(43);

const view: FormPublicView = {
  purpose: 'SIGN',
  status: 'AWAITING_SIGNATURE',
  templateName: 'تسليمُ شقّة',
  formTypeName: 'تسليمُ وحدة',
  formDate: '2026-10-08',
  revisionNo: 1,
  signDeadline: '2026-10-15T10:00:00.000Z',
  nafathRequired: false,
  items: [{ lineNo: 1, label: 'قراءةُ العدّاد', itemType: 'METER_READING', unit: null, text: null, number: '48213', bool: null, note: null }],
  signatures: [{ role: 'STAFF', level: 'DRAWN_STAFF_SESSION', channel: 'STAFF_DEVICE', signerName: 'salem', signedAt: '2026-10-08T10:00:00.000Z' }],
  seal: null,
  substitute: null,
};

const mount = () =>
  render(
    <MemoryRouter initialEntries={[`/f/${TOKEN}`]}>
      <Routes>
        <Route path="/f/:token" element={<PublicFormPage />} />
      </Routes>
    </MemoryRouter>,
  );

async function loginByCode() {
  vi.mocked(openFormLink).mockResolvedValue({ state: 'ACTIVE', purpose: 'SIGN', methods: { otp: true, nafath: false }, identityProvider: 'نفاذ' });
  vi.mocked(requestFormOtp).mockResolvedValue({ challengeId: 'ch1', expiresAt: '2026-10-08T10:05:00.000Z', mobileMasked: '0555 ••• 442' });
  vi.mocked(verifyFormOtp).mockResolvedValue({ session: 'sess', expiresAt: '2026-10-08T10:30:00.000Z' });
  vi.mocked(viewPublicForm).mockResolvedValue(view);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'أرسل رمزاً إلى جوالي' }));
  fireEvent.change(await screen.findByLabelText('الرمز'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'دخول' }));
  await screen.findByText('قراءةُ العدّاد');
}

beforeEach(() => vi.clearAllMocks());

describe('⚖️ صفحةُ النموذج للمستأجر (توجيه ٢٨٧ ① إلى ③)', () => {
  it('⭐ قبل الدخول لا يظهر من النموذج شيء، والجوالُ مقنَّعٌ بعد طلب الرمز', async () => {
    vi.mocked(openFormLink).mockResolvedValue({ state: 'ACTIVE', purpose: 'SIGN', methods: { otp: true, nafath: false }, identityProvider: 'نفاذ' });
    vi.mocked(requestFormOtp).mockResolvedValue({ challengeId: 'ch1', expiresAt: '2026-10-08T10:05:00.000Z', mobileMasked: '0555 ••• 442' });
    mount();
    await screen.findByRole('button', { name: 'أرسل رمزاً إلى جوالي' });
    expect(screen.queryByText('تسليمُ شقّة')).toBeNull();
    expect(viewPublicForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'أرسل رمزاً إلى جوالي' }));
    await screen.findByText('0555 ••• 442');
    expect((screen.getByRole('button', { name: 'دخول' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('⭐ الرابطُ المقفل أو المنقضي يقول ذلك ولا يعرض دخولاً', async () => {
    vi.mocked(openFormLink).mockResolvedValue({ state: 'CLOSED', purpose: 'SIGN', methods: { otp: false, nafath: false }, identityProvider: null });
    mount();
    await screen.findByText(/انتهى هذا الرابط/);
    expect(screen.queryByRole('button', { name: 'أرسل رمزاً إلى جوالي' })).toBeNull();
  });

  it('⭐ نفاذٌ وحدَه حين يُشترط: لا زرَّ رمز', async () => {
    vi.mocked(openFormLink).mockResolvedValue({ state: 'ACTIVE', purpose: 'SIGN', methods: { otp: false, nafath: true }, identityProvider: 'نفاذ' });
    mount();
    await screen.findByRole('button', { name: 'التحقّق عبر نفاذ' });
    expect(screen.queryByRole('button', { name: 'أرسل رمزاً إلى جوالي' })).toBeNull();
  });

  it('⭐ بعد الدخول: التوقيعُ يشترط الإقرارَ والرسمَ معاً، ثم يُرسل بالجلسة', async () => {
    vi.mocked(signPublicForm).mockResolvedValue({ status: 'SEALED', finalCopy: 'SENT' });
    await loginByCode();
    expect(verifyFormOtp).toHaveBeenCalledWith(TOKEN, 'ch1', '123456');
    const sign = () => screen.getByRole('button', { name: 'أقرّ وأوقّع' }) as HTMLButtonElement;
    expect(sign().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'ارسم' }));
    expect(sign().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/أقرّ بما فيه/));
    expect(sign().disabled).toBe(false);
    fireEvent.click(sign());
    await waitFor(() => expect(signPublicForm).toHaveBeenCalledWith(TOKEN, 'sess', expect.any(Blob)));
    // ⚖️ النسخةُ النهائية إلى جوال بطاقة المستأجر في كلِّ مسار (`ق-١٦٧٨`).
    expect((await screen.findByTestId('public-form-done')).textContent).toContain('جوال المستأجر المسجَّل');
  });

  it('⭐ البديلُ في نموذج نفاذ: الرمزُ أوّلاً ثم نفاذ بجلسة الرمز، ولا يُفتح النموذجُ بالرمز وحدَه (ق-١٦٧٧)', async () => {
    vi.mocked(openFormLink).mockResolvedValue({ state: 'ACTIVE', purpose: 'SIGN', methods: { otp: true, nafath: true }, nafathAfterOtp: true, identityProvider: 'نفاذ' });
    vi.mocked(requestFormOtp).mockResolvedValue({ challengeId: 'ch1', expiresAt: '2026-10-08T10:05:00.000Z', mobileMasked: '0566 ••• 101' });
    vi.mocked(verifyFormOtp).mockResolvedValue({ session: 'otp-sess', expiresAt: '2026-10-08T10:30:00.000Z' });
    vi.mocked(startFormNafath).mockResolvedValue({ displayCode: '42' });
    mount();
    await screen.findByRole('button', { name: 'أرسل رمزاً إلى جوالي' });
    expect(screen.queryByRole('button', { name: 'التحقّق عبر نفاذ' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'أرسل رمزاً إلى جوالي' }));
    fireEvent.change(await screen.findByLabelText('الرمز'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'دخول' }));
    fireEvent.click(await screen.findByRole('button', { name: 'التحقّق عبر نفاذ' }));
    await waitFor(() => expect(startFormNafath).toHaveBeenCalledWith(TOKEN, 'otp-sess'));
    expect(viewPublicForm).not.toHaveBeenCalled();
    expect(await screen.findByText('42')).toBeTruthy();
  });

  it('⭐ رابطُ الموافقة على البديل: بعد الدخول يرى المستأجرُ اسمَ البديل وجوالَه مقنَّعاً ويوافق بالجلسة (ق-١٦٧٢)', async () => {
    vi.mocked(openFormLink).mockResolvedValue({ state: 'ACTIVE', purpose: 'SUBSTITUTE_CONSENT', methods: { otp: true, nafath: false }, identityProvider: 'نفاذ' });
    vi.mocked(requestFormOtp).mockResolvedValue({ challengeId: 'ch1', expiresAt: '2026-10-08T10:05:00.000Z', mobileMasked: '0555 ••• 442' });
    vi.mocked(verifyFormOtp).mockResolvedValue({ session: 'sess', expiresAt: '2026-10-08T10:30:00.000Z' });
    vi.mocked(viewPublicForm).mockResolvedValue({ ...view, purpose: 'SUBSTITUTE_CONSENT', substitute: { name: 'أخو المستأجر', mobileMasked: '0566 ••• 101' } });
    vi.mocked(decidePublicSubstitute).mockResolvedValue({ decision: 'APPROVED', delivery: 'SENT' });
    mount();
    expect(await screen.findByText('طلبُ مستلمٍ بديلٍ عنك')).toBeTruthy();
    expect(screen.queryByText(/أخو المستأجر/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'أرسل رمزاً إلى جوالي' }));
    fireEvent.change(await screen.findByLabelText('الرمز'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'دخول' }));
    expect((await screen.findByTestId('public-form-substitute')).textContent).toContain('أخو المستأجر');
    expect(screen.queryByRole('button', { name: 'أقرّ وأوقّع' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'أوافق' }));
    await waitFor(() => expect(decidePublicSubstitute).toHaveBeenCalledWith(TOKEN, 'sess', true));
    expect((await screen.findByTestId('public-form-done')).textContent).toContain('موافقتُك');
  });

  it('⭐ الاعتراضُ يشترط ملاحظة، ويُرسل بالجلسة', async () => {
    vi.mocked(objectPublicForm).mockResolvedValue({ status: 'OBJECTED' });
    await loginByCode();
    fireEvent.click(screen.getByRole('button', { name: 'لديّ اعتراض' }));
    const send = () => screen.getByRole('button', { name: 'إرسالُ الاعتراض' }) as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('ما اعتراضُك؟'), { target: { value: 'القراءةُ خطأ' } });
    fireEvent.click(send());
    await waitFor(() => expect(objectPublicForm).toHaveBeenCalledWith(TOKEN, 'sess', 'القراءةُ خطأ', null));
    expect((await screen.findByTestId('public-form-done')).textContent).toContain('اعتراضُك');
  });
});
