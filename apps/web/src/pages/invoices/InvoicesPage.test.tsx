import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// File budget: one page render with every API mocked, three saves.
vi.setConfig({ testTimeout: 10_000 });

const draft = { customerId: 'c1', issueDate: '2026-10-17', dueDate: '2026-10-17', notes: '', branchId: '', lines: [] };

vi.mock('../../api/invoices', () => ({
  CREDIT_LIMIT_EXCEEDED: 'CREDIT_LIMIT_EXCEEDED',
  listInvoices: vi.fn(() => Promise.resolve([])),
  createInvoice: vi.fn(),
  downloadClearedXml: vi.fn(),
  issueCreditNote: vi.fn(),
  issueDebitNote: vi.fn(),
  issueReplacement: vi.fn(),
}));
vi.mock('../../api/customers', () => ({ listCustomers: vi.fn(() => Promise.resolve([])), createCustomer: vi.fn() }));
vi.mock('../../api/branches', () => ({ listBranches: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../api/zatca', () => ({ submitInvoiceToZatca: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { actorType: 'COMPANY' } }) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).allGrantedModule());
vi.mock('./InvoiceListView', () => ({ InvoiceListView: ({ onNew }: { onNew: () => void }) => <button onClick={onNew}>open builder</button> }));
vi.mock('./InvoiceBuilderView', () => ({
  InvoiceBuilderView: ({ onSave }: { onSave: (d: typeof draft) => void }) => <button onClick={() => onSave(draft)}>save invoice</button>,
}));

const { createInvoice } = await import('../../api/invoices');
const { InvoicesPage } = await import('./InvoicesPage');

describe('the invoice builder sends one key per opened form', () => {
  it('a retry of a failed save sends the same key, and the next builder sends a new one', async () => {
    const create = vi.mocked(createInvoice);
    create.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ id: 'i1' } as never);
    render(
      <MemoryRouter>
        <InvoicesPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('open builder'));
    fireEvent.click(await screen.findByText('save invoice'));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByText('save invoice'));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByText('open builder'));
    fireEvent.click(await screen.findByText('save invoice'));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));

    const keys = create.mock.calls.map((call) => call[1]);
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
