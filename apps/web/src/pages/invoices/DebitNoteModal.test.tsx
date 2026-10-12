import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Invoice } from '../../api/invoices';
import { DebitNoteModal } from './DebitNoteModal';

// File budget: two small renders, well under the default.
vi.setConfig({ testTimeout: 5_000 });

const doc = (docType: string) => ({ id: 'i1', no: 'INV-2026-0001', total: '100.00', docType }) as unknown as Invoice;

describe('DebitNoteModal hint', () => {
  it('on an invoice: ends with "the original invoice is not changed"', () => {
    render(<DebitNoteModal invoice={doc('INVOICE')} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/مرتبطاً بها\. الفاتورة الأصلية لا تُعدَّل\.$/)).toBeTruthy();
  });

  it('on a credit note: one sentence, without the invoice tail glued on', () => {
    render(<DebitNoteModal invoice={doc('CREDIT_NOTE')} onCancel={() => {}} onConfirm={() => {}} />);
    const hint = screen.getByText(/يصحّح الإشعار الدائن/);
    expect(hint.textContent).toMatch(/مرتبطاً به\.$/);
    expect(hint.textContent).not.toContain('بها.');
  });
});
