import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pageArray } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الرمزُ والاسم. */
const ACCOUNT_SEARCH_FIELDS = ['code', 'name'] as const;
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { assertPeriodOpen } from '../fiscal/period-lock.util';
import { reverseAndDeleteJournalEntry } from '../journal/journal-posting.util';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { OPENING_EQUITY_CODE, postOpeningDeltaEntry, redeclareOpeningDate } from '../journal/opening-balance.util';
import { INVENTORY_ACCOUNT_CODE } from '../journal/inventory-accounts.util';
import { SYSTEM_ACCOUNT_CODES } from '../fiscal/year-closing.util';

/** مقارنةُ يومٍ بيوم — `@db.Date` بلا لحظة، و`null` لا يساوي تاريخاً. */
function sameDay(a: Date, b: Date | null): boolean {
  return b !== null && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Reference implementation for every future tenant-scoped module: all data
 * access goes through `tenantPrisma.runInTenantContext`, never through the
 * raw PrismaService. The service itself never has to filter by companyId —
 * that's handled centrally (see tenant-scope.extension.ts + rls.sql).
 *
 * Opening balances are *posted*, not seeded: a non-zero opening balance
 * becomes a real قيد افتتاحي against 3900 (see opening-balance.util.ts), so
 * `balance` and every report read it from the ledger. That's why create and
 * update are wrapped in retryOnUniqueConflict — they now allocate journal
 * numbers, with the same concurrent-numbering race as any posting service.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * القائمة — **وتاريخُ الافتتاح يُشتقّ حين لم يُعلَن** (`ق-٢٩٦`).
   *
   * `openingDate` فارغةٌ تعني «لم يعلنها التاجر»، **فتُقرأ من تاريخ القيد
   * الافتتاحيّ نفسه**: العرضُ صادقٌ من أول يوم **بلا كتابة صفٍّ واحد**،
   * ويبقى في الصفّ ما يميّز المُعلَن من المشتقّ (`openingDateDeclared`).
   *
   * **على مستوى المنشأة بحقّها**: تاريخُ افتتاح الحساب صفةٌ للحساب في دليلٍ
   * واحد للمنشأة — والقيدُ الافتتاحيّ يُقرأ ليُشتقّ منه التاريخُ لا لتُعرض
   * قيمتُه، فلا معنى لفرعٍ فيه.
   */
  list(companyId: string, query?: PagedQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الرمزُ فريدٌ داخل المنشأة، و`id` ختماً للترتيب التامّ الذي يوجبه القطعُ في الذاكرة (`ق-٣٥٦`).
      const accounts = await tx.account.findMany({ orderBy: [{ code: 'asc' }, { id: 'asc' }] });
      const openings = await tx.journalEntry.findMany({
        where: { openingForAccountId: { in: accounts.map((a) => a.id) } },
        orderBy: { date: 'asc' },
        select: { date: true, openingForAccountId: true },
      });
      // أوّلُ افتتاحيٍّ لكل حساب — والترتيبُ تصاعديّ، فأوّلُ ما يُسجَّل هو الأقدم.
      const firstOpening = new Map<string, Date>();
      for (const e of openings) if (e.openingForAccountId && !firstOpening.has(e.openingForAccountId)) firstOpening.set(e.openingForAccountId, e.date);

      const rows = accounts.map((a) => ({
        ...a,
        openingDate: a.openingDate ?? firstOpening.get(a.id) ?? null,
        openingDateDeclared: a.openingDate !== null,
      }));
      // الدليلُ كلُّه يُقرأ ليُشتقّ تاريخُ الافتتاح، فالقطعُ في الذاكرة (ق-١٢٣٦).
      return pageArray(query, rows, ACCOUNT_SEARCH_FIELDS);
    });
  }

  /**
   * مجموعُ أرصدة الدليل **لكل نوع** — كانت شاشةُ الحسابات تجمعه بنفسها (`ق-١٢٤٣`)، وعلى الصفوف
   * المُرشَّحة بالبحث فيتغيّر المجموعُ بتغيّر ما كُتب في خانة البحث. هنا مجموعُ الدليل كلِّه لكل
   * نوع — حقيقةٌ عن الدفاتر لا عن البحث — نصّاً بخانتين (`ق-١٢٣٥`).
   */
  summary(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const grouped = await tx.account.groupBy({ by: ['type'], _sum: { balance: true }, _count: { _all: true } });
      const byType = new Map(grouped.map((g) => [g.type, g]));
      const of = (type: string) => ({ total: money(Number(byType.get(type)?._sum.balance ?? 0)), count: byType.get(type)?._count._all ?? 0 });
      return { asset: of('asset'), liability: of('liability'), equity: of('equity'), revenue: of('revenue'), expense: of('expense') };
    });
  }

  create(companyId: string, dto: CreateAccountDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await this.assertNoDuplicateCode(tx, dto.code);
        const openingBalance = round2(dto.openingBalance ?? 0);
        this.assertNotOpeningEquity(dto.code, openingBalance !== 0);
        this.assertNotInventoryOpening(dto.code, openingBalance !== 0);

        const account = await tx.account.create({
          // `companyId` is intentionally omitted here — the tenant-scope
          // extension injects it at runtime (see tenant-scope.extension.ts).
          // Prisma's generated types don't know about that, so the cast is
          // the documented escape hatch for this pattern.
          // `balance` starts at 0 — the opening entry below moves it, so the
          // ledger stays the only source of balance.
          data: {
            code: dto.code,
            name: dto.name,
            type: dto.type,
            openingBalance,
            // ⚠️ **يُخزَّن ما أعلنه التاجر وحده** (ق-٢٩٦): غيابُه يترك العمود
            // فارغاً، والفراغُ يعني «اقرأه من الأستاذ» — فلا يُكتب مشتقٌّ في
            // خانةِ إعلان.
            openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
          } as unknown as Prisma.AccountCreateInput,
        });

        if (openingBalance !== 0) {
          await postOpeningDeltaEntry(tx, {
            companyId,
            account,
            delta: openingBalance,
            declaredDate: dto.openingDate ? new Date(dto.openingDate) : null,
          });
          // Re-read so the response carries the balance the entry just posted.
          return tx.account.findUniqueOrThrow({ where: { id: account.id } });
        }
        return account;
      }),
    );
  }

  /**
   * **على مستوى المنشأة بحقّها**: قفلُ نوع الحساب يقوم على أيّ سطرٍ مرحَّلٍ
   * عليه في أيّ فرع — فتغييرُ الجهة يقلب كلَّ ترحيلٍ سابق أينما وقع، وسطرٌ
   * محجوبٌ عن القارئ يبقى مانعاً.
   */
  update(companyId: string, id: string, dto: UpdateAccountDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const existing = await tx.account.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException(MSG.account_not_found);

        const data: Prisma.AccountUncheckedUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;

        if (dto.type !== undefined && dto.type !== existing.type) {
          // Changing an account's debit/credit-normal side after it already has
          // posted journal lines would silently flip how every past posting
          // moved its balance — matches the mockup's "لا يمكن تغيير نوع حساب
          // مستخدَم بقيود مرحّلة" restriction. An opening entry counts: it
          // encodes the side too. Delete + recreate is the correction path.
          const usedInJournal = (await tx.journalLine.count({ where: { accountId: id } })) > 0;
          if (usedInJournal) throw new ConflictException(MSG.account_type_locked);
          data.type = dto.type;
        }

        // An opening-balance change is a *posting*, never a mutation: the
        // difference goes through a delta قيد افتتاحي (same dating and 3900
        // counterpart as the original), so the ledger keeps supporting the
        // number and closed periods keep refusing it (CLAUDE.md 6.9).
        const delta = dto.openingBalance === undefined ? 0 : round2(dto.openingBalance) - round2(Number(existing.openingBalance));
        if (delta !== 0) {
          this.assertNotOpeningEquity(existing.code, true);
          this.assertNotInventoryOpening(existing.code, true);
          data.openingBalance = round2(dto.openingBalance!);
        }

        // ⭐ **تاريخُ الافتتاح: يُعلَن ما دام الحسابُ ساكناً** (ق-٢٩٦/④).
        //
        // تغييرُه يعني **إعادةَ تأريخ القيد الافتتاحيّ**، وهو تاريخٌ لا يُكتب
        // فوقه متى صارت عليه حركة. فيُسمح ما دام الحسابُ **بلا حركةٍ غير
        // افتتاحيّه**، ويُرفض بعدها **برسالةٍ تسمّي الحركة وتدلّ على مخرجٍ
        // مبنيّ**: «أدخل الفرق بقيدٍ بتاريخه» (كما في ق-٢٩١).
        const declaredDate = dto.openingDate === undefined ? undefined : new Date(dto.openingDate);
        if (declaredDate !== undefined && !sameDay(declaredDate, existing.openingDate)) {
          data.openingDate = declaredDate;
        }

        // Row first, entry second: a same-request type change must be in
        // effect before the delta entry picks its debit/credit side from
        // `type` — posting from the old type would contradict the account.
        const updated = await tx.account.update({ where: { id }, data });

        if (data.openingDate !== undefined) {
          // مسارٌ واحد للحساب والبنك — البوّابةُ وإعادةُ الترحيل فيه (ق-٢٩٦/④).
          await redeclareOpeningDate(tx, {
            companyId,
            account: updated,
            openingBalance: Number(updated.openingBalance),
            declaredDate: declaredDate!,
          });
          return tx.account.findUniqueOrThrow({ where: { id } });
        }

        if (delta !== 0) {
          await postOpeningDeltaEntry(tx, {
            companyId,
            account: updated,
            delta,
            declaredDate: updated.openingDate,
            memo: `تعديل الرصيد الافتتاحي — ${updated.name} (${updated.code})`,
          });
          // Re-read so the response carries the balance the entry just moved.
          return tx.account.findUniqueOrThrow({ where: { id } });
        }
        return updated;
      }),
    );
  }

  /**
   * **على مستوى المنشأة بحقّها**: قيودُ افتتاح الحساب مملوكةٌ للحساب لا
   * للفرع، وحذفُه يعكسها كلَّها — فمن يحذف حساباً يحذفه من دفتر المنشأة لا
   * من فرعه.
   */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.account.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.account_not_found);
      this.assertNotSystemAccount(existing.code);

      // The account's opening entries are system-owned (auto), so deleting
      // the account deletes them with it — reversing their balance effect on
      // the 3900 counterpart. Dated inside a closed period they are history
      // and must stay: the same refusal as any other posting into that period.
      const openingEntries = await tx.journalEntry.findMany({ where: { openingForAccountId: id } });
      for (const entry of openingEntries) {
        await assertPeriodOpen(tx, entry.date);
        await reverseAndDeleteJournalEntry(tx, entry.id);
      }

      try {
        await tx.account.delete({ where: { id } });
      } catch (e) {
        // P2003 = foreign key violation — journal_lines.accountId is ON
        // DELETE RESTRICT, so this fires when the account still has posted
        // journal lines beyond its own opening entries.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException(MSG.account_has_journal_lines);
        }
        throw e;
      }
    });
  }

  private async assertNoDuplicateCode(tx: Prisma.TransactionClient, code: string, excludeId?: string): Promise<void> {
    const existing = await tx.account.findFirst({ where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException(formatMessage(MSG.account_code_taken, { code }));
  }

  /**
   * **حساباتٌ نظامية: لا تُحذف** (`ق-١٢٨٣`/أ — قرار المالك في التوجيه ٢٥٢).
   *
   * `3300` طرفُ قيد الإقفال و`3900` طرفُ القيد الافتتاحيّ — **ينشئهما النظامُ
   * ويقرؤهما بالرمز**. وحذفُ أحدهما يترك المحرّكَ يُنشئه من جديد عند أوّل حاجة،
   * **فيُقرأ دليلُ الحسابات وكأنه بلا تاريخ**؛ والتقاريرُ التي تقرؤه بالرمز تفقد
   * سطرَها بين الحذف وإعادة الإنشاء.
   *
   * ⚠️ **والقاعدةُ على الموضعَين معاً لا على الجديد وحده** (`§8.14`): لو حُرس `3300`
   * وحدَه لصار الاختلافُ الذي أُريد منعُه.
   *
   * ⚠️ **و«لا يُعدَّل رمزُه» قائمٌ بالبنية لا بحارس** — مقيس: `UpdateAccountDto`
   * **بلا حقل `code` أصلاً**، فلا مسارَ لتغيير رمز أيِّ حساب من الواجهة.
   */
  private assertNotSystemAccount(code: string): void {
    if (SYSTEM_ACCOUNT_CODES.has(code)) {
      throw new ConflictException(formatMessage(MSG.account_system_protected, { code }));
    }
  }

  /** 3900 is the counterpart of every opening entry — giving it an opening
   * balance of its own would make it its own counterpart. */
  private assertNotOpeningEquity(code: string, hasOpening: boolean): void {
    if (hasOpening && code === OPENING_EQUITY_CODE) {
      throw new ConflictException(formatMessage(MSG.account_opening_equity_protected, { code: OPENING_EQUITY_CODE }));
    }
  }

  /**
   * ⭐ `٣٠` **مصدرٌ واحد لرصيد المخزون** (`ق-١١٧٧/②`): الرصيدُ الافتتاحيُّ لحساب المخزون يُعلَن من المخزون
   * بطبقاته (إعلانُ الرصيد الافتتاحي — `POST inventory/opening`) لا من هنا؛ وإلا ازدوج المصدران بصمت: رصيدٌ على
   * الحساب هنا وطبقاتٌ هناك. **يُبنى مع الإعلان لا بعده** — وصفرُ حسابٍ متأثّر يومَ البناء هو ما جعله رخيصاً.
   */
  private assertNotInventoryOpening(code: string, hasOpening: boolean): void {
    if (hasOpening && code === INVENTORY_ACCOUNT_CODE) {
      throw new ConflictException(formatMessage(MSG.account_opening_inventory_via_stock, { code: INVENTORY_ACCOUNT_CODE }));
    }
  }
}
