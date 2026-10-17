import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Purchase } from '../../api/purchases';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton, rowMenuLabels } from '../../test/rowMenu';
import { PurchaseAttachmentsModal } from './PurchaseAttachmentsModal';
import { PurchaseModal } from './PurchaseModal';
import { SuppliersPage } from './SuppliersPage';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/suppliers', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listSuppliers: vi.fn() }));
vi.mock('../../api/purchases', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listPurchases: vi.fn(),
  listPurchaseAttachments: vi.fn(),
}));
vi.mock('../../api/branches', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listBranches: vi.fn(() => Promise.resolve([])) }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());

import { listPurchaseAttachments, listPurchases } from '../../api/purchases';
import { listSuppliers } from '../../api/suppliers';

const purchase = {
  id: 'pu1',
  no: 'PUR-1',
  docType: 'PURCHASE',
  status: 'DUE',
  supplier: { id: 's1', name: 'Paper Co' },
  supplierRef: null,
  date: '2026-06-01',
  dueDate: null,
  category: null,
  subtotal: '100.00',
  taxAmount: '15.00',
  total: '115.00',
  exempt: false,
  excludeFromVat: false,
  amortize: false,
  amortizeMonths: null,
  voidedAt: null,
} as unknown as Purchase;

beforeEach(() => {
  resetGrants('suppliers:view');
  vi.mocked(listSuppliers).mockResolvedValue([{ id: 's1', name: 'Paper Co', vatNumber: null, phone: null, category: null, archived: false }] as never);
  vi.mocked(listPurchases).mockResolvedValue([purchase]);
  vi.mocked(listPurchaseAttachments).mockResolvedValue([{ id: 'pa1', filename: 'bill.pdf', size: 10, uploadedAt: '2026-06-01' }] as never);
});

async function shown() {
  render(<SuppliersPage />);
  await screen.findByText('PUR-1');
}

/** Suppliers, purchases and notes add, edit and delete; a payment voucher records. */
describe('Suppliers controls follow the actions', () => {
  it('a view only employee reads the supplier and the documents only', async () => {
    await shown();
    expect(hasButton(i18n.t('suppliers.page.new_supplier'))).toBe(false);
    expect(hasButton(i18n.t('suppliers.page.new_purchase'))).toBe(false);
    expect(rowMenuLabels(0)).toEqual([i18n.t('suppliers.page.action_view')]);
    expect(rowMenuLabels(1)).toEqual([i18n.t('suppliers.page.action_documents')]);
  });

  it('record alone offers the payment and nothing that adds, edits or deletes', async () => {
    grants.add('suppliers:record');
    await shown();
    expect(rowMenuLabels(1)).toEqual([i18n.t('suppliers.page.action_payment'), i18n.t('suppliers.page.action_documents')]);
  });

  it('add, edit and delete show their controls', async () => {
    grants.add('suppliers:add').add('suppliers:edit').add('suppliers:delete');
    await shown();
    expect(hasButton(i18n.t('suppliers.page.new_supplier'))).toBe(true);
    expect(hasButton(i18n.t('suppliers.page.new_purchase'))).toBe(true);
    expect(rowMenuLabels(0)).toEqual([
      i18n.t('suppliers.page.action_view'),
      i18n.t('suppliers.page.action_edit'),
      i18n.t('suppliers.page.action_archive'),
      i18n.t('suppliers.page.action_delete'),
    ]);
    expect(rowMenuLabels(1)).toEqual([
      i18n.t('suppliers.page.action_credit'),
      i18n.t('suppliers.page.action_debit'),
      i18n.t('suppliers.page.action_edit'),
      i18n.t('suppliers.page.action_documents'),
      i18n.t('suppliers.page.action_delete'),
    ]);
  });
});

describe('Purchase documents follow add and delete', () => {
  it('a view only employee opens the documents but cannot attach or delete', async () => {
    render(<PurchaseAttachmentsModal purchase={purchase} onClose={() => {}} />);
    await screen.findByText('bill.pdf');
    expect(hasButton(i18n.t('suppliers.attachments.attach'))).toBe(false);
    expect(hasButton(i18n.t('suppliers.common.delete'))).toBe(false);
  });

  it('add attaches and delete deletes', async () => {
    grants.add('suppliers:add').add('suppliers:delete');
    render(<PurchaseAttachmentsModal purchase={purchase} onClose={() => {}} />);
    await screen.findByText('bill.pdf');
    expect(hasButton(i18n.t('suppliers.attachments.attach'))).toBe(true);
    expect(hasButton(i18n.t('suppliers.common.delete'))).toBe(true);
  });
});

describe('A purchase with a new supplier name', () => {
  it('without a create handler asks for an existing supplier instead of creating one', async () => {
    const onSave = vi.fn();
    render(<PurchaseModal suppliers={[]} branches={[]} editing={null} onCancel={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(i18n.t('suppliers.purchase_form.supplier_placeholder')), { target: { value: 'Unknown Co' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('suppliers.purchase_form.submit') }));
    expect(await screen.findByText(i18n.t('suppliers.purchase_form.supplier_existing'))).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
