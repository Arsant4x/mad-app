import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { CustomerModal } from './CustomerModal';

// File budget: a single short interaction, under the default.
vi.setConfig({ testTimeout: 5_000 });

/** The server's 409 for a duplicate name, as it answers an English interface (messages.ts, customer_same_name_exists). */
const SAME_NAME_EN =
  'A customer with this name already exists — is it the same one? Pick it from the list, or confirm creation if this is a different person with the same name';

describe('customer modal in English', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('ar');
    });
  });

  it('turns the English same-name refusal into the confirmation step, then resends with allowSameName', async () => {
    const refusal = Object.assign(new Error('conflict'), { response: { status: 409, data: { message: SAME_NAME_EN } } });
    const onSave = vi.fn().mockRejectedValueOnce(refusal).mockResolvedValueOnce(undefined);
    render(<CustomerModal editing={null} onCancel={() => {}} onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText(/Al Ofuq/), 'Twin Name');
    await userEvent.selectOptions(screen.getByLabelText('Customer type'), 'NATURAL');
    await userEvent.click(screen.getByRole('button', { name: 'Add customer' }));

    // The confirmation step, not a plain error: its own buttons replace the add button.
    const confirm = await screen.findByRole('button', { name: 'Yes, a different person with the same name — create' });
    expect(screen.getByRole('button', { name: "No — I'll check the list" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add customer' })).not.toBeInTheDocument();

    await userEvent.click(confirm);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0]).toMatchObject({ name: 'Twin Name', allowSameName: true });
  });
});
