import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';
import { CreateCurrencyDto } from './dto/create-currency.dto';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`). */
const CURRENCY_SEARCH_FIELDS = ['code', 'name', 'symbol'] as const;
const RATE_SEARCH_FIELDS = ['fromCode', 'toCode'] as const;
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { UpsertExchangeRateDto } from './dto/upsert-exchange-rate.dto';

/** Which currencies the company trades in, and at what rate, is an owner-level
 * decision — a rate edit silently changes what every new document is worth. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.branch_forbidden);
  }
}

@Injectable()
export class CurrenciesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Readable by any tenant actor — this is the list behind the currency picker
   * on the invoice and purchase forms. */
  list(companyId: string, query?: PagedQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      // Base first, then alphabetical: the base is the one a single-currency
      // company ever sees.
      pagedFindMany(query, tx.currency, { where: { ...searchWhere(searchTerm(query), CURRENCY_SEARCH_FIELDS) }, orderBy: [{ isBase: 'desc' }, { code: 'asc' }] }),
    );
  }

  create(companyId: string, actorType: string, dto: CreateCurrencyDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const code = dto.code.trim().toUpperCase();

      try {
        return await tx.currency.create({
          data: {
            code,
            name: dto.name.trim(),
            symbol: dto.symbol?.trim() || null,
            rate: dto.rate ?? 1,
            // A company has exactly one base currency, set when it is created.
            // Adding a currency never changes it.
            isBase: false,
          } as unknown as Prisma.CurrencyUncheckedCreateInput,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.currency_code_taken, { code }));
        }
        throw e;
      }
    });
  }

  update(companyId: string, actorType: string, id: string, dto: UpdateCurrencyDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.currency.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.currency_not_found);

      const data: Prisma.CurrencyUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.symbol !== undefined) data.symbol = dto.symbol.trim() || null;
      if (dto.rate !== undefined) {
        // The base currency is the unit everything else is measured in, so its
        // rate is 1 by definition — allowing 1.05 SAR per SAR would quietly
        // reprice the entire ledger.
        if (existing.isBase) throw new BadRequestException(MSG.currency_base_immutable);
        data.rate = dto.rate;
      }

      return tx.currency.update({ where: { id }, data });
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: حذفُ العملة يُمنع بأيّ مستندٍ يحملها في
   * المنشأة كلِّها — فعملةٌ يستعملها فرعٌ محجوبٌ عن القارئ ليست حرّةً لأنه لا
   * يراه.
   */
  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.currency.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.currency_not_found);
      if (existing.isBase) throw new ConflictException(MSG.currency_base_undeletable);

      // Documents store the *code*, not a foreign key, so nothing at the
      // database level would stop this — an invoice would just end up
      // referring to a currency the company no longer defines.
      const where = { currency: existing.code };
      const [invoices, purchases, entries, transactions, contracts] = await Promise.all([
        tx.invoice.count({ where }),
        tx.purchase.count({ where }),
        tx.journalEntry.count({ where }),
        tx.bankTransaction.count({ where }),
        tx.contract.count({ where }),
      ]);
      if (invoices + purchases + entries + transactions + contracts > 0) {
        throw new ConflictException(MSG.currency_in_use);
      }

      await tx.currency.delete({ where: { id } });
    });
  }

  /** Most recent first — the rate history screen reads top-down, and callers
   * pricing a document want the latest applicable row. */
  listRates(companyId: string, fromCode?: string, toCode?: string, query?: PagedQueryDto) {
    const where: Prisma.ExchangeRateWhereInput = {
      ...(fromCode ? { fromCode: fromCode.toUpperCase() } : {}),
      ...(toCode ? { toCode: toCode.toUpperCase() } : {}),
      ...searchWhere(searchTerm(query), RATE_SEARCH_FIELDS),
    };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      // بلا ترقيمٍ يبقى السقفُ القديم `200` كما كان (عقدٌ قائم)؛ ومع `page` النافذةُ هي السقف.
      pagedFindMany(query, tx.exchangeRate, { where, orderBy: [{ date: 'desc' }, { fromCode: 'asc' }], ...(query?.page ? {} : { take: 200 }) }),
    );
  }

  /**
   * Records the rate for one day. Re-recording the same day overwrites rather
   * than adding a second row: a day has one official rate, and the unique
   * constraint on (company, from, to, date) says so.
   */
  upsertRate(companyId: string, actorType: string, dto: UpsertExchangeRateDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const fromCode = dto.fromCode.trim().toUpperCase();
      const toCode = dto.toCode.trim().toUpperCase();
      if (fromCode === toCode) throw new BadRequestException(MSG.exchange_rate_same_currency);

      // Stored as a date, not a timestamp — the column is @db.Date, and a rate
      // belongs to a day rather than a moment.
      const date = new Date(`${dto.date.slice(0, 10)}T00:00:00.000Z`);

      const existing = await tx.exchangeRate.findFirst({ where: { fromCode, toCode, date } });
      if (existing) {
        return tx.exchangeRate.update({ where: { id: existing.id }, data: { rate: dto.rate } });
      }

      return tx.exchangeRate.create({
        data: { fromCode, toCode, rate: dto.rate, date } as unknown as Prisma.ExchangeRateUncheckedCreateInput,
      });
    });
  }
}
