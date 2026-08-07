import { Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { buildZatcaQr } from '../zatca/qr.util';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postInvoiceEntry, unpostIfLinked } from '../journal/auto-posting.util';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { MSG } from '../common/i18n/messages';

const INVOICE_INCLUDE = { customer: true, lines: true } as const;

/** Always derive totals from the lines server-side — a client-submitted
 * total is never trusted (a client could otherwise bill an arbitrary amount). */
export function computeTotals(lines: InvoiceLineDto[]) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const taxTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice * (l.taxRate / 100), 0);
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const invoices = await tx.invoice.findMany({ where: branchFilter(allowedBranchIds), include: INVOICE_INCLUDE, orderBy: { issueDate: 'desc' } });

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
    const { subtotal, taxTotal, total } = computeTotals(dto.lines);
    const { currency, exchangeRate } = resolveCurrency(dto);
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextInvoiceNumber's comment.
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      const no = await this.nextInvoiceNumber(tx);
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
    }));
  }

  update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.invoice_not_found);

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
      await tx.invoice.delete({ where: { id } });
      // Deleting the invoice first removes the only row referencing the
      // entry, so it can now be reversed and deleted without hitting the
      // Restrict FK.
      await unpostIfLinked(tx, existing.journalEntryId);
    });
  }

  /** `INV-<year>-<seq>`, matching the original mockup's numbering. Based on
   * the highest existing sequence for the year, not `count()` — a
   * count-based scheme collides with an already-issued number as soon as any
   * invoice has ever been deleted (count() drops but the old high number is
   * still taken). Two concurrent creates can still compute the same next
   * number; `@@unique([companyId, no])` turns that into a P2002 instead of a
   * silent duplicate, and `create()` retries the whole transaction on that
   * error (see retryOnUniqueConflict). */
  private async nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const rows = await tx.invoice.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
    const maxSeq = rows.reduce((max, r) => {
      const n = parseInt(r.no.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }
}
