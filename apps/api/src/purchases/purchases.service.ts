import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postPurchaseEntry, unpostIfLinked } from '../journal/auto-posting.util';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

const PURCHASE_INCLUDE = { supplier: true } as const;
const VAT_RATE = 0.15;

/** Always derive tax/total server-side from subtotal + exempt — never trust
 * a client-submitted amount (same reasoning as invoices). */
function computeTax(subtotal: number, exempt: boolean) {
  const tax = exempt ? 0 : subtotal * VAT_RATE;
  return { tax, total: subtotal + tax };
}

@Injectable()
export class PurchasesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.purchase.findMany({ include: PURCHASE_INCLUDE, orderBy: { date: 'desc' } }),
    );
  }

  create(companyId: string, dto: CreatePurchaseDto) {
    const exempt = dto.exempt ?? false;
    const { tax, total } = computeTax(dto.subtotal, exempt);
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextPurchaseNumber's comment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const no = await this.nextPurchaseNumber(tx);
        const created = await tx.purchase.create({
          data: {
            companyId,
            no,
            supplierId: dto.supplierId,
            date: new Date(dto.date),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            category: dto.category,
            subtotal: dto.subtotal,
            taxAmount: tax,
            exempt,
            total,
          } as unknown as Prisma.PurchaseUncheckedCreateInput,
          include: PURCHASE_INCLUDE,
        });

        // Auto-post to the ledger; soft-skip (journalEntryId stays null) if
        // the required accounts (expense category/2100/2200) aren't set up
        // for this company yet.
        const entry = await postPurchaseEntry(tx, companyId, {
          no: created.no,
          date: created.date,
          supplierName: created.supplier.name,
          category: created.category,
          subtotal: Number(created.subtotal),
          taxAmount: Number(created.taxAmount),
          total: Number(created.total),
        });
        if (!entry) return created;
        return tx.purchase.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: PURCHASE_INCLUDE });
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdatePurchaseDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('فاتورة الشراء غير موجودة');

      const data: Prisma.PurchaseUncheckedUpdateInput = {};
      if (dto.supplierId !== undefined) data.supplierId = dto.supplierId;
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
      if (dto.category !== undefined) data.category = dto.category;

      if (dto.subtotal !== undefined || dto.exempt !== undefined) {
        const subtotal = dto.subtotal ?? Number(existing.subtotal);
        const exempt = dto.exempt ?? existing.exempt;
        const { tax, total } = computeTax(subtotal, exempt);
        data.subtotal = subtotal;
        data.exempt = exempt;
        data.taxAmount = tax;
        data.total = total;
      }

      if (dto.paid !== undefined) {
        data.paid = dto.paid;
        data.paidDate = dto.paid ? new Date(dto.paidDate ?? new Date().toISOString().slice(0, 10)) : null;
      }

      // Anything that changes who/what/how-much gets reversed and re-posted
      // fresh rather than patched in place — same reasoning as InvoicesService.
      const affectsPosting =
        dto.supplierId !== undefined ||
        dto.date !== undefined ||
        dto.category !== undefined ||
        dto.subtotal !== undefined ||
        dto.exempt !== undefined;
      if (affectsPosting && existing.journalEntryId) {
        data.journalEntryId = null;
      }

      const updated = await tx.purchase.update({ where: { id }, data, include: PURCHASE_INCLUDE });
      if (!affectsPosting) return updated;

      if (existing.journalEntryId) await unpostIfLinked(tx, existing.journalEntryId);
      const entry = await postPurchaseEntry(tx, companyId, {
        no: updated.no,
        date: updated.date,
        supplierName: updated.supplier.name,
        category: updated.category,
        subtotal: Number(updated.subtotal),
        taxAmount: Number(updated.taxAmount),
        total: Number(updated.total),
      });
      if (!entry) return updated;
      return tx.purchase.update({ where: { id }, data: { journalEntryId: entry.id }, include: PURCHASE_INCLUDE });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('فاتورة الشراء غير موجودة');
      await tx.purchase.delete({ where: { id } });
      await unpostIfLinked(tx, existing.journalEntryId);
    });
  }

  /** `PUR-<seq>`, matching the original mockup's numbering. Based on the
   * highest existing sequence, not `count()` — see InvoicesService's
   * equivalent comment for why count() breaks once any purchase is deleted. */
  private async nextPurchaseNumber(tx: Prisma.TransactionClient): Promise<string> {
    const prefix = 'PUR-';
    const rows = await tx.purchase.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
    const maxSeq = rows.reduce((max, r) => {
      const n = parseInt(r.no.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }
}
