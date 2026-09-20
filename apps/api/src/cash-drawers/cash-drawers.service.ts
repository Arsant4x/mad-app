import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { formatMoney } from '../common/money/rounding';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسم. */
const DRAWER_SEARCH_FIELDS = ['name'] as const;
import { CreateCashDrawerDto } from './dto/create-cash-drawer.dto';
import { UpdateCashDrawerDto } from './dto/update-cash-drawer.dto';
import { DRAWER_BANDS, bandGroup, bandStatus, nextCodeInBands } from '../accounts/code-bands';

/**
 * **درجُ الكاشير: كيانٌ وحساب** (`ق-٢١٨` بحكم صاحب المشروع: «المفصَّل يُجمَّع دائماً
 * والمجمَّع لا يُفصَّل أبداً» · والرموز في `ق-٢٥٣` · وحدُّ التعطيل في `ق-٢٦٥`).
 *
 * الحسابُ يُنشأ **مع الدرج لا بعده**: درجٌ بلا حساب لا يستقبل ترحيلاً، ورمزٌ يُدخله
 * التاجر بيده يصطدم بدليلٍ لا يراه.
 */
const DRAWER_INCLUDE = { account: { select: { id: true, code: true, name: true, balance: true } }, branch: { select: { id: true, name: true } } } as const;

/** إدارةُ الأدراج فعلُ مالك — كالفروع: كاشيرٌ يُنشئ درجاً يُنشئ حساباً في الدليل. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.cash_drawer_forbidden);
}

/**
 * الرمزُ التالي في نطاق الأدراج — **`MAX+1` من المصدر، لا `count()`** (`ق-١٩٨`).
 *
 * يقرأ رموزَ حسابات المنشأة ويأخذ أكبرَ ما يقع في النطاق: **فالفجوةُ لا تُعاد
 * تعبئتُها**، وحسابٌ يُنشئه التاجر يدوياً داخل النطاق يدفع التاليَ فوقه. والتصادمُ
 * في سباقٍ حقيقيّ يظهر `P2002` على `(companyId, code)` فيُعاد الحساب — لا يُخمَّن.
 *
 * ⚠️ **والنطاقُ وسقفُه في `accounts/code-bands.ts`** (`ق-٢٩٥`) — موضعٌ واحد
 * يجمع التعريفَ والإنذار، **فالأدراجُ عند `1082` من `1099`** ولا يكفي أن
 * تُنذر البنوكُ وحدها.
 */
export async function nextDrawerCode(tx: Prisma.TransactionClient): Promise<string> {
  const accounts = await tx.account.findMany({ select: { code: true } });
  const next = nextCodeInBands(accounts.map((a) => a.code), DRAWER_BANDS);
  if (next === null) throw new ConflictException(MSG.cash_drawer_code_range_full);
  return String(next);
}

