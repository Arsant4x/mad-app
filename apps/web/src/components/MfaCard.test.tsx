import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MfaCard } from './MfaCard';

vi.mock('../api/mfa', () => ({
  getMfaStatus: vi.fn(),
  beginMfa: vi.fn(),
  confirmMfa: vi.fn(),
  disableMfa: vi.fn(),
}));

import { beginMfa, confirmMfa, disableMfa, getMfaStatus } from '../api/mfa';

vi.setConfig({ testTimeout: 15_000 });

const status = (enrolled: boolean) => ({ enrolled, enrolledAt: null, recoveryCodesLeft: enrolled ? 8 : 0, required: false });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(beginMfa).mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauth: 'otpauth://totp/x' });
  vi.mocked(confirmMfa).mockResolvedValue({ recoveryCodes: ['AAAA-1111', 'BBBB-2222'] });
  vi.mocked(disableMfa).mockResolvedValue({ enrolled: false });
});

async function startEnrolment() {
  vi.mocked(getMfaStatus).mockResolvedValue(status(false));
  render(<MfaCard />);
  await userEvent.click(await screen.findByRole('button', { name: 'تفعيل المصادقة بخطوتين' }));
  await userEvent.type(await screen.findByRole('textbox'), '123456');
}

describe('MfaCard asks for the current password', () => {
  it('keeps turning it on disabled until the current password is typed, then sends it with the code', async () => {
    await startEnrolment();
    const confirm = screen.getByRole('button', { name: 'تأكيد التفعيل' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('كلمة المرور الحالية'), 'Current-pass-1');
    await userEvent.click(confirm);
    await waitFor(() => expect(confirmMfa).toHaveBeenCalledWith('123456', 'Current-pass-1'));
    expect(await screen.findByText('AAAA-1111 · BBBB-2222')).toBeInTheDocument();
  });

  it('sends the current password when turning it off', async () => {
    vi.mocked(getMfaStatus).mockResolvedValue(status(true));
    render(<MfaCard />);
    await userEvent.type(await screen.findByRole('textbox'), '654321');
    const off = screen.getByRole('button', { name: 'إلغاء التفعيل' });
    expect(off).toBeDisabled();
    await userEvent.type(screen.getByLabelText('كلمة المرور الحالية'), 'Current-pass-2');
    await userEvent.click(off);
    await waitFor(() => expect(disableMfa).toHaveBeenCalledWith('654321', 'Current-pass-2'));
  });

  it('hands the recovery codes to onEnrolled instead of reloading, for the sign-in screen', async () => {
    const onEnrolled = vi.fn();
    vi.mocked(getMfaStatus).mockResolvedValue(status(false));
    render(<MfaCard onEnrolled={onEnrolled} />);
    await userEvent.click(await screen.findByRole('button', { name: 'تفعيل المصادقة بخطوتين' }));
    await userEvent.type(await screen.findByRole('textbox'), '123456');
    await userEvent.type(screen.getByLabelText('كلمة المرور الحالية'), 'Current-pass-3');
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد التفعيل' }));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith(['AAAA-1111', 'BBBB-2222']));
    expect(getMfaStatus).toHaveBeenCalledTimes(1);
  });
});
