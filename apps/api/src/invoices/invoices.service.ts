import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertBranchAllowed, branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { buildZatcaQr } from '../zatca/qr.util';
import { Prisma } from '@prisma/client';
import { toBaseAmount, resolveCurrency } from '../common/currency/base-amount.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postCreditNoteEntry, postDebitNoteEntry, postInvoiceEntry, unpostIfLinked } from '../journal/auto-posting.util';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { documentYear } from '../common/document-year.util';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { MSG } from '../common/i18n/messages';

/** `relatedInvoice` so a credit note can show which invoice it adjusts
 * without a second round-trip — number only, never the whole document. */
const INVOICE_INCLUDE = { customer: true, lines: true, relatedInvoice: { select: { id: true, no: true } } } as const;

/** Money is 2 decimals everywhere — the columns are `Decimal(18,2)`. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Always derive totals from the lines server-side — a client-submitted total is
 * never trusted (a client could otherwise bill an arbitrary amount).
 *
 * Rounded here, at the boundary, for two reasons. The columns are
 * `Decimal(18,2)`, so Postgres rounds anyway — leaving the raw float in memory
 * meant a value read back from the database no longer equalled the one just
 * computed, which is what made a *full* credit note (identical lines) look
 * like it exceeded its invoice. And `total` is built from the already-rounded
 * parts rather than rounded independently, so `subtotal + taxTotal === total`
 * exactly — the invoice XML states all three, and ZATCA rejects a document
 * whose monetary totals disagree by a hallala.
 */
