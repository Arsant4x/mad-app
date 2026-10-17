import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contract } from '../../api/contracts';
import i18n from '../../i18n';
import { grants, resetGrants } from '../../test/grants';
import { hasButton } from '../../test/rowMenu';

// File budget: first estimate before measuring under the full suite, three times a page render.
vi.setConfig({ testTimeout: 15_000 });

vi.mock('../../api/contracts', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listContracts: vi.fn(),
  listContractAttachments: vi.fn(),
}));
vi.mock('../../api/units', () => ({ listUnits: vi.fn() }));
vi.mock('../../api/properties', () => ({ listProperties: vi.fn() }));
vi.mock('../../api/banks', () => ({ listBanks: vi.fn() }));
vi.mock('../../api/customers', async (orig) => ({ ...(await orig<Record<string, unknown>>()), listCustomers: vi.fn() }));
vi.mock('../../auth/PermissionsContext', async () => (await import('../../test/grants')).permissionsModule());
// The sections measure their own controls in contractActions.test.tsx; the task button reads the auth context.
vi.mock('./HandoversSection', () => ({ HandoversSection: () => null }));
vi.mock('./KeyMoneySection', () => ({ KeyMoneySection: () => null }));
vi.mock('./FeesSection', () => ({ FeesSection: () => null }));
vi.mock('./ClaimsSection', () => ({ ClaimsSection: () => null }));
vi.mock('./DepositsSection', () => ({ DepositsSection: () => null }));
vi.mock('../../components/AssignTaskButton', () => ({ AssignTaskButton: () => null }));

const { listContractAttachments, listContracts } = await import('../../api/contracts');
const { listUnits } = await import('../../api/units');
const { listProperties } = await import('../../api/properties');
const { listBanks } = await import('../../api/banks');
const { listCustomers } = await import('../../api/customers');
const { AttachmentsSection } = await import('./AttachmentsSection');
const { ContractDetailModal } = await import('./ContractDetailModal');
const { ContractModal } = await import('./ContractModal');
const { ContractsPage } = await import('./ContractsPage');

const contract = {
  id: 'c1',
  unitId: 'u1',
  unit: { id: 'u1', unitNo: '101', property: { id: 'p1', name: 'Tower', ownership: 'owned' } },
  customerId: null,
  no: 'EJ-1',
  tenant: 'Tenant',
  phone: null,
  value: '12000.00',
  cycle: 'monthly',
  start: '2026-01-01',
  end: '2026-12-31',
  deposit: '0.00',
  classification: 'LEGACY_UNCLASSIFIED',
  vatInclusion: 'LEGACY_UNDECLARED',
  lessor: 'COMPANY',
  exemptSharePercent: null,
  exemptShareBasis: null,
  status: 'DUE',
  installments: [{ id: 'i1', dueDate: '2026-01-01', amount: '1000.00', status: 'DUE', notes: null }],
  payments: [],
  deposits: [],
  claims: [],
  keyMoney: [],
  handovers: [],
} as unknown as Contract;

beforeEach(() => {
  vi.clearAllMocks();
  resetGrants('contracts:view');
  vi.mocked(listContractAttachments).mockResolvedValue([{ id: 'at1', filename: 'lease.pdf', size: 10, uploadedAt: '2026-01-01' }] as never);
});

describe('Contract detail controls follow the actions', () => {
  it('a view only employee gets no payment, renewal, cancellation or declaration', async () => {
    render(<ContractDetailModal contract={contract} banks={[]} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText('lease.pdf');
    expect(hasButton(i18n.t('contracts.detail.record_payment'))).toBe(false);
    expect(hasButton(i18n.t('contracts.detail.free_payment_button'))).toBe(false);
    expect(hasButton(i18n.t('contracts.detail.renew_contract'))).toBe(false);
    expect(hasButton(i18n.t('contracts.detail.cancel_contract'))).toBe(false);
    expect(screen.queryByText(i18n.t('contracts.detail.legacy.classification_hint'))).toBeNull();
  });

  it('edit shows the declaration of an old contract', async () => {
    grants.add('contracts:edit');
    render(<ContractDetailModal contract={contract} banks={[]} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText('lease.pdf');
    expect(screen.getByText(i18n.t('contracts.detail.legacy.classification_hint'))).toBeTruthy();
    expect(hasButton(i18n.t('contracts.detail.record_payment'))).toBe(false);
  });

  it('record shows the payments, add the renewal, delete the cancellation', async () => {
    grants.add('contracts:record').add('contracts:add').add('contracts:delete');
    render(<ContractDetailModal contract={contract} banks={[]} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText('lease.pdf');
    expect(hasButton(i18n.t('contracts.detail.record_payment'))).toBe(true);
    expect(hasButton(i18n.t('contracts.detail.free_payment_button'))).toBe(true);
    expect(hasButton(i18n.t('contracts.detail.renew_contract'))).toBe(true);
    expect(hasButton(i18n.t('contracts.detail.cancel_contract'))).toBe(true);
  });
});

describe('Contract attachments follow add and delete', () => {
  it('a view only employee opens files but cannot attach or delete', async () => {
    render(<AttachmentsSection contractId="c1" />);
    await screen.findByText('lease.pdf');
    expect(hasButton(i18n.t('contracts.attachments.attach'))).toBe(false);
    expect(hasButton(i18n.t('contracts.attachments.delete'))).toBe(false);
  });

  it('add attaches and delete deletes', async () => {
    grants.add('contracts:add').add('contracts:delete');
    render(<AttachmentsSection contractId="c1" />);
    await screen.findByText('lease.pdf');
    expect(hasButton(i18n.t('contracts.attachments.attach'))).toBe(true);
    expect(hasButton(i18n.t('contracts.attachments.delete'))).toBe(true);
  });
});

describe('New contract and its inline customer', () => {
  beforeEach(() => {
    vi.mocked(listContracts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 } as never);
    vi.mocked(listUnits).mockResolvedValue([{ id: 'u1', unitNo: '101', propertyId: 'p1' }] as never);
    vi.mocked(listProperties).mockResolvedValue([{ id: 'p1', name: 'Tower' }] as never);
    vi.mocked(listBanks).mockResolvedValue([]);
    vi.mocked(listCustomers).mockResolvedValue([]);
  });

  it('the new contract button needs add on contracts', async () => {
    const { unmount } = render(<ContractsPage />);
    await screen.findByText(i18n.t('contracts.page.title'));
    expect(hasButton(i18n.t('contracts.page.new'))).toBe(false);
    unmount();
    grants.add('contracts:add');
    render(<ContractsPage />);
    expect(await screen.findByText(i18n.t('contracts.page.new'))).toBeTruthy();
  });

  it('the inline new customer is offered only with a handler, which the page passes for add on customers', () => {
    const props = { units: [{ id: 'u1', unitNo: '101', propertyId: 'p1' }] as never, properties: [{ id: 'p1', name: 'Tower' }] as never, customers: [], onCancel: () => {}, onSave: async () => {} };
    const { unmount } = render(<ContractModal {...props} />);
    expect(hasButton(i18n.t('contracts.modal.new_customer'))).toBe(false);
    unmount();
    render(<ContractModal {...props} onCreateCustomer={async () => ({ id: 'x', name: 'x' }) as never} />);
    expect(hasButton(i18n.t('contracts.modal.new_customer'))).toBe(true);
  });
});
