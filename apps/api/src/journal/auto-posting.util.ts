import { Prisma } from '@prisma/client';
import { createJournalEntry, PostingLine, reverseAndDeleteJournalEntry } from './journal-posting.util';

/** Resolves a set of account codes to ids, scoped by the tenant context
 * already baked into `tx`. Returns `null` (soft-skip signal) if any code
 * isn't set up for this company yet — matches the mockup's
 * `postInvoiceToLedger`/`postPurchaseToLedger`, which silently skip posting
 * rather than blocking the invoice/purchase itself when the chart of
 * accounts isn't ready. */
async function resolveAccountIds(tx: Prisma.TransactionClient, codes: string[]): Promise<Map<string, string> | null> {
  const rows = await tx.account.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const ids = new Map(rows.map((r) => [r.code, r.id]));
  return codes.every((c) => ids.has(c)) ? ids : null;
}

const PURCHASE_CATEGORY_ACCOUNT: Record<string, string> = {
  'رواتب': '5200',
  'رواتب وأجور': '5200',
  'تكلفة مبيعات': '5100',
  'مواد خام': '5100',
  'بضاعة': '5100',
  'مصروفات أخرى': '5400',
  'مصروفات تأسيس': '5500',
};

/** Default 5300 = "مصروفات إدارية وعمومية" (general & administrative),
 * matching the mockup's `purchaseExpenseAccount` fallback exactly. */
export function purchaseExpenseAccountCode(category?: string | null): string {
  return PURCHASE_CATEGORY_ACCOUNT[(category ?? '').trim()] ?? '5300';
}

export interface InvoiceForPosting {
  no: string;
  issueDate: Date;
  customerName: string;
  subtotal: number;
  taxTotal: number;
  total: number;
}

/** Debit A/R (1200) for the total, credit Revenue (4100) for the subtotal,
 * credit VAT payable (2200) for the tax — matches the mockup's
 * `invoicePostingLines`/`postInvoiceToLedger`. Returns `null` (soft-skip) if
 * the invoice has nothing to post or a required account is missing. */
export async function postInvoiceEntry(tx: Prisma.TransactionClient, companyId: string, inv: InvoiceForPosting) {
  if (inv.total <= 0) return null;

  const needCodes = ['1200', '4100', ...(inv.taxTotal > 0 ? ['2200'] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = [{ accountId: ids.get('1200')!, debit: inv.total, credit: 0 }];
  if (inv.subtotal > 0) lines.push({ accountId: ids.get('4100')!, debit: 0, credit: inv.subtotal });
  if (inv.taxTotal > 0) lines.push({ accountId: ids.get('2200')!, debit: 0, credit: inv.taxTotal });

  return createJournalEntry(tx, {
    companyId,
    date: inv.issueDate,
    memo: `فاتورة مبيعات ${inv.no} — ${inv.customerName}`,
    lines,
    auto: true,
  });
}

export interface PurchaseForPosting {
  no: string;
  date: Date;
  supplierName: string;
  category: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
}

/** Debit the category's expense account for the subtotal, debit VAT (2200)
 * for the tax (it reduces what's owed to the authority), credit A/P (2100)
 * for the total — matches the mockup's `postPurchaseToLedger`. Returns
 * `null` (soft-skip) if there's nothing to post or a required account is
 * missing. */
export async function postPurchaseEntry(tx: Prisma.TransactionClient, companyId: string, p: PurchaseForPosting) {
  if (p.total <= 0) return null;

  const expCode = purchaseExpenseAccountCode(p.category);
  const needCodes = [expCode, '2100', ...(p.taxAmount > 0 ? ['2200'] : [])];
  const ids = await resolveAccountIds(tx, needCodes);
  if (!ids) return null;

  const lines: PostingLine[] = [{ accountId: ids.get(expCode)!, debit: p.subtotal, credit: 0 }];
  if (p.taxAmount > 0) lines.push({ accountId: ids.get('2200')!, debit: p.taxAmount, credit: 0 });
  lines.push({ accountId: ids.get('2100')!, debit: 0, credit: p.total });

  return createJournalEntry(tx, {
    companyId,
    date: p.date,
    memo: `فاتورة شراء ${p.no} — ${p.supplierName}`,
    lines,
    auto: true,
  });
}

export interface RentPaymentForPosting {
  contractNo: string;
  tenant: string;
  date: Date;
  netAmount: number;
}

/** Debit cash (1000), credit rental revenue (4200) — a distinct revenue
 * account from sales invoices' 4100, matching the mockup's rent-collection
 * posting (`confirmRentPayment`). Returns `null` (soft-skip) if either
 * account isn't set up yet for this company. */
export async function postRentPaymentEntry(tx: Prisma.TransactionClient, companyId: string, p: RentPaymentForPosting) {
  if (p.netAmount <= 0) return null;

  const ids = await resolveAccountIds(tx, ['1000', '4200']);
  if (!ids) return null;

  return createJournalEntry(tx, {
    companyId,
    date: p.date,
    memo: `دفعة إيجار — عقد ${p.contractNo} — ${p.tenant}`,
    lines: [
      { accountId: ids.get('1000')!, debit: p.netAmount, credit: 0 },
      { accountId: ids.get('4200')!, debit: 0, credit: p.netAmount },
    ],
    auto: true,
  });
}

/** Reverses and deletes a document's linked auto-posted entry, if any —
 * shared by both invoice and purchase delete/repost paths. No-op when
 * `journalEntryId` is null (the document was never posted, e.g. missing
 * accounts at creation time). */
export async function unpostIfLinked(tx: Prisma.TransactionClient, journalEntryId: string | null): Promise<void> {
  if (!journalEntryId) return;
  await reverseAndDeleteJournalEntry(tx, journalEntryId);
}
