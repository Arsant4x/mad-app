import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Prisma } from '@mad-app/db';
import { resolveCurrencyWithin, toBaseAmount } from '../common/currency/base-amount.util';
import { type KeyedRequest, onceForRequest, recordKeyedRequest } from '../common/idempotency/idempotency';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { TransferBankDto } from './dto/transfer-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { money } from '../common/money/text';
import { mirrorBankMovement, postDrawerTransferEntries } from '../journal/auto-posting.util';
import { CASH_IN_TRANSIT_CODE, CASH_IN_TRANSIT_NAME, getOrCreateAccountByCode, postShiftVarianceEntry } from '../journal/pos-settlement.util';
import { readLedger } from '../reports/ledger.util';
import { postOpeningDeltaEntry, redeclareOpeningDate } from '../journal/opening-balance.util';
import { BANK_BANDS, bandGroup, bandStatus, nextCodeInBands } from '../accounts/code-bands';
import { round2 } from '../common/money/rounding';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسمُ والآيبان. */
const BANK_SEARCH_FIELDS = ['name', 'iban'] as const;

/**
 * الرمزُ التالي لحساب بنك — **`MAX+1` من المصدر لا `count()`** (`ق-١٩٨`): يقرأ
 * رموزَ حسابات المنشأة ويأخذ أكبرَ ما يقع في النطاق، **فالفجوةُ لا تُعاد
 * تعبئتُها**، وحسابٌ يدويٌّ داخل النطاق يدفع التاليَ فوقه.
 *
 * ⚠️ **والنطاقاتُ صارت اثنين** (`ق-٢٩٥`): `1100–1199` ثم `1601–1999` — يُملأ
 * الأول ثم يُنتقل إلى الثاني، **فالرموزُ القديمة تبقى متجاورةً كما كانت**.
 * وتعريفُهما وسقفُهما وإنذارُهما في `accounts/code-bands.ts` — **موضعٌ واحد**،
 * فنطاقٌ يُضاف غداً يرث الإنذار بلا سطرٍ يُكتب هنا.
 */
export async function nextBankCode(tx: Prisma.TransactionClient): Promise<string> {
  const accounts = await tx.account.findMany({ select: { code: true } });
  const next = nextCodeInBands(accounts.map((a) => a.code), BANK_BANDS);
  if (next === null) throw new ConflictException(MSG.bank_code_range_full);
  return String(next);
}