@Injectable()
export class CashDrawersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * ⚠️ **وهذه أثقلُ من العروض**: `DRAWER_INCLUDE` يحمل **رصيدَ حساب الدرج** —
   * فكاشيرُ فرعٍ كان يقرأ **نقديّةَ كلّ فرعٍ آخر** لحظةً بلحظة، لا أسماءَ
   * الأدراج فحسب.
   *
   * والقائمةُ تبقى مقروءةً لكلّ فاعل (تغذّي مُنتقي الدرج عند فتح المناوبة) —
   * **يتغيّر ما تُظهره لا من يقرؤها**.
   */
  list(companyId: string, allowedBranchIds: string[] | 'all', query?: PagedQueryDto) {
    const where: Prisma.CashDrawerWhereInput = { ...branchFilter(allowedBranchIds), ...searchWhere(searchTerm(query), DRAWER_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      pagedFindMany(query, tx.cashDrawer, { where, include: DRAWER_INCLUDE, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    );
  }

  /** حالةُ نطاق رموز الأدراج — تُقرأ من الدليل لحظةَ السؤال (`ق-٢٩٥`). */
  codeBand(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const accounts = await tx.account.findMany({ select: { code: true } });
      return bandStatus(accounts.map((a) => a.code), bandGroup('drawer'));
    });
  }

  /**
   * ⚠️ **إعادةُ المحاولة تلفّ المعاملة لا تقع داخلها**: معاملةٌ سقطت بـ`P2002`
   * **مُجهَضة**، فأيّ استعلامٍ بعدها فيها يسقط كذلك. فتُعاد المعاملةُ كاملةً —
   * وهو نمطُ `ZatcaService` مع `nextIcv` نفسه.
   */
  /**
   * ⚠️ **البوّابةُ هنا ملكيّةٌ لا فرع** — **ومالكُ المنشأة نطاقُه `all`**، فلا
   * يقع تجاوزٌ عبر هذا المسار اليوم (مقيسٌ `ق-٥١٢`).
   *
   * ⭐ **ويمرّ بـ`resolveBranchId` رغم ذلك**: **حارسٌ يعتمد على بوّابةٍ أخرى
   * يسقط يوم تُفتَح تلك البوّابة** — **والتحقّقُ في موضعه لا في جاره**. وهو
   * اليومَ لا يمنع شيئاً، **وغداً يمنع ما لم نره**.
   */
  async create(companyId: string, actorType: string, allowedBranchIds: string[] | 'all', dto: CreateCashDrawerDto) {
    assertIsCompanyOwner(actorType);
    const name = dto.name.trim();

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
          const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);

          const code = await nextDrawerCode(tx);
          const account = await tx.account.create({
            data: { code, name: `حساب ${name}`, type: 'asset' } as unknown as Prisma.AccountUncheckedCreateInput,
          });
          const created = await tx.cashDrawer.create({
            data: { name, branchId, accountId: account.id } as unknown as Prisma.CashDrawerUncheckedCreateInput,
          });
          return tx.cashDrawer.findUniqueOrThrow({ where: { id: created.id }, include: DRAWER_INCLUDE });
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const target = String((e.meta as { target?: string | string[] } | undefined)?.target ?? '');
          // اسمُ الدرج مأخوذ ⇒ خطأُ المستعمل، لا سباق: لا تُعاد المحاولة.
          if (target.includes('name')) throw new ConflictException(formatMessage(MSG.cash_drawer_name_taken, { name }));
          if (attempt < 2) continue; // سباقٌ على الرمز — يُعاد بقراءةٍ جديدة
        }
        throw e;
      }
    }
  }

  /**
   * التعديل — والتعطيلُ مشروطٌ بشرطَين، **ورسالةُ كلٍّ تسمّي المانع وتدلّ على
   * المخرج** (`ق-٢٦٥`): فمنعٌ بلا مخرجٍ يُلتفّ عليه — يُعطَّل الدرجُ من القاعدة،
   * أو يُترك مفتوحاً بلا استعمال، أو يُنشأ ثانٍ ويُهمل الأول.
   *
   * **على مستوى المنشأة بحقّها**: تعطيلُ الدرج يُمنع بمناوبةٍ مفتوحةٍ عليه
   * أياً كان فاتحُها — فالدرجُ يعرّف فرعَه بنفسه، والتعديلُ فعلُ مالكٍ نطاقُه
   * الكلّ.
   */
  async update(companyId: string, actorType: string, id: string, dto: UpdateCashDrawerDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.cashDrawer.findUnique({ where: { id }, include: DRAWER_INCLUDE });
      if (!existing) throw new NotFoundException(MSG.cash_drawer_not_found);

      if (dto.isActive === false && existing.isActive) {
        const openShift = await tx.posShift.findFirst({ where: { drawerId: id, status: 'OPEN' }, orderBy: { openedAt: 'asc' } });
        if (openShift) {
          throw new ConflictException(
            formatMessage(MSG.cash_drawer_has_open_shift, {
              cashier: openShift.openedByName,
              since: openShift.openedAt.toISOString().slice(0, 16).replace('T', ' '),
            }),
          );
        }
        // الرصيدُ يُقرأ من الحساب لا من عمودٍ على الدرج — مصدرٌ واحد (ق-٢٥٣/②).
        if (!existing.account.balance.equals(0)) {
          const company = await tx.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });
          throw new ConflictException(
            formatMessage(MSG.cash_drawer_has_balance, {
              // `formatMoney` لا `toFixed`: التدويرُ بالسياسة لا بيدٍ في كل موضع
              // (حارس `money/rounding` أسقطها هنا فعلاً عند أول كتابة).
              balance: `${formatMoney(existing.account.balance.toNumber())} ${company?.baseCurrency ?? 'SAR'}`,
            }),
          );
        }
      }

      const name = dto.name?.trim();
      try {
        await tx.cashDrawer.update({ where: { id }, data: { ...(name ? { name } : {}), ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }) } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.cash_drawer_name_taken, { name: name ?? existing.name }));
        }
        throw e;
      }
      return tx.cashDrawer.findUniqueOrThrow({ where: { id }, include: DRAWER_INCLUDE });
    });
  }

  /** الحذفُ يرثه `RESTRICT` من `journal_lines`: درجٌ تحرّك حسابُه يُعطَّل ولا يُحذف. */
  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.cashDrawer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.cash_drawer_not_found);
      await tx.cashDrawer.delete({ where: { id } });
      try {
        await tx.account.delete({ where: { id: existing.accountId } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException(MSG.cash_drawer_has_movements);
        }
        throw e;
      }
    });
  }
}
