import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({ apiClient: { post: vi.fn(() => Promise.resolve({ data: { id: 'doc' } })) } }));

import { apiClient } from './client';
import { createInvoice, issueCreditNote, issueDebitNote, type CreateInvoiceInput } from './invoices';

// File budget: three calls to a mocked client, well under the default.
vi.setConfig({ testTimeout: 5_000 });

const post = vi.mocked(apiClient.post);
const invoice = { customerId: 'c1', issueDate: '2026-10-17', dueDate: '2026-10-17', lines: [] } as unknown as CreateInvoiceInput;

describe('invoice create calls carry the form key', () => {
  beforeEach(() => post.mockClear());

  it('sends the key of the open form in the Idempotency-Key header, and no header without one', async () => {
    await createInvoice(invoice, 'form-key-123');
    expect(post).toHaveBeenLastCalledWith('/invoices', invoice, { headers: { 'Idempotency-Key': 'form-key-123' } });
    await createInvoice(invoice);
    expect(post).toHaveBeenLastCalledWith('/invoices', invoice, {});
  });

  it('sends the key with a credit note and a debit note', async () => {
    await issueCreditNote('i1', { reason: 'return', issueDate: '2026-10-17' }, 'note-key-123');
    expect(post).toHaveBeenLastCalledWith('/invoices/i1/credit-note', { reason: 'return', issueDate: '2026-10-17' }, { headers: { 'Idempotency-Key': 'note-key-123' } });
    await issueDebitNote('i1', { reason: 'extra', issueDate: '2026-10-17', lines: [] }, 'note-key-456');
    expect(post).toHaveBeenLastCalledWith('/invoices/i1/debit-note', { reason: 'extra', issueDate: '2026-10-17', lines: [] }, { headers: { 'Idempotency-Key': 'note-key-456' } });
  });
});