@Injectable()
export class BanksService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * 🔴 **الصفُّ بفروع الفاعل — لا بمعرّفه وحدَه** (`ق-١٤١١`): كان التعديلُ والأرشفةُ والحذفُ تقرأ `findUnique({ id })`
   * **فموظّفٌ مقيَّدٌ بفرعٍ عدّل صندوقَ فرعٍ آخر ورصيدَه الافتتاحيّ** (والرصيدُ يرحّل قيداً — `postOpeningDeltaEntry`).
   * ⟸ خارجُ الفروع **غيرُ موجودٍ له** (`404` كالقائمة، فلا يُسرَّب وجودُه)، **وما هو للمنشأة كلِّها** (`branchId: null`)
   * مرئيٌّ للجميع كما في القراءة (`branchFilter`).
   */
  private async findVisible(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', id: string) {
    const existing = await tx.bank.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
    if (!existing) throw new NotFoundException(MSG.bank_not_found);
    return existing;
  }

  /**
   * ⚖️ **نقلُ صفّ البنك بين الفروع — بنوعه المعلَن** (`ق-١٤٣١` · التوجيه ٢٦٤ §٢ · مبادئ `ق-١٤١٣` · `ق-١٤١٤`):
   * - **«غيرُ المعلَن»** لا يُنقل حتى يُعلَن — بنصّ المالك: «ولا يُنقل حتى يُعلَن، كتصنيف العقود».
   * - **الحسابُ البنكيّ** — **للقادم وحدَه**: يتغيّر فرعُه ولا يُمسّ قيدٌ مرحَّل ولا تسوية (`ق-١٤٣٦`)، ولا عدَّ ولا تاريخ.
   * - **الصندوقُ النقديّ** — **إغلاقٌ وفتح** كالدرج: يُعدّ بتاريخه (ولا قيدَ على حسابه بعده — فالعدُّ عدٌّ لكلِّ ما في الدفتر)،
   *   والفرقُ على `5900` بفرع القديم، والمعدودُ يخرج بقيدٍ بفرع القديم ويدخل خلفَه بقيدٍ بفرع الهدف عبر `1190` (`ق-١٤٣٣`)،
   *   والمرآتان تتبعان القيودَ (`ق-٢٨٢`)، والقديمُ يُؤرشف برابط خلفه، **وتاريخُه لا ينتقل**.
   * **والفاعلُ المالكُ وحدَه** (`ق-١٤٣٢`). ⚠️ **وحدٌّ معلَن**: الصندوقُ بعملةٍ غير عملة المنشأة لا يُنقل بعد — الدفترُ بعملة
   * الأساس والعدُّ بعملته، ونقلُه يحتاج سعرَ يومٍ وفرقَ صرفٍ لم يُبنيا (كتسوية الشبكة).
   *
   * **على مستوى المنشأة بحقّها**: النقلُ فعلُ مالكٍ نطاقُه الكلّ — والقراءاتُ على هذا الصفّ بعينه وحسابِه لا على قائمة.
   */
  async transfer(companyId: string, actorType: string, id: string, dto: TransferBankDto) {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.bank_transfer_forbidden);

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
          const bank = await this.findVisible(tx, 'all', id);
          if (bank.kind === 'LEGACY_UNDECLARED') throw new ConflictException(formatMessage(MSG.bank_transfer_undeclared, { name: bank.name }));
          if (bank.archived) throw new ConflictException(formatMessage(MSG.bank_transfer_archived, { name: bank.name }));

          const toBranchId = await resolveBranchId(tx, dto.toBranchId, 'all');
          if (toBranchId === (bank.branchId ?? null)) throw new BadRequestException(MSG.bank_transfer_same_branch);

          if (bank.kind === 'BANK_ACCOUNT') {
            // للقادم وحدَه — لا عدَّ ولا تاريخ ولا خلف: من يرسلها يظنّه صندوقاً، فيُسمّى الفرقُ لا يُتجاهل.
            if (dto.countedAmount !== undefined || dto.date !== undefined || dto.name !== undefined) {
              throw new BadRequestException(MSG.bank_transfer_account_no_count);
            }
            const moved = await tx.bank.update({ where: { id }, data: { branchId: toBranchId } });
            return { kind: 'BANK_ACCOUNT' as const, fromBranchId: bank.branchId, toBranchId, bank: moved };
          }

          if (dto.countedAmount === undefined || !dto.date) throw new BadRequestException(MSG.bank_transfer_count_required);
          const company = await tx.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });
          if (company && bank.currency !== company.baseCurrency) {
            throw new ConflictException(formatMessage(MSG.bank_transfer_foreign_currency, { name: bank.name, currency: bank.currency }));
          }

          const date = new Date(dto.date);
          const later = await tx.journalLine.findFirst({ where: { accountId: bank.accountId, journalEntry: { date: { gt: date } } }, select: { id: true } });
          if (later) throw new ConflictException(formatMessage(MSG.bank_transfer_later_postings, { date: dto.date.slice(0, 10) }));

          const book = round2(Number((await readLedger(tx, { allowedBranchIds: 'all', accountId: bank.accountId, to: date }, 'debit')).closing));
          const counted = round2(dto.countedAmount);
          const variance = round2(counted - book);

          // الخلفُ أوّلاً — فحسابُه يستقبل قيدَ الدخول.
          const name = dto.name?.trim() || bank.name;
          const code = await nextBankCode(tx);
          const account = await tx.account.create({ data: { code, name: `حساب ${name}`, type: 'asset' } as unknown as Prisma.AccountUncheckedCreateInput });
          const successor = await tx.bank.create({
            data: {
              name,
              kind: 'CASH_BOX',
              branchId: toBranchId,
              accountId: account.id,
              openingBalance: 0,
              balance: 0,
              openingDate: date,
              currency: bank.currency,
              exchangeRate: 1,
              baseOpeningBalance: 0,
              baseBalance: 0,
            } as unknown as Prisma.BankUncheckedCreateInput,
          });

          const branchName = async (branchId: string | null) =>
            branchId ? ((await tx.branch.findUnique({ where: { id: branchId }, select: { name: true } }))?.name ?? '') : 'المنشأة';
          const fromBranch = await branchName(bank.branchId);
          const toBranch = await branchName(toBranchId);
          const varianceMemo = `${variance > 0 ? 'زيادة' : 'عجز'} عدّ صندوق عند نقله — ${bank.name} (${fromBranch} ⟵ ${toBranch})`;
          const varianceEntry = await postShiftVarianceEntry(tx, companyId, { memo: varianceMemo, date, branchId: bank.branchId, drawerAccountId: bank.accountId, variance });
          if (varianceEntry) {
            await mirrorBankMovement(tx, bank, { date, description: varianceMemo, amount: variance, source: 'transfer', currency: bank.currency, exchangeRate: 1, entryNo: varianceEntry.no, branchId: bank.branchId });
          }

          const transit = await getOrCreateAccountByCode(tx, companyId, CASH_IN_TRANSIT_CODE, CASH_IN_TRANSIT_NAME, 'asset');
          const memoOut = `نقل صندوق — ${bank.name}: خروجٌ من ${fromBranch} إلى ${toBranch}`;
          const memoIn = `نقل صندوق — ${name}: دخولٌ في ${toBranch} من ${fromBranch}`;
          const moved =
            counted > 0
              ? await postDrawerTransferEntries(tx, companyId, {
                  date,
                  amount: counted,
                  memoOut,
                  memoIn,
                  fromBranchId: bank.branchId,
                  toBranchId,
                  fromAccountId: bank.accountId,
                  toAccountId: account.id,
                  transitAccountId: transit.id,
                })
              : null;
          if (moved) {
            await mirrorBankMovement(tx, bank, { date, description: memoOut, amount: -counted, source: 'transfer', currency: bank.currency, exchangeRate: 1, entryNo: moved.out.no, branchId: bank.branchId });
            await mirrorBankMovement(tx, successor, { date, description: memoIn, amount: counted, source: 'transfer', currency: bank.currency, exchangeRate: 1, entryNo: moved.in.no, branchId: toBranchId });
          }

          await tx.bank.update({ where: { id }, data: { archived: true, transferredToId: successor.id } });

          return {
            kind: 'CASH_BOX' as const,
            from: await tx.bank.findUniqueOrThrow({ where: { id } }),
            to: await tx.bank.findUniqueOrThrow({ where: { id: successor.id } }),
            bookBalance: money(book),
            countedAmount: money(counted),
            variance: money(variance),
            entries: { variance: varianceEntry?.no ?? null, out: moved?.out.no ?? null, in: moved?.in.no ?? null },
          };
        });
      } catch (e) {
        // `P2002` سباقٌ على رمز الحساب — يُعاد بقراءةٍ جديدة (نمطُ الإنشاء والدرج).
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }
  }

  /** حالةُ نطاق رموز البنوك — تُقرأ من الدليل لحظةَ السؤال (`ق-٢٩٥`). */
  codeBand(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const accounts = await tx.account.findMany({ select: { code: true } });
      return bandStatus(accounts.map((a) => a.code), bandGroup('bank'));
    });
  }

  list(companyId: string, allowedBranchIds: string[] | 'all', includeArchived = false, query?: PagedQueryDto) {
    // مرشِّحُ الفرع وشرطُ البحث كلاهما `OR`، فيُجمعان تحت `AND` كما يقول تعليقُ `searchWhere` (توجيه ٢٧٤ · ج-2).
    const where: Prisma.BankWhereInput = { ...(includeArchived ? {} : { archived: false }), AND: [branchFilter(allowedBranchIds), searchWhere(searchTerm(query), BANK_SEARCH_FIELDS) ?? {}] };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => pagedFindMany(query, tx.bank, { where, orderBy: { name: 'asc' } }));
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
  async create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateBankDto, request?: KeyedRequest) {
    return onceForRequest(this.tenantPrisma, companyId, request, (tx, id) => tx.bank.findUnique({ where: { id } }), () => this.createOnce(companyId, allowedBranchIds, dto, request));
  }

  private async createOnce(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateBankDto, request?: KeyedRequest) {
    const openingBalance = dto.openingBalance ?? 0;

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.tenantPrisma.runInTenantContext(companyId, (tx) => recordKeyedRequest(tx, companyId, request, async () => {
          // بلا عملةٍ صريحة ⟵ عملةُ أساس المنشأة لا الريال (`ق-١٣٦٨`).
          const { currency, exchangeRate } = await resolveCurrencyWithin(tx, companyId, dto);
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
              // ق-١٤٣١ — النوعُ معلَنٌ في الطلب (الـDTO يُلزمه) — لا يُستنبط من الفرع ولا من الآيبان.
              kind: dto.kind,
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
            // ⭐ **تاريخُ فتح البنك يصل الأستاذ أخيراً** (ق-٢٩٦): كان يُخزَّن
            // ويُهمَل، والقيدُ يُؤرَّخ باشتقاق — **والمقيس: ١٢ من ١٢ حساب بنكٍ
            // تاريخُ قيده يخالف تاريخَ فتحه المعلَن** (سبتمبر مقابل يناير).
            await postOpeningDeltaEntry(tx, {
              companyId,
              account,
              delta: openingBalance,
              declaredDate: new Date(dto.openingDate),
              memo: `الرصيد الافتتاحي — ${dto.name} (${code})`,
            });
            await tx.account.update({ where: { id: account.id }, data: { openingBalance } });
          }
          return bank;
        }));
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }
  }

  update(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: UpdateBankDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await this.findVisible(tx, allowedBranchIds, id);

      const data: Prisma.BankUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      // إعلانُ «غيرِ المعلَن» أو تصحيحُ النوع — صريحٌ بيد صاحب الشاشة ويُسجَّل في التدقيق (ق-١٤٣١).
      if (dto.kind !== undefined) data.kind = dto.kind;
      if (dto.iban !== undefined) data.iban = dto.iban || null;

      // ⭐ تاريخُ الفتح صار إعلاناً يصل الأستاذ (ق-٢٩٦): تغييرُه يُعيد ترحيلَ
      // القيد الافتتاحيّ **بالمسار الواحد** — بوّابةُ السكون فيه لا هنا.
      const newOpeningDate = dto.openingDate === undefined ? null : new Date(dto.openingDate);
      const dateChanged =
        newOpeningDate !== null && newOpeningDate.toISOString().slice(0, 10) !== existing.openingDate.toISOString().slice(0, 10);
      if (dto.openingDate !== undefined) data.openingDate = newOpeningDate!;

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

      const updated = await tx.bank.update({ where: { id }, data });

      if (dateChanged) {
        const account = await tx.account.findUniqueOrThrow({ where: { id: existing.accountId } });
        await redeclareOpeningDate(tx, {
          companyId,
          account,
          openingBalance: Number(updated.openingBalance),
          declaredDate: newOpeningDate!,
        });
      }
      return updated;
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, allowedBranchIds: string[] | 'all', id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.findVisible(tx, allowedBranchIds, id);
      return tx.bank.update({ where: { id }, data: { archived } });
    });
  }

  async remove(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.findVisible(tx, allowedBranchIds, id);
      await tx.bank.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
