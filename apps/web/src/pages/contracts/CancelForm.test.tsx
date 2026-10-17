import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CancelContractInput, Contract } from '../../api/contracts';
import { CancelForm } from './ContractDetailModal';

// A first estimate before it is measured under the suite's load.
vi.setConfig({ testTimeout: 15_000 });

/**
 * A settlement worked out from the upcoming installments charges the tenant for them, so the form cancels them and does
 * not offer keeping them due as well (the server refuses that combination).
 */
const contract = {
  id: 'c1',
  installments: [
    { id: 'i1', dueDate: '2099-01-01', status: 'DUE', amount: '1000.00' },
    { id: 'i2', dueDate: '2099-02-01', status: 'DUE', amount: '1000.00' },
  ],
} as unknown as Contract;

describe('Upcoming installments in the cancellation form', () => {
  it.each(['all', 'installments'])('a settlement from %s cancels the installments, even after keeping them was picked', async (settlementBasis) => {
    const onSubmit = vi.fn(async (_dto: CancelContractInput) => {});
    render(<CancelForm contract={contract} onCancel={() => {}} onSubmit={onSubmit} />);
    const [disposition, basis] = screen.getAllByRole('combobox') as HTMLSelectElement[];

    fireEvent.change(disposition, { target: { value: 'keep' } });
    expect(screen.getByText('تُسجَّل الأقساط المُبقاة عند الإلغاء مستحقةً على المستأجر ضمن إيرادات أخرى — وليس إيراد إيجار.')).toBeTruthy();

    fireEvent.change(basis, { target: { value: settlementBasis } });
    const keep = Array.from(disposition.options).find((o) => o.value === 'keep')!;
    expect({ shown: disposition.value, keepDisabled: keep.disabled }).toEqual({ shown: 'cancel', keepDisabled: true });

    fireEvent.change(screen.getByPlaceholderText('مثال: إخلاء مبكر باتفاق الطرفين'), { target: { value: 'early exit' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإلغاء' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ installmentDisposition: 'cancel', settlementBasis });
  });

  it('the settlement preview counts a partly paid installment by its unpaid remainder', () => {
    const partly = {
      id: 'c2',
      installments: [
        { id: 'i1', dueDate: '2099-01-01', status: 'PARTIAL', amount: '1000.00', gross: '1150.00', settled: '575.00', remaining: '575.00' },
        { id: 'i2', dueDate: '2099-02-01', status: 'DUE', amount: '1000.00', gross: '1150.00', settled: '0.00', remaining: '1150.00' },
      ],
    } as unknown as Contract;
    render(<CancelForm contract={partly} onCancel={() => {}} onSubmit={async () => {}} />);
    const [, basis] = screen.getAllByRole('combobox') as HTMLSelectElement[];

    fireEvent.change(basis, { target: { value: 'all' } });

    // Half of the first installment is paid, so half of its 1,000 is left, and the second is owed in full.
    expect(screen.getByText(/1,500\.00/)).toBeTruthy();
  });

  it('an agreed amount still lets the installments be kept due', async () => {
    const onSubmit = vi.fn(async (_dto: CancelContractInput) => {});
    render(<CancelForm contract={contract} onCancel={() => {}} onSubmit={onSubmit} />);
    const [disposition, basis] = screen.getAllByRole('combobox') as HTMLSelectElement[];

    fireEvent.change(basis, { target: { value: 'amount' } });
    fireEvent.change(disposition, { target: { value: 'keep' } });
    fireEvent.change(screen.getByPlaceholderText('مثال: إخلاء مبكر باتفاق الطرفين'), { target: { value: 'early exit' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإلغاء' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ installmentDisposition: 'keep', settlementBasis: 'amount' });
  });
});

describe('Rent for a period after the cancel date in the cancellation form', () => {
  const choice = () => screen.getByRole('option', { name: 'يُردّ للمستأجر' }).closest('select') as HTMLSelectElement;
  const submit = async (onSubmit: ReturnType<typeof vi.fn>) => {
    fireEvent.change(screen.getByPlaceholderText('مثال: إخلاء مبكر باتفاق الطرفين'), { target: { value: 'early exit' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإلغاء' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    return onSubmit.mock.calls[0][0] as CancelContractInput;
  };

  it.each(['refund', 'income'])('the destination the server asks for can be chosen and is sent: %s', async (value) => {
    const onSubmit = vi.fn(async (_dto: CancelContractInput) => {});
    render(<CancelForm contract={contract} onCancel={() => {}} onSubmit={onSubmit} />);

    expect(Array.from(choice().options).map((o) => o.value)).toEqual(['', 'refund', 'income']);
    fireEvent.change(choice(), { target: { value } });

    expect((await submit(onSubmit)).unearnedDisposition).toBe(value);
  });

  it('nothing is chosen for the user: without a choice none is sent', async () => {
    const onSubmit = vi.fn(async (_dto: CancelContractInput) => {});
    render(<CancelForm contract={contract} onCancel={() => {}} onSubmit={onSubmit} />);

    expect(choice().value).toBe('');
    expect('unearnedDisposition' in (await submit(onSubmit))).toBe(false);
  });
});
