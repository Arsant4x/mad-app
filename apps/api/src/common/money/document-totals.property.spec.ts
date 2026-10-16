import { Prisma } from '@mad-app/db';
import { toBaseAmount } from '../currency/base-amount.util';
import { createJournalEntry, type PostingLine } from '../../journal/journal-posting.util';
import {
  postCreditNoteEntry,
  postDebitNoteEntry,
  postInvoiceEntry,
  postPrepaymentInvoiceEntry,
  postPurchaseEntry,
  postSupplierNoteEntry,
} from '../../journal/auto-posting.util';
import { prepaymentDocumentAmounts } from '../../invoices/issue-prechecks.util';
import { computePurchaseTax, purchaseBaseTotals } from '../../purchases/purchases.service';
import { roundTo, toHalalas } from './rounding';
import { baseCurrencyTotals, computeDocumentTotals, type MoneyLine } from './totals';

// The posting utilities run for real; only the write to the database is replaced by a capture.
jest.mock('../../journal/journal-posting.util', () => ({
  ...jest.requireActual('../../journal/journal-posting.util'),
  createJournalEntry: jest.fn(async () => ({ id: 'entry' })),
}));
jest.mock('../../journal/inventory-accounts.util', () => ({
  getOrCreateInputVatAccount: jest.fn(async () => 'acc-1250'),
  getOrCreateInventoryAccount: jest.fn(async () => 'acc-1300'),
}));
jest.mock('../../journal/receipt-clearing-account.util', () => ({
  getOrCreateReceiptClearingAccount: jest.fn(async () => 'acc-2101'),
}));

// Suite budget: 24,000 documents run in about four seconds here, above the five second default under load.
jest.setTimeout(30000);

/**
 * Property test over document totals, through the functions the document services call. For thousands
 * of generated documents of every kind: the stored totals are the sum of their parts in the document
 * and the base currency, the base total and tax are the document total and tax at the document rate
 * (what a payment at that rate settles and what the authority receives in SAR), and the entry the
 * posting utility builds from them balances to the halala.
 */

const fakeTx = {
  account: { findMany: async (args: { where: { code: { in: string[] } } }) => args.where.code.in.map((code) => ({ id: `acc-${code}`, code })) },
} as unknown as Prisma.TransactionClient;

/** Deterministic generator, so a failure always reproduces from its seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[int(rng, 0, xs.length - 1)];

/** Quantities are stored with 3 decimals, unit prices with 6, exchange rates with 6. */
const quantity = (rng: Rng) => (rng() < 0.5 ? int(rng, 1, 50) : int(rng, 1, 100000) / 1000);
const unitPrice = (rng: Rng) => (rng() < 0.5 ? int(rng, 1, 1000000) / 100 : int(rng, 1, 1000000000) / 1000000);
const exchangeRate = (rng: Rng) => (rng() < 0.2 ? 1 : rng() < 0.3 ? pick(rng, [3.75, 0.266667, 4.1, 0.0251, 1.000001]) : int(rng, 1, 10000000) / 1000000);

const CATEGORIES = [
  { taxCategory: 'S', taxRate: 15 },
  { taxCategory: 'S', taxRate: 15 },
  { taxCategory: 'Z', taxRate: 0, taxExemptionReasonCode: 'VATEX-SA-35' },
  { taxCategory: 'E', taxRate: 0, taxExemptionReasonCode: 'VATEX-SA-29' },
  { taxCategory: 'O', taxRate: 0, taxExemptionReasonCode: 'VATEX-SA-OOS', taxExemptionReason: 'out of scope' },
] as const;

function lines(rng: Rng): MoneyLine[] {
  return Array.from({ length: int(rng, 1, 8) }, () => {
    const q = quantity(rng);
    const p = unitPrice(rng);
    const gross = roundTo(q * p, 'LINE_AMOUNT');
    const discount = rng() < 0.2 ? int(rng, 0, Math.max(0, toHalalas(gross) - 1)) / 100 : 0;
    return { quantity: q, unitPrice: p, discount, ...pick(rng, CATEGORIES) };
  });
}

interface StoredDocument {
  rate: number;
  subtotal: number;
  tax: number;
  total: number;
  baseSubtotal: number;
  baseTax: number;
  baseTotal: number;
}

/** Money columns are Decimal(18,2): what the row holds is the value rounded to two places. */
const column = (v: number) => roundTo(v, 'INVOICE_TOTAL');
const stored = (d: StoredDocument): StoredDocument => ({
  rate: d.rate,
  subtotal: column(d.subtotal),
  tax: column(d.tax),
  total: column(d.total),
  baseSubtotal: column(d.baseSubtotal),
  baseTax: column(d.baseTax),
  baseTotal: column(d.baseTotal),
});

function salesDocument(ls: MoneyLine[], rate: number): StoredDocument {
  const t = computeDocumentTotals(ls);
  const b = baseCurrencyTotals(t, rate);
  return stored({ rate, subtotal: t.subtotal, tax: t.taxTotal, total: t.total, baseSubtotal: b.baseSubtotal, baseTax: b.baseTaxTotal, baseTotal: b.baseTotal });
}

function purchaseDocument(net: number, exempt: boolean, rate: number): StoredDocument {
  const { subtotal, tax, total } = computePurchaseTax(net, exempt);
  const b = purchaseBaseTotals(tax, total, rate);
  return stored({ rate, subtotal, tax, total, baseSubtotal: b.baseSubtotal, baseTax: b.baseTaxAmount, baseTotal: b.baseTotal });
}

