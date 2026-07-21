import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postInvoiceEntry, unpostIfLinked } from '../journal/auto-posting.util';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

const INVOICE_INCLUDE = { customer: true, lines: true } as const;

/** Always derive totals from the lines server-side — a client-submitted
 * total is never trusted (a client could otherwise bill an arbitrary amount). */
function computeTotals(lines: InvoiceLineDto[]) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const taxTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice * (l.taxRate / 100), 0);
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findMany({ include: INVOICE_INCLUDE, orderBy: { issueDate: 'desc' } }),
    );
  }

  create(companyId: string, dto: CreateInvoiceDto) {
    const { subtotal, taxTotal, total } = computeTotals(dto.lines);
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextInvoiceNumber's comment.
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
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
          customerId: dto.customerId,
          issueDate: new Date(dto.issueDate),
          dueDate: new Date(dto.dueDate),
          notes: dto.notes,
          subtotal,
          taxTotal,
          total,
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
        no: created.no,
        issueDate: created.issueDate,
        customerName: created.customer.name,
        subtotal: Number(created.subtotal),
        taxTotal: Number(created.taxTotal),
        total: Number(created.total),
      });
      if (!entry) return created;
      return tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
    }));
  }

  update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الفاتورة غير موجودة');

      const data: Prisma.InvoiceUncheckedUpdateInput = {};
      if (dto.customerId) data.customerId = dto.customerId;
      if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
      if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.status) data.status = dto.status;

      if (dto.lines) {
        const totals = computeTotals(dto.lines);
        data.subtotal = totals.subtotal;
        data.taxTotal = totals.taxTotal;
        data.total = totals.total;
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
        no: updated.no,
        issueDate: updated.issueDate,
        customerName: updated.customer.name,
        subtotal: Number(updated.subtotal),
        taxTotal: Number(updated.taxTotal),
        total: Number(updated.total),
      });
      if (!entry) return updated;
      return tx.invoice.update({ where: { id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الفاتورة غير موجودة');
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
