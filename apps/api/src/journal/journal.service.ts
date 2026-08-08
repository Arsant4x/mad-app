import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { ListJournalQueryDto } from './dto/list-journal-query.dto';
import { resolveBranchId } from '../branches/branch-scope.util';
import { createJournalEntry, reverseAndDeleteJournalEntry } from './journal-posting.util';
import { MSG } from '../common/i18n/messages';

const JOURNAL_ENTRY_INCLUDE = { lines: { include: { account: true } } } as const;

@Injectable()
export class JournalService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', query: ListJournalQueryDto = {}) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 25;
      const q = query.search?.trim();
      // The search OR is wrapped in AND because branchFilter may itself be an
      // OR (allowed branches ∪ company-wide rows) — a bare spread of two ORs
      // would let the search clause clobber the branch restriction.
      const searchWhere: Prisma.JournalEntryWhereInput = q
        ? {
            AND: [
              {
                OR: [
                  { memo: { contains: q, mode: 'insensitive' } },
                  { no: { contains: q, mode: 'insensitive' } },
                  { lines: { some: { account: { code: { contains: q, mode: 'insensitive' } } } } },
                ],
              },
            ],
          }
        : {};
      const where: Prisma.JournalEntryWhereInput = { ...branchFilter(allowedBranchIds), ...searchWhere };

      // Sequential on purpose: an interactive transaction runs on a single
      // connection, so concurrent queries on `tx` would only race for it.
      const total = await tx.journalEntry.count({ where });
      const items = await tx.journalEntry.findMany({
        where,
        include: JOURNAL_ENTRY_INCLUDE,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return { items, total, page, pageSize };
    });
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateJournalEntryDto) {
    // Retries the whole transaction on a "no" collision from a concurrent
    // manual entry — same reasoning as InvoicesService.create.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) =>
        createJournalEntry(tx, {
          companyId,
          // كل مستند مالي يحمل فرعه (احتياجات §2) — كان يُقبل ثم يُسقط صمتاً.
          branchId: await resolveBranchId(tx, dto.branchId, allowedBranchIds),
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
