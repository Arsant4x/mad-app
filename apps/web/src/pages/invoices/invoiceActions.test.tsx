import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '../../api/invoices';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/invoices', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listInvoices: vi.fn() }));
vi.mock('../../api/customers', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listCustomers: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../api/branches', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listBranches: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());
vi.mock('../../auth/AuthContext', async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...(await import('../../test/grants')).authModule() }));
// The task button reads the auth context and is not what this file measures.
vi.mock('../../components/AssignTaskButton', () => ({ AssignTaskButton: () => null }));

const { listInvoices } = await import('../../api/invoices');
const { InvoicesPage } = await import('./InvoicesPage');
const { InvoiceBuilderView } = await import('./InvoiceBuilderView');

const invoice = {
  id: 'inv1',
  no: 'INV-1',
  docType: 'INVOICE',
  customer: { id: 'c1', name: 'Buyer', vatNumber: null },
  relatedInvoice: null,
  replacesInvoice: null,
  replacedBy: null,
  issueDate: '2026-06-01',
  dueDate: '2026-06-30',
  status: 'DUE',
  total: '115.00',
  zatcaQr: null,
  invoiceType: null,
  zatcaStatus: 'NOT_SUBMITTED',
  zatcaMessage: null,
  zatcaIcv: null,
  clearedCopy: 'none',
  lines: [],
} as unknown as Invoice;

beforeEach(() => {
  resetGrants('invoice:view');
  vi.mocked(listInvoices).mockResolvedValue([invoice]);
});

async function shown(state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/invoices', state }]}>
      <InvoicesPage />
    </MemoryRouter>,
  );
  await screen.findByText('INV-1');
}

/** A new invoice, a note and a replacement are each a new document, refused without add on invoices. */
describe('Invoice controls follow add', () => {
  it('a view only employee gets no new invoice and no note', async () => {
    await shown();
    expect(hasButton(i18n.t('invoices.list.new'))).toBe(false);
    expect(rowMenuLabels()).toEqual([]);
  });

  it('the dashboard shortcut does not open the builder without add', async () => {
    await shown({ openBuilder: true });
    expect(hasButton(i18n.t('invoices.builder.issue'))).toBe(false);
  });

  it('add shows the new invoice and both notes', async () => {
    grants.add('invoice:add');
    await shown();
    expect(hasButton(i18n.t('invoices.list.new'))).toBe(true);
    expect(rowMenuLabels()).toEqual([i18n.t('invoices.list.action.credit_note'), i18n.t('invoices.list.action.debit_note')]);
  });
});

describe('A new customer typed in the builder', () => {
  it('without a create handler asks for an existing customer and offers no kind picker', async () => {
    const onSave = vi.fn();
    render(<InvoiceBuilderView customers={[]} branches={[]} editing={null} nextNumberHint="INV-2" onCancel={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(i18n.t('invoices.builder.customer_placeholder')), { target: { value: 'New buyer' } });
    expect(screen.queryByLabelText(i18n.t('invoices.builder.new_customer_kind_label'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('invoices.builder.issue') }));
    expect(await screen.findByText(i18n.t('invoices.builder.err_customer_existing'))).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('with a create handler offers the kind picker', () => {
    render(<InvoiceBuilderView customers={[]} branches={[]} editing={null} nextNumberHint="INV-2" onCancel={() => {}} onSave={vi.fn()} onCreateCustomer={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(i18n.t('invoices.builder.customer_placeholder')), { target: { value: 'New buyer' } });
    expect(screen.getByLabelText(i18n.t('invoices.builder.new_customer_kind_label'))).toBeTruthy();
  });
});