/** The entry the posting utility hands to createJournalEntry, checked the way createJournalEntry checks it. */
async function postedBalance(post: () => Promise<unknown>): Promise<boolean> {
  const mock = jest.mocked(createJournalEntry);
  mock.mockClear();
  await post();
  if (mock.mock.calls.length === 0) return true;
  const entryLines = (mock.mock.calls[0][1] as { lines: PostingLine[] }).lines;
  const debit = entryLines.reduce((s, l) => s + toHalalas(l.debit), 0);
  const credit = entryLines.reduce((s, l) => s + toHalalas(l.credit), 0);
  return debit > 0 && debit === credit;
}

const sumOfParts = (d: StoredDocument) => toHalalas(d.subtotal) + toHalalas(d.tax) === toHalalas(d.total) && toHalalas(d.baseSubtotal) + toHalalas(d.baseTax) === toHalalas(d.baseTotal);
const atDocumentRate = (d: StoredDocument) => toHalalas(d.baseTotal) === toHalalas(toBaseAmount(d.total, d.rate)) && toHalalas(d.baseTax) === toHalalas(toBaseAmount(d.tax, d.rate));

const CASES = 4000;
const header = { customerId: 'c', supplierId: 's', branchId: null, no: 'X-1', date: new Date('2026-06-01'), issueDate: new Date('2026-06-01'), customerName: 'c', supplierName: 's' };

type Failure = { kind: string; seed: number; doc: StoredDocument; reason: string };

async function check(kind: string, seed: number, doc: StoredDocument, post: (d: StoredDocument) => Promise<unknown>, failures: Failure[]) {
  if (!sumOfParts(doc)) failures.push({ kind, seed, doc, reason: 'stored totals are not the sum of their parts' });
  else if (!atDocumentRate(doc)) failures.push({ kind, seed, doc, reason: 'base total or tax is not the document amount at its rate' });
  else if (!(await postedBalance(() => post(doc)))) failures.push({ kind, seed, doc, reason: 'posted entry does not balance' });
}

describe('Document totals property test', () => {
  it(`stores totals equal to the sum of their parts and posts balanced entries for ${CASES} documents of each kind`, async () => {
    const failures: Failure[] = [];
    const sale = (d: StoredDocument) => ({ ...header, baseSubtotal: d.baseSubtotal, baseTaxTotal: d.baseTax, baseTotal: d.baseTotal });
    for (let seed = 1; seed <= CASES; seed++) {
      const rng = mulberry32(seed);
      const rate = exchangeRate(rng);

      const invoice = salesDocument(lines(rng), rate);
      await check('invoice', seed, invoice, (d) => postInvoiceEntry(fakeTx, 'co', sale(d)), failures);
      const credit = salesDocument(lines(rng), rate);
      await check('credit note', seed, credit, (d) => postCreditNoteEntry(fakeTx, 'co', sale(d)), failures);
      const debit = salesDocument(lines(rng), rate);
      await check('debit note', seed, debit, (d) => postDebitNoteEntry(fakeTx, 'co', sale(d)), failures);

      const pre = prepaymentDocumentAmounts(int(rng, 100, 10000000) / 100, pick(rng, [15, 0]));
      const prepayment = salesDocument([{ quantity: 1, unitPrice: pre.net, taxRate: pre.taxTotal > 0 ? 15 : 0 }], rate);
      await check('prepayment', seed, prepayment, (d) => postPrepaymentInvoiceEntry(fakeTx, 'co', { ...sale(d), prepaymentsAccountId: 'acc-2450' }), failures);

      const exempt = rng() < 0.15;
      const purchaseSubtotal = rng() < 0.8 ? int(rng, 1, 10000000) / 100 : int(rng, 10, 100000000) / 1000;
      const purchase = purchaseDocument(purchaseSubtotal, exempt, rate);
      const stockedShare = rng() < 0.5 ? 0 : int(rng, 0, toHalalas(purchase.baseSubtotal)) / 100;
      await check(
        'purchase',
        seed,
        purchase,
        (d) => postPurchaseEntry(fakeTx, 'co', { ...header, categoryCode: null, baseSubtotal: d.baseSubtotal, baseTaxAmount: d.baseTax, baseTotal: d.baseTotal, baseStockedSubtotal: stockedShare }),
        failures,
      );

      const noteLines = lines(rng);
      const noteSubtotal = roundTo(noteLines.reduce((t, l) => t + l.quantity * l.unitPrice, 0), 'LINE_AMOUNT');
      const note = purchaseDocument(noteSubtotal, exempt, rate);
      await check(
        'supplier note',
        seed,
        note,
        (d) =>
          postSupplierNoteEntry(fakeTx, 'co', {
            ...header,
            side: rng() < 0.5 ? 'credit' : 'debit',
            categoryCode: null,
            baseSubtotal: d.baseSubtotal,
            baseTaxAmount: d.baseTax,
            baseTotal: d.baseTotal,
            baseInventory: 0,
            baseCogs: 0,
          }),
        failures,
      );
    }
    const byKind = failures.reduce<Record<string, number>>((m, f) => ({ ...m, [f.kind]: (m[f.kind] ?? 0) + 1 }), {});
    expect({ failures: failures.length, byKind, first: failures.slice(0, 3) }).toEqual({ failures: 0, byKind: {}, first: [] });
  });
});
