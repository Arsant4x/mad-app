import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.setConfig({ testTimeout: 5_000 });

describe('ResetPasswordPage', () => {
  it('enables the submit button from twelve characters, as the server requires', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc']}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText(i18n.t('reset_password_label'));
    const submit = screen.getByRole('button', { name: i18n.t('reset_submit') });
    fireEvent.change(input, { target: { value: 'Abcdefgh12!' } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Abcdefgh123!' } });
    expect(submit).toBeEnabled();
  });
});
