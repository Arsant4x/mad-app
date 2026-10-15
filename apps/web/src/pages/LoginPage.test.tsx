import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const login = vi.fn();
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, bootLoading: false, login, register: vi.fn(), logout: vi.fn() }),
}));
vi.mock('../api/client', () => ({ apiClient: { post: vi.fn() }, setAccessToken: vi.fn() }));
vi.mock('../components/MfaCard', () => ({
  MfaCard: ({ onEnrolled }: { onEnrolled?: (codes: string[]) => void }) => (
    <button type="button" onClick={() => onEnrolled?.(['AAAA-1111', 'BBBB-2222'])}>
      enrol
    </button>
  ),
}));

import { setAccessToken } from '../api/client';

vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
});

async function signIn() {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  const [username] = screen.getAllByRole('textbox');
  await userEvent.type(username, 'platform-admin');
  await userEvent.type(document.querySelector('input[type="password"]') as HTMLInputElement, 'Admin-pass-1');
  await userEvent.click(screen.getByRole('button', { name: 'دخول' }));
}

describe('Sign in for a platform account that must turn the second factor on', () => {
  it('opens enrolment with the enrolment-only session the server hands, then returns to sign in with a code', async () => {
    login.mockRejectedValue({ response: { data: { message: 'فعّلها الآن', mfaEnrolmentRequired: true, enrolmentToken: 'enrolment-token' } } });
    await signIn();

    await waitFor(() => expect(setAccessToken).toHaveBeenCalledWith('enrolment-token'));
    expect(screen.getByText('فعّلها الآن')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'enrol' }));

    // The codes are shown before leaving, and the enrolment session is dropped.
    expect(screen.getByText('AAAA-1111 · BBBB-2222')).toBeInTheDocument();
    expect(setAccessToken).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole('button', { name: 'تابع إلى تسجيل الدخول' }));
    expect(screen.getByText('رمز المصادقة')).toBeInTheDocument();
  });

  it('shows the refusal as an error when no enrolment session comes with it', async () => {
    login.mockRejectedValue({ response: { data: { message: 'بيانات الدخول غير صحيحة' } } });
    await signIn();
    expect(await screen.findByText('بيانات الدخول غير صحيحة')).toBeInTheDocument();
    expect(setAccessToken).not.toHaveBeenCalled();
  });
});
