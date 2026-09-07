import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { MSG } from '../common/i18n/messages';
import { postOpeningDeltaEntry } from '../journal/opening-balance.util';
import { round2 } from '../common/money/rounding';

/** نطاقُ رموز حسابات البنوك (`ق-٢٥٣`) — متجاورٌ لا متداخل مع `1000` (`ق-٢٧٥`). */
export const BANK_CODE_MIN = 1100;
export const BANK_CODE_MAX = 1199;

/**
 * الرمزُ التالي لحساب بنك — **`MAX+1` من المصدر لا `count()`** (`ق-١٩٨`): يقرأ
 * رموزَ حسابات المنشأة ويأخذ أكبرَ ما يقع في النطاق، **فالفجوةُ لا تُعاد
 * تعبئتُها**، وحسابٌ يدويٌّ داخل النطاق يدفع التاليَ فوقه.
 */
export async function nextBankCode(tx: Prisma.TransactionClient): Promise<string> {
  const accounts = await tx.account.findMany({ select: { code: true } });
  const inRange = accounts
    .map((a) => Number(a.code))
    .filter((n) => Number.isInteger(n) && n >= BANK_CODE_MIN && n <= BANK_CODE_MAX);
  const next = (inRange.length ? Math.max(...inRange) : BANK_CODE_MIN - 1) + 1;
  if (next > BANK_CODE_MAX) throw new ConflictException(MSG.bank_code_range_full);
  return String(next);
}

@Injectable()
export class BanksService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', includeArchived = false) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.bank.findMany({ where: { ...branchFilter(allowedBranchIds), ...(includeArchived ? {} : { archived: false }) }, orderBy: { name: 'asc' } }));
  }

  /**
   * إنشاءُ بنكٍ **يُنشئ حسابَه في الدليل معه** (`ق-٢٧٧`) — فبنكٌ بلا حساب يعني
   * نقداً خارج الأستاذ، وهو العطلُ الذي تُغلقه هذه الدفعة (`SPEC 7.6`).
   *
   * والرصيدُ الافتتاحيُّ **يُرحَّل قيداً مقابل `3900`** بالمسار المبنيّ نفسه
   * (`postOpeningDeltaEntry`) — لا مسارَ ثانٍ للافتتاحي، ولا رصيدٌ يُبذَر في
   * العمود بلا قيدٍ يسنده (نمطُ الدَّين 3.8 الذي أُغلق للحسابات).
   *
   * ⚠️ وإعادةُ المحاولة تلفّ المعاملة لا تقع داخلها: `P2002` على `(companyId, code)`
   * تُجهض المعاملة، فتُعاد كاملةً بقراءةٍ جديدة (نمطُ الدرج و`nextIcv`).
   */
  async create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateBankDto) {
    const openingBalance = dto.openingBalance ?? 0;
    const { currency, exchangeRate } = resolveCurrency(dto);

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
          const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
          const code = await nextBankCode(tx);
          const account = await tx.account.create({
            data: { code, name: `حساب ${dto.name}`, type: 'asset' } as unknown as Prisma.AccountUncheckedCreateInput,
          });

          const bank = await tx.bank.create({
            // companyId omitted on purpose — injected at runtime by the tenant
            // scope extension (see accounts.service.ts for why this cast exists).
            data: {
              name: dto.name,
              branchId,
              accountId: account.id,
              iban: dto.iban || null,
              openingBalance,
              balance: openingBalance,
              openingDate: new Date(dto.openingDate),
              currency,
              exchangeRate,
              baseOpeningBalance: toBaseAmount(openingBalance, exchangeRate),
              baseBalance: toBaseAmount(openingBalance, exchangeRate),
            } as unknown as Prisma.BankCreateInput,
          });

          if (openingBalance !== 0) {
            await postOpeningDeltaEntry(tx, {
              companyId,
              account,
              delta: openingBalance,
              memo: `الرصيد الافتتاحي — ${dto.name} (${code})`,
            });
            await tx.account.update({ where: { id: account.id }, data: { openingBalance } });
          }
          return bank;
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }
  }

  update(companyId: string, id: string, dto: UpdateBankDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_not_found);

      const data: Prisma.BankUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.iban !== undefined) data.iban = dto.iban || null;
      if (dto.openingDate !== undefined) data.openingDate = new Date(dto.openingDate);

      if (dto.openingBalance !== undefined) {
        /**
         * ⚠️ (ق-٢٧٧ · ق-٢٨٢) **التعديلُ قيدُ فرقٍ لا إزاحةُ عمود.**
         *
         * كان هذا الموضعُ يزيح `balance` بالفارق «حفظاً للانحراف» — **ورقمٌ
         * يتحرك بلا قيدٍ يسنده هو العطلُ نفسه**. فصار الفرقُ يُرحَّل مقابل
         * `3900` **بالمسار المبنيّ للحسابات** (`postOpeningDeltaEntry`): لا
         * مسارَ ثانٍ، ولا تاريخٌ يُكتب فوق تاريخ — **القيدُ الأصلي يبقى ويُضاف
         * إليه فرق**. والمرآةُ تتبع القيد.
         */
        const delta = round2(dto.openingBalance - Number(existing.openingBalance));
        const rate = Number(existing.exchangeRate);
        data.openingBalance = dto.openingBalance;
        data.baseOpeningBalance = toBaseAmount(dto.openingBalance, rate);

        if (delta !== 0) {
          const account = await tx.account.findUniqueOrThrow({ where: { id: existing.accountId } });
          await postOpeningDeltaEntry(tx, {
            companyId,
            account,
            delta,
            memo: `تعديل الرصيد الافتتاحي — ${existing.name} (${account.code})`,
          });
          await tx.account.update({ where: { id: account.id }, data: { openingBalance: dto.openingBalance } });
          data.balance = Number(existing.balance) + delta;
          data.baseBalance = toBaseAmount(Number(existing.balance) + delta, rate);
        }
      }

      return tx.bank.update({ where: { id }, data });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_not_found);
      return tx.bank.update({ where: { id }, data: { archived } });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.bank.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.bank_not_found);
      await tx.bank.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
