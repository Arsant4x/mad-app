import { Prisma } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { SettlementTarget, settlementStatusOf } from '../common/settlement/settlement.util';
import { dayStartOf } from '../common/wall-clock.util';
import { isReplacedRejected } from './active-documents.util';

/** What a customer payment may settle: an invoice or a debit note, which is billed and collected on its own. */
export const RECEIVABLE_INVOICE_KINDS = ['INVOICE', 'DEBIT_NOTE'] as const;

/** Credit notes issued on each document (an invoice, or a debit note a credit note corrects), in its own currency. */
export async function creditedByInvoice(tx: Prisma.TransactionClient, invoiceIds: string[]): Promise<Map<string, number>> {
  if (invoiceIds.length === 0) return new Map();
  const rows = await tx.invoice.groupBy({
    by: ['relatedInvoiceId'],
    where: { relatedInvoiceId: { in: invoiceIds }, docType: 'CREDIT_NOTE' },
    _sum: { total: true },
  });
  return new Map(rows.map((r) => [r.relatedInvoiceId as string, round2(Number(r._sum.total ?? 0))]));
}

/** The customer side of the shared settlement path: invoices keyed by customer, allocations in `payment_allocations`. */
export const invoiceTarget = (tx: Prisma.TransactionClient): SettlementTarget => ({
  table: 'invoices',
  partyColumn: 'customerId',
  documentKey: 'invoiceId',
  allocations: tx.paymentAllocation,
  payableKinds: RECEIVABLE_INVOICE_KINDS,
  creditKind: 'CREDIT_NOTE',
  creditedBy: (ids) => creditedByInvoice(tx, ids),
  isClosed: async (id) => {
    const doc = await tx.invoice.findUnique({ where: { id }, select: { zatcaStatus: true, replacedBy: { select: { id: true } } } });
    return doc !== null && isReplacedRejected(doc);
  },
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
