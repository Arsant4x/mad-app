import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { createJournalEntry, reverseAndDeleteJournalEntry } from './journal-posting.util';
import { MSG } from '../common/i18n/messages';

const JOURNAL_ENTRY_INCLUDE = { lines: { include: { account: true } } } as const;

@Injectable()
export class JournalService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findMany({ where: branchFilter(allowedBranchIds), include: JOURNAL_ENTRY_INCLUDE, orderBy: { date: 'desc' } }),
    );
  }

  create(companyId: string, dto: CreateJournalEntryDto) {
    // Retries the whole transaction on a "no" collision from a concurrent
    // manual entry — same reasoning as InvoicesService.create.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        createJournalEntry(tx, {
          companyId,
          date: new Date(dto.date),
          memo: dto.memo,
          auto: false,
          lines: dto.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })),
        }),
      ),
    );
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.journalEntry.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.journal_entry_not_found);
      if (existing.auto) {
        // Auto-posted entries (from invoices/purchases) are deleted by
        // deleting the source document, not directly — matches the mockup,
        // which never exposes a manual delete button for auto entries.
        throw new ConflictException(MSG.journal_auto_entry_undeletable);
      }
      await reverseAndDeleteJournalEntry(tx, id);
    });
  }
}