export function computeTotals(lines: InvoiceLineDto[]) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  const taxTotal = round2(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice * (l.taxRate / 100), 0));
  return { subtotal, taxTotal, total: round2(subtotal + taxTotal) };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * What each document still leaves the customer owing.
   *
   * Derived here rather than on each screen because a credit note settles its
   * invoice **in the ledger** (it credits 1200) while deliberately leaving the
   * invoice row alone — so a status-only reading of receivables would keep
   * chasing a debt the books already show as cancelled, and every screen would
   * have to remember that independently.
   *
   * - an invoice owes its total, less whatever has been credited against it;
   * - a credit note owes nothing (it is the reduction, already applied above);
   * - a debit note owes its own total — it IS additional billing.
   *
   * Floored at zero: a fully-credited invoice that was also marked paid must
   * not read as the customer being owed money.
   */
  private outstandingOf(
    inv: { docType: string; status: string; total: Prisma.Decimal; id: string },
    creditedByInvoiceId: Map<string, number>,
    allocatedByInvoiceId: Map<string, number>,
  ): number {
    if (inv.docType === 'CREDIT_NOTE') return 0;
    if (inv.status === 'PAID') return 0;
    const credited = inv.docType === 'INVOICE' ? (creditedByInvoiceId.get(inv.id) ?? 0) : 0;
    // المقبوض يُطرح كما يُطرح الإشعار الدائن — وإغفاله كان يجعل الفاتورة
    // المسدَّدة جزئياً تُحتسب بكامل قيمتها، فيطالَب العميل بما دفعه.
    // (قاعدة 4.5: أي رقم يعرض «المتبقي» يُحسب من التخصيصات لا من حقل.)
    const allocated = allocatedByInvoiceId.get(inv.id) ?? 0;
    return Math.max(0, round2(Number(inv.total) - credited - allocated));
  }

  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const invoices = await tx.invoice.findMany({ where: branchFilter(allowedBranchIds), include: INVOICE_INCLUDE, orderBy: { issueDate: 'desc' } });

      // Credited amount per original invoice, in one pass — a per-row query
      // would be a request per invoice on a screen that lists all of them.
      const creditTotals = await tx.invoice.groupBy({
        by: ['relatedInvoiceId'],
        where: { docType: 'CREDIT_NOTE', relatedInvoiceId: { not: null } },
        _sum: { total: true },
      });
      const creditedByInvoiceId = new Map(creditTotals.map((row) => [row.relatedInvoiceId!, Number(row._sum.total ?? 0)]));

      // المقبوض لكل فاتورة في استعلام واحد — كما تفعل خريطة الإشعارات أعلاه،
      // فاستعلامٌ لكل صف على شاشة تسردها جميعاً طلبٌ لكل فاتورة.
      const allocationTotals = await tx.paymentAllocation.groupBy({ by: ['invoiceId'], _sum: { amount: true } });
      const allocatedByInvoiceId = new Map(allocationTotals.map((row) => [row.invoiceId, Number(row._sum.amount ?? 0)]));

      // The ZATCA QR is derived, not stored: it must reflect the company's
      // *current* legal name and VAT number, so an invoice issued before the
      // company profile was completed starts showing a valid QR the moment
      // those fields are filled in — rather than being permanently stamped
      // with the blanks it was created with.
      //
      // Company is the tenant identity row (no RLS, not in the tenant-scope
      // extension), so it's read straight by id from the verified context.
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { legalName: true, vatNumber: true },
      });

      return invoices.map((inv) => ({
        ...inv,
        /** What this document still leaves owing — see outstandingOf. */
        outstanding: this.outstandingOf(inv, creditedByInvoiceId, allocatedByInvoiceId),
        /** How much of this invoice has been credited back, so a screen can
         * show the invoice as partly reversed without a second request. */
        creditedTotal: inv.docType === 'INVOICE' ? (creditedByInvoiceId.get(inv.id) ?? 0) : 0,
        zatcaQr: buildZatcaQr({
          sellerName: company?.legalName ?? '',
          vatNumber: company?.vatNumber ?? '',
          issuedAt: inv.issueDate,
          // ZATCA wants the figures as billed, in the invoice's own currency.
          total: Number(inv.total),
          vatAmount: Number(inv.taxTotal),
        }),
      }));
    });
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateInvoiceDto) {
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextInvoiceNumber's comment.
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, (tx) => this.createWithinTx(tx, companyId, allowedBranchIds, dto)));
  }

  /**
   * نقطة الدخول داخل-المعاملة (4.9): يستهلكها تحويل عرض السعر ليجعل إنشاء
   * الفاتورة وختمَ العرض معاملةً واحدة ذرّية. الجسد هو ما كان داخل create
   * حرفياً — لا تغيير سلوك للمسار القائم، واختباراته القديمة حكمُ ذلك.
   * ملاحظة: من يستدعيها مسؤول عن retryOnUniqueConflict حول معاملته كلها.
   */
  async createWithinTx(tx: Prisma.TransactionClient, companyId: string, allowedBranchIds: string[] | 'all', dto: CreateInvoiceDto) {
    const { subtotal, taxTotal, total } = computeTotals(dto.lines);
    const { currency, exchangeRate } = resolveCurrency(dto);
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      const no = await this.nextDocumentNumber(tx, 'INV', new Date(dto.issueDate));
      const created = await tx.invoice.create({
        // `companyId` (top-level and on each nested line) is set explicitly
        // rather than relying on the tenant-scope extension: nested relation
        // writes like `lines: { create: [...] }` happen inside the query
        // engine and are never seen by the extension's per-operation hook,
        // so it can only auto-inject companyId for the top-level Invoice
        // write, not for InvoiceLine here. Postgres RLS backstops this
        // regardless (see tenant-prisma.service.ts).
        data: {
          companyId,
          no,
          branchId,
          customerId: dto.customerId,
          issueDate: new Date(dto.issueDate),
          dueDate: new Date(dto.dueDate),
          notes: dto.notes,
          subtotal,
          taxTotal,
          total,
          currency,
          exchangeRate,
          baseSubtotal: toBaseAmount(subtotal, exchangeRate),
          baseTaxTotal: toBaseAmount(taxTotal, exchangeRate),
          baseTotal: toBaseAmount(total, exchangeRate),
          lines: {
            create: dto.lines.map((l) => ({
              companyId,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate,
            })),
          },
        } as unknown as Prisma.InvoiceUncheckedCreateInput,
        include: INVOICE_INCLUDE,
      });

      // Auto-post to the ledger; soft-skip (journalEntryId stays null) if the
      // required accounts (1200/4100/2200) aren't set up for this company yet
      // — see the schema comment on Invoice.journalEntryId.
      const entry = await postInvoiceEntry(tx, companyId, {
        branchId: created.branchId,
        no: created.no,
        issueDate: created.issueDate,
        customerName: created.customer.name,
        baseSubtotal: Number(created.baseSubtotal),
        baseTaxTotal: Number(created.baseTaxTotal),
        baseTotal: Number(created.baseTotal),
      });
      if (!entry) return created;
      return tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
  }

  update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.invoice_not_found);

      // What the submitted XML is signed over. Notes and payment status are
      // absent on purpose: they never enter the document, so they stay
      // editable at every stage — a cleared invoice must still be markable
      // PAID.
      //
      // The test is presence, not difference: a field that arrives is treated
      // as an attempt to set it, exactly like `affectsPosting` below. Diffing
      // submitted values against stored ones would make the guard depend on
      // Decimal/date normalisation getting it right every time, and a guard
      // that silently lets an edit through when the comparison is wrong is
      // worse than one that refuses a no-op resubmission. It also means the
      // builder screen — which always posts the whole document — is refused
      // as a whole, which is the right answer for a locked invoice.
      const changesSignedContent =
        dto.lines !== undefined ||
        dto.customerId !== undefined ||
        dto.issueDate !== undefined ||
        dto.dueDate !== undefined ||
        // Currency and rate reach the authority through the base* columns:
        // ZATCA is told the VAT figure in SAR, and that is `baseTaxTotal`.
        dto.currency !== undefined ||
        dto.exchangeRate !== undefined;

      // A credit note adjusts a document as it stood — editing it afterwards
      // would silently change what was adjusted. Delete + reissue instead. A
      // debit note is receivable, so its payment status may still move.
      if (existing.docType === 'CREDIT_NOTE') throw new BadRequestException(MSG.credit_note_immutable);
      if (existing.docType === 'DEBIT_NOTE' && changesSignedContent) throw new BadRequestException(MSG.credit_note_immutable);

      if (changesSignedContent) {
        // The line is acceptance, not whether the chain was touched. A
        // CLEARED invoice is a standing legal document and the authority
        // holds its signed XML — editing the row would make the two disagree,
        // so correction is by credit note. A REJECTED one has no legal
        // existence at all: fixing the data and resubmitting is the intended
        // recovery, and a credit note against a document the authority never
        // accepted would be a note against nothing. (Deletion stays refused
        // for both — see remove(): a rejected invoice has still burned its
        // ICV slot, and editing keeps that slot while deleting leaves a gap.)
        if (existing.zatcaStatus === 'CLEARED') throw new ConflictException(MSG.zatca_invoice_cleared_locked);
        // In flight: the request may already be at the authority and may come
        // back CLEARED, which would leave the row disagreeing with the XML
        // just as an edit-after-clearance does. Brief by design — the status
        // is set immediately before dispatch and overwritten by the outcome.
        if (existing.zatcaStatus === 'SUBMITTING') throw new ConflictException(MSG.zatca_invoice_submitting_locked);

        // Second layer. `latestChainHash` no longer hands a rejected
        // invoice's hash to the next document, so the normal path can no
        // longer produce this shape — but rows recorded before that rule, and
        // any future path that sets a PIH another way, still can. Where a
        // successor has committed to this document's hash, recomputing it on
        // resubmission would leave that successor pointing at a hash that
        // exists nowhere. Testing for the successor directly (rather than
        // "is there a higher ICV") keeps the common case — fix the rejection
        // and retry immediately — open, and refuses only when something is
        // genuinely attached.
        if (existing.zatcaHash !== null) {
          const successors = await tx.invoice.count({ where: { zatcaPreviousHash: existing.zatcaHash } });
          if (successors > 0) throw new ConflictException(MSG.zatca_invoice_successor_locked);
        }
      }

      const data: Prisma.InvoiceUncheckedUpdateInput = {};
      if (dto.customerId) data.customerId = dto.customerId;
      if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
      if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.status) data.status = dto.status;

      if (dto.lines) {
        const totals = computeTotals(dto.lines);
        // The rate stays whatever the invoice was issued at unless the caller
        // explicitly sends a new one — re-editing lines must not silently
        // reprice the document at today's rate.
        const rate = dto.exchangeRate ?? Number(existing.exchangeRate);
        data.subtotal = totals.subtotal;
        data.taxTotal = totals.taxTotal;
        data.total = totals.total;
        data.baseSubtotal = toBaseAmount(totals.subtotal, rate);
        data.baseTaxTotal = toBaseAmount(totals.taxTotal, rate);
        data.baseTotal = toBaseAmount(totals.total, rate);
        if (dto.currency) data.currency = dto.currency;
        if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
        // Replace-all rather than diffing line-by-line — simplest correct
        // approach, and invoices are edited as a whole in the UI anyway.
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        data.lines = {
          create: dto.lines.map((l) => ({
            companyId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
          })),
        } as unknown as Prisma.InvoiceUncheckedUpdateInput['lines'];
      }

      // Anything that changes what should be posted (who, when, or the
      // amounts) reverses the old auto-entry and re-posts fresh, rather than
      // trying to patch a posted entry in place — matches the "never edit a
      // posted entry" rule from journal-posting.util.
      const affectsPosting = dto.customerId !== undefined || dto.issueDate !== undefined || dto.lines !== undefined;
      if (affectsPosting && existing.journalEntryId) {
        // Detach first: the old entry can't be deleted while this invoice
        // still references it (onDelete: Restrict).
        data.journalEntryId = null;
      }

      const updated = await tx.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
      if (!affectsPosting) return updated;

      if (existing.journalEntryId) await unpostIfLinked(tx, existing.journalEntryId);
      const entry = await postInvoiceEntry(tx, companyId, {
        branchId: updated.branchId,
        no: updated.no,
        issueDate: updated.issueDate,
        customerName: updated.customer.name,
        baseSubtotal: Number(updated.baseSubtotal),
        baseTaxTotal: Number(updated.baseTaxTotal),
        baseTotal: Number(updated.baseTotal),
      });
      if (!entry) return updated;
      return tx.invoice.update({ where: { id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.invoice_not_found);
      // An assigned ICV means this document occupies a position in the
      // authority's hash chain — CLEARED or REJECTED alike (a retry reuses
      // the position, so even a rejected one has burned it). A submission
      // interrupted after the ICV was stamped but before the hash was
      // recorded is covered by the same condition. Deleting the row would
      // leave the next document chained onto a hash that no longer exists
      // locally. Reversal is a credit note, not a delete.
      if (existing.zatcaIcv !== null || existing.zatcaHash !== null) throw new ConflictException(MSG.zatca_invoice_chain_locked);
      // The FK is Restrict, so this would fail anyway — checked here to give
      // a diagnosable 409 instead of a raw constraint error.
      const adjustments = await tx.invoice.count({ where: { relatedInvoiceId: id } });
      if (adjustments > 0) throw new ConflictException(MSG.invoice_has_credit_notes);
      await tx.invoice.delete({ where: { id } });
      // Deleting the invoice first removes the only row referencing the
      // entry, so it can now be reversed and deleted without hitting the
      // Restrict FK.
      await unpostIfLinked(tx, existing.journalEntryId);
    });
  }

  /**
   * Issues a credit note against an existing invoice (ZATCA type 381).
   *
   * The original is never touched — not its lines, not its posted entry (the
   * never-edit rule from journal-posting.util). The note is its own row in
   * the invoice table (docType CREDIT_NOTE) carrying **positive** amounts —
   * direction comes from the docType, exactly as the UBL document ZATCA
   * receives carries positive amounts under type code 381 — and it posts its
   * own reversing journal entry.
   */
  issueCreditNote(companyId: string, allowedBranchIds: string[] | 'all', invoiceId: string, dto: CreateCreditNoteDto) {
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const original = await this.adjustableOriginal(tx, invoiceId, allowedBranchIds);

      const lines: InvoiceLineDto[] =
        dto.lines ??
        original.lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxRate: Number(l.taxRate),
        }));
      const totals = computeTotals(lines);

      // All credit notes on one invoice together must not exceed what it
      // billed — crediting more than was ever invoiced is a bookkeeping
      // error, not a judgment call. (No such cap exists for debit notes:
      // additional billing has no arithmetic ceiling.)
      const already = await tx.invoice.aggregate({
        where: { relatedInvoiceId: invoiceId, docType: 'CREDIT_NOTE' },
        _sum: { total: true },
      });
      // Both sides rounded to the money scale before comparing: `remaining`
      // comes back from Decimal columns, `totals.total` from computeTotals.
      // The epsilon then only absorbs float representation, not a rounding
      // difference — which is what used to reject a legitimate full credit.
      const remaining = round2(Number(original.total) - Number(already._sum.total ?? 0));
      if (round2(totals.total) > remaining + 0.001) throw new BadRequestException(MSG.credit_note_exceeds_remaining);

      return this.createAdjustmentNote(tx, companyId, original, {
        docType: 'CREDIT_NOTE',
        numberKind: 'CN',
        reason: dto.reason,
        issueDate: dto.issueDate,
        lines,
        totals,
        // Nothing is receivable on a credit note — PAID keeps it out of
        // every outstanding/aging computation keyed on status.
        status: 'PAID',
        post: postCreditNoteEntry,
      });
    }));
  }

  /**
   * Issues a debit note (ZATCA type 383) — additional billing against an
   * already-issued invoice (an undercharge, extra delivery costs). Same
   * document mechanics as the credit note, opposite economics: it posts in
   * the invoice's own direction and IS receivable, so it starts DUE and its
   * payment status may later move to PAID.
   */
  issueDebitNote(companyId: string, allowedBranchIds: string[] | 'all', invoiceId: string, dto: CreateDebitNoteDto) {
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const original = await this.adjustableOriginal(tx, invoiceId, allowedBranchIds);
      return this.createAdjustmentNote(tx, companyId, original, {
        docType: 'DEBIT_NOTE',
        numberKind: 'DN',
        reason: dto.reason,
        issueDate: dto.issueDate,
        lines: dto.lines,
        totals: computeTotals(dto.lines),
        status: 'DUE',
        post: postDebitNoteEntry,
      });
    }));
  }

  /** The one invoice a note may point at: exists, is a real invoice (a chain
   * of notes must all reference the one original — adjusting an adjustment
   * would compound), and sits in a branch the caller may write to. */
  private async adjustableOriginal(tx: Prisma.TransactionClient, invoiceId: string, allowedBranchIds: string[] | 'all') {
    const original = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true, lines: true } });
    if (!original) throw new NotFoundException(MSG.invoice_not_found);
    if (original.docType !== 'INVOICE') throw new BadRequestException(MSG.credit_note_target_invalid);
    assertBranchAllowed(allowedBranchIds, original.branchId);
    return original;
  }

  /** Shared tail of both note kinds: the row, its lines, and its own posted
   * entry. Everything that differs between 381 and 383 arrives decided. */
  private async createAdjustmentNote(
    tx: Prisma.TransactionClient,
    companyId: string,
    original: { id: string; branchId: string | null; customerId: string; currency: string; exchangeRate: Prisma.Decimal },
    note: {
      docType: 'CREDIT_NOTE' | 'DEBIT_NOTE';
      numberKind: 'CN' | 'DN';
      reason: string;
      issueDate?: string;
      lines: InvoiceLineDto[];
      totals: { subtotal: number; taxTotal: number; total: number };
      status: 'PAID' | 'DUE';
      post: typeof postCreditNoteEntry;
    },
  ) {
    // Same currency at the SAME rate as the original: the note adjusts that
    // document, so repricing at today's rate would make the pair
    // irreconcilable in base currency.
    const rate = Number(original.exchangeRate);
    // التاريخ يسبق الرقم — فالبادئة تُشتقّ منه.
    const issueDate = note.issueDate ? new Date(note.issueDate) : new Date();
    const no = await this.nextDocumentNumber(tx, note.numberKind, issueDate);
    const { subtotal, taxTotal, total } = note.totals;

    const created = await tx.invoice.create({
      data: {
        companyId,
        no,
        docType: note.docType,
        relatedInvoiceId: original.id,
        adjustmentReason: note.reason,
        branchId: original.branchId,
        customerId: original.customerId,
        issueDate,
        dueDate: issueDate,
        status: note.status,
        subtotal,
        taxTotal,
        total,
        currency: original.currency,
        exchangeRate: rate,
        baseSubtotal: toBaseAmount(subtotal, rate),
        baseTaxTotal: toBaseAmount(taxTotal, rate),
        baseTotal: toBaseAmount(total, rate),
        lines: {
          create: note.lines.map((l) => ({
            companyId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
          })),
        },
      } as unknown as Prisma.InvoiceUncheckedCreateInput,
      include: INVOICE_INCLUDE,
    });

    const entry = await note.post(tx, companyId, {
      branchId: created.branchId,
      no: created.no,
      issueDate: created.issueDate,
      customerName: created.customer.name,
      baseSubtotal: Number(created.baseSubtotal),
      baseTaxTotal: Number(created.baseTaxTotal),
      baseTotal: Number(created.baseTotal),
    });
    if (!entry) return created;
    return tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
  }

  /** `INV-<year>-<seq>` for invoices, `CN-`/`DN-` for credit/debit notes,
   * matching the original mockup's numbering. Based on the highest existing
   * sequence for the year, not `count()` — a count-based scheme collides with
   * an already-issued number as soon as any row has ever been deleted
   * (count() drops but the old high number is still taken). Two concurrent
   * creates can still compute the same next number; `@@unique([companyId,
   * no])` turns that into a P2002 instead of a silent duplicate, and the
   * callers retry the whole transaction on that error (see
   * retryOnUniqueConflict). */
  private async nextDocumentNumber(tx: Prisma.TransactionClient, kind: 'INV' | 'CN' | 'DN', issueDate: Date): Promise<string> {
    const year = documentYear(issueDate);
    const prefix = `${kind}-${year}-`;
    const rows = await tx.invoice.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
    const maxSeq = rows.reduce((max, r) => {
      const n = parseInt(r.no.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }
}
