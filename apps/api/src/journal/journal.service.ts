import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { branchFilter } from '../branches/branch-scope.util';
import { Prisma } from '@mad-app/db';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { dayStartOf } from '../common/wall-clock.util';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { ListJournalQueryDto } from './dto/list-journal-query.dto';
import { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto';
import { resolveBranchId } from '../branches/branch-scope.util';
import { assertManualEntryLines, createJournalEntry } from './journal-posting.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { withoutCompanyFigures } from '../common/tenant/company-figures.util';

/** السطورُ بحساباتها، ورابطا العكس: مَن عكسه (`reversedBy`) ومَن يعكسه (`reversalOf`) — بالرقم للعرض. */
const JOURNAL_ENTRY_INCLUDE = {
  lines: { include: { account: true } },
  reversedBy: { select: { id: true, no: true, date: true } },
  reversalOf: { select: { id: true, no: true } },
} as const;

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
        /**
         * ⚠️ **ترتيبٌ تامٌّ لا جزئيّ** (`ق-٣٥٦`): `date` عمودُ `@db.Date` —
         * **بدقّة اليوم**، فكلُّ قيود اليوم **تتعادل تماماً**، **وترتيبُ
         * المتساوين في Postgres غيرُ محدَّد** ويتغيّر بالخطّة وبالترتيب
         * المادّيّ للصفوف.
         *
         * **والأثرُ على التاجر لا على الاختبار**: صفحتان متتاليتان **قد
         * تكرّران صفّاً وتُسقطان آخر** على البيانات نفسها بلا سببٍ ظاهر —
         * **ومحاسبٌ يرى قيداً مرتين ثم لا يجده يفقد الثقة في التقرير كلّه**.
         *
         * **فيُضاف فاصلان**: `createdAt` (ترتيبٌ يقرؤه الإنسان داخل اليوم)
         * ثم **`id` — وهو الفريد الذي يجعل الترتيب تامّاً**.
         */
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      // ⚖️ قيودُ فرعه يقرؤها المقيَّد، ورصيدُ الحساب في أسطرها رقمُ المنشأة كلِّها فيسقط (`ق-١٥٨١`).
      if (allowedBranchIds !== 'all') {
        const scoped = items.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l, account: withoutCompanyFigures(allowedBranchIds, l.account, ['balance', 'openingBalance'] as const) })) }));
        return { items: scoped, total, page, pageSize };
      }
      return { items, total, page, pageSize };
    });
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateJournalEntryDto) {
    // ⚖️ `ق-١٥٨٥` (بحكم صاحب المشروع): القيدُ اليدويّ بعملة الأساس وحدَها، فحقلا العملة والسعر يُرفضان برسالة قبل أيّ كتابة؛
    // وكانا يُقبلان في الـDTO (يرثهما من `CurrencyFieldsDto`) ثم يُسقطان صامتين فيُخزَّن القيدُ بسعر ١ أيّاً كان المرسَل.
    if (dto.currency !== undefined || dto.exchangeRate !== undefined) throw new BadRequestException(MSG.journal_currency_fields_rejected);
    const lines = dto.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit }));
    assertManualEntryLines(lines);
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
          lines,
        }),
      ),
    );
  }

  /**
   * ⚖️ **القيدُ المرحَّل يُعكس ولا يُحذف** (`ق-١٢٥٣`/①).
   *
   * كان هذا المسارُ يعكس الأرصدةَ **ثم يحذف الصفَّ وسطورَه** (`reverseAndDeleteJournalEntry`)
   * — فيُمحى قيدٌ مرحَّل ويُحرق رقمُه في التسلسل (`JE-` عدّادٌ ذرّيّ لا يُعاد)، وهو
   * نقيضُ ما بُني في كلِّ مستندٍ آخر (الفاتورةُ لا تُعدَّل والمردودُ يُغلق ولا يُمسّ).
   * **مقيسٌ قبل الإصلاح**: `DELETE /journal/:id` على قيدٍ يدويّ ⇒ `204` والصفُّ يختفي
   * والرقمُ التالي يقفز (`journal-reversal.e2e-spec.ts` — الحالةُ ① سقطت على الشيفرة القديمة).
   *
   * **فالحذفُ يُرفض دائماً** بمسمّاه، والمخرجُ `reverse()`. (والآليُّ كان مرفوضاً قبلُ
   * برسالته — تبقى رسالتُه لأنها تدلّ على مخرجه: المستندُ المصدر.)
   *
   * ⚠️ الفرعُ (`ق-١٤٤٠`): يُقرأ القيدُ بحقّ القارئ (`branchFilter`) **قبل** الرفض المسمّى — فرفضٌ `409`
   * برقم قيدِ فرعٍ آخر أو بنوعه يُثبت وجودَ صفٍّ مخفيٍّ ويكشف رقمَه.
   */
  async remove(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // ق-١٤٤٠: قيدُ فرعٍ آخر غيرُ موجودٍ للفاعل — 404 كالمعرّف الذي لا صفَّ له، لا 409 يسمّيه.
      const existing = await tx.journalEntry.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
      if (!existing) throw new NotFoundException(MSG.journal_entry_not_found);
      if (existing.auto) throw new ConflictException(MSG.journal_auto_entry_undeletable);
      throw new ConflictException(formatMessage(MSG.journal_posted_reverse_instead, { no: existing.no }));
    });
  }

  /**
   * قيدٌ عكسيٌّ مرقَّمٌ في فترةٍ مفتوحة: السطورُ نفسُها بتبديل الطرفين، العملةُ وسعرُها
   * والفرعُ كما هما، `reversalOfId` يشير إلى الأصل — **والأصلُ لا يُمسّ**.
   *
   * ما يُرفض بمسمّاه: الآليُّ (يتبع مستندَه) · العكسيُّ (لا يُعكس) · المعكوسُ سلفاً
   * (واحدٌ لكلِّ أصل — والقاعدةُ تحرسه بفهرسٍ فريد فوق هذا الفحص). وقفلُ الفترة يُرمى
   * من `createJournalEntry` على تاريخ العكس لا على تاريخ الأصل — فأصلٌ في فترةٍ
   * مقفلة يُعكس اليوم، وهو معنى «التصحيحُ بقيدٍ عكسي في فترةٍ مفتوحة».
   *
   * ⚠️ الفرعُ: يُقرأ الأصلُ بحقّ القارئ (`branchFilter`) — فمن لا يرى فرعاً لا يعكس قيودَه.
   */
  reverse(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: ReverseJournalEntryDto = {}) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const existing = await tx.journalEntry.findFirst({
          where: { id, ...branchFilter(allowedBranchIds) },
          include: { lines: true, reversedBy: { select: { no: true } } },
        });
        if (!existing) throw new NotFoundException(MSG.journal_entry_not_found);
        if (existing.auto) throw new ConflictException(formatMessage(MSG.journal_auto_entry_not_reversible, { no: existing.no }));
        if (existing.reversalOfId) throw new ConflictException(formatMessage(MSG.journal_reversal_not_reversible, { no: existing.no }));
        if (existing.reversedBy) throw new ConflictException(formatMessage(MSG.journal_already_reversed, { no: existing.no, by: existing.reversedBy.no }));

        // يومُ الطلب بالدالّة الواحدة (`ق-١١٩٠`) — بإزاحتها الافتراضية المعلَنة، لا بمنطقة العملية.
        const date = dto.date ? new Date(dto.date) : dayStartOf(new Date());
        return createJournalEntry(tx, {
          companyId,
          branchId: existing.branchId,
          date,
          memo: dto.memo?.trim() || `عكس القيد ${existing.no} — ${existing.memo}`,
          auto: false,
          currency: existing.currency,
          exchangeRate: Number(existing.exchangeRate),
          reversalOfId: existing.id,
          lines: existing.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.credit), credit: Number(l.debit) })),
        });
      }),
    );
  }
}
