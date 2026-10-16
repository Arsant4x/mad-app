import { Prisma } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { SettlementTarget, settlementStatusOf } from '../common/settlement/settlement.util';
import { dayStartOf } from '../common/wall-clock.util';
import { NOT_REPLACED_REJECTED } from './active-documents.util';

/** What a customer payment may settle: an invoice or a debit note, which is billed and collected on its own. */
export const RECEIVABLE_INVOICE_KINDS = ['INVOICE', 'DEBIT_NOTE'] as const;

/** The credit notes issued on a document (an invoice, or a debit note a credit note corrects), read through its own relation. */
export const CREDIT_NOTES_ON_DOCUMENT = { where: { docType: 'CREDIT_NOTE' as const }, select: { total: true } };

/** The sum of a document's credit notes, in the document's own currency. */
export const creditedTotal = (notes: { total: Prisma.Decimal | number | string }[]): number => round2(notes.reduce((s, n) => s + Number(n.total), 0));

/** The customer side of the shared settlement path: invoices keyed by customer, allocations in `payment_allocations`. */
export const invoiceTarget = (tx: Prisma.TransactionClient): SettlementTarget => ({
  table: 'invoices',
  partyColumn: 'customerId',
  documentKey: 'invoiceId',
  allocations: tx.paymentAllocation,
  payableKinds: RECEIVABLE_INVOICE_KINDS,
  creditKind: 'CREDIT_NOTE',
  creditedOn: async (id) => creditedTotal((await tx.invoice.findUnique({ where: { id }, select: { adjustments: CREDIT_NOTES_ON_DOCUMENT } }))?.adjustments ?? []),
  // Closed is the one shared condition read the other way: a rejected invoice whose replacement was issued.
  isClosed: async (id) => (await tx.invoice.findUnique({ where: { id, NOT: NOT_REPLACED_REJECTED }, select: { id: true } })) !== null,
  documentNotFound: MSG.invoice_not_found,
  wrongParty: MSG.allocation_wrong_customer,
  notPayable: MSG.allocation_not_receivable,
  closedDocument: MSG.allocation_invoice_replaced,
});

/**
 * The only writer of an invoice's settlement status, from its allocations and the credit notes issued on it,
 * with OVERDUE for a due one past its date. Called in the transaction of every allocation change and credit note.
 */
export async function recomputeInvoiceStatus(tx: Prisma.TransactionClient, invoiceId: string, now: Date = new Date()): Promise<void> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, docType: true, total: true, status: true, dueDate: true } });
  if (!invoice) return;
  // A prepayment document is settled by the receipt that issued it; its allocation moves when it is applied.
  if (invoice.docType === 'PREPAYMENT') return;
  const derived = await settlementStatusOf(invoiceTarget(tx), invoice);
  // The day is the declared business day, not the process time zone.
  const status = derived === 'DUE' && invoice.dueDate < dayStartOf(now) ? 'OVERDUE' : derived;
  if (status !== invoice.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
}
