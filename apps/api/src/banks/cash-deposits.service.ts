import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertBranchAllowed } from '../branches/branch-scope.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postCashDepositEntry, postCashDepositVoidEntry } from '../journal/auto-posting.util';
import { CASH_IN_TRANSIT_CODE, CASH_IN_TRANSIT_NAME } from '../journal/pos-settlement.util';
import { getOrCreateAccountByCode } from '../journal/pos-settlement.util';
import { readLedger } from '../reports/ledger.util';

/**
 * **إيداعُ نقدِ الدرج في البنك عبر «نقدٍ في الطريق»** (`ق-١٢٦١` ج — `domain-scan/07` A3).
 *
 * كان نقدُ الأدراج المودَعُ فعلاً يبقى في حساب الدرج بالدفتر، ومع الزمن يستحيل معرفةُ أيِّ إيداعٍ وصل. المسارُ الآن
 * مستندٌ بحالة: **الإيداعُ** يرحّل `مدين 1190 نقدٌ في الطريق / دائن الدرج` — فيخرج من الدرج ولا يدخل البنكَ بالدفتر
 * بعد؛ **والتأكيدُ** من التسوية البنكية (`⑦A1`): سطرُ كشفٍ بالمبلغ نفسِه يُرحَّل بطرفٍ هو `1190` (`مدين البنك / دائن
 * 1190`) فيصفّر الطريقَ ويُقفل المستندَ `CONFIRMED`. **والإلغاءُ** عكسٌ لا محو، وقبل التأكيد وحدَه.
 *
 * ⚠️ حدودٌ معلَنة: الإيداعُ لا يتجاوز رصيدَ الدرج بالدفتر (يُقاس لحظتَه) · مبلغٌ واحد لكلِّ مستند (لا تجميعُ إيداعاتٍ
 * في سطرِ كشفٍ واحد) · رقمُ `1190` مشتقٌّ من موضعه بين الأدراج (`1010–1099`) والذمم (`1200`) — «أو ما يُقرَّر».
 */
type Tx = Prisma.TransactionClient;

@Injectable()
export class CashDepositsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** `CD-YYYY-NNNN` — من العدّاد الذرّيّ (`ق-٣٢٨`). */
  private nextNumber(tx: Tx, companyId: string, date: Date): Promise<string> {
    return nextDocumentNumber(tx, companyId, date, { kind: 'CD', pad: 4 }, (prefix) => highestSequenceOf(tx.cashDeposit, prefix));
  }

  /**
   * القائمةُ مع مجموع الطريق **من الدفتر لا من المستندات**: رصيدُ `1190` هو ما لم يؤكَّد بعد — والمستنداتُ تُطابقه
   * بالبناء، والفرقُ إن كان يُعلَن (إيداعٌ قديم قبل البناء أو قيدٌ يدويّ على الطريق).
   * **على مستوى المنشأة بحقّها**: الإيداعاتُ تُقرأ بفروع القارئ عبر حقل الفرع على المستند، ومحرّكُ الأستاذ يرشّح بنفسه.
   */
  list(companyId: string, allowedBranchIds: string[] | 'all', bankId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const deposits = await tx.cashDeposit.findMany({
        where: {
          ...(bankId ? { bankId } : {}),
          ...(allowedBranchIds === 'all' ? {} : { OR: [{ branchId: { in: allowedBranchIds } }, { branchId: null }] }),
        },
        include: { drawer: { select: { id: true, name: true } }, bank: { select: { id: true, name: true } } },
        orderBy: [{ date: 'desc' }, { no: 'desc' }],
      });
      const transit = await tx.account.findFirst({ where: { code: CASH_IN_TRANSIT_CODE }, select: { id: true } });
      const inTransitLedger = transit ? (await readLedger(tx, { allowedBranchIds, accountId: transit.id }, 'debit')).closing : money(0);
      const inTransitDocuments = round2(deposits.filter((d) => d.status === 'IN_TRANSIT').reduce((t, d) => t + Number(d.amount), 0));
      return {
        items: deposits.map((d) => ({ ...d, amount: money(d.amount), date: d.date.toISOString().slice(0, 10) })),
        inTransit: { ledger: inTransitLedger, documents: money(inTransitDocuments), matched: Math.abs(Number(inTransitLedger) - inTransitDocuments) < 0.005 },
      };
    });
  }

  /**
   * الإيداع: يخرج من الدرج إلى الطريق. الدرجُ يجب أن يحمل المبلغَ بالدفتر لحظتَه — إيداعٌ يفوق ما في الدرج يُرفض
   * مسمّىً بالرصيد.
   * **على مستوى المنشأة بحقّها**: الدرجُ والبنكُ يُقرآن بمعرّفيهما ثم يُفحص فرعُ الدرج على فروع القارئ.
   */
  create(companyId: string, allowedBranchIds: string[] | 'all', dto: { drawerId: string; bankId: string; amount: number; date: string; memo?: string }) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const drawer = await tx.cashDrawer.findUnique({ where: { id: dto.drawerId }, select: { id: true, name: true, accountId: true, branchId: true, isActive: true } });
      if (!drawer) throw new NotFoundException(MSG.cash_drawer_not_found);
      if (drawer.branchId) assertBranchAllowed(allowedBranchIds, drawer.branchId);
      const bank = await tx.bank.findUnique({ where: { id: dto.bankId }, select: { id: true, name: true, accountId: true, deletedAt: true } });
      if (!bank || bank.deletedAt) throw new NotFoundException(MSG.bank_not_found);
      const amount = round2(dto.amount);
      if (amount <= 0) throw new BadRequestException(MSG.cash_deposit_amount_positive);
      const date = new Date(dto.date);

      // رصيدُ الدرج بالدفتر حتى تاريخ الإيداع — بالمحرّك نفسِه.
      const drawerLedger = await readLedger(tx, { allowedBranchIds: 'all', accountId: drawer.accountId, to: date }, 'debit');
      const available = Number(drawerLedger.closing);
      if (available + 0.005 < amount) {
        throw new ConflictException(formatMessage(MSG.cash_deposit_exceeds_drawer, { drawer: drawer.name, available: money(available), amount: money(amount) }));
      }

      const transit = await getOrCreateAccountByCode(tx, companyId, CASH_IN_TRANSIT_CODE, CASH_IN_TRANSIT_NAME, 'asset');
      const no = await this.nextNumber(tx, companyId, date);
      const memo = dto.memo?.trim() || `إيداع ${no} من ${drawer.name} في ${bank.name}`;
      const entry = await postCashDepositEntry(tx, companyId, { no, date, amount, memo, branchId: drawer.branchId, drawerAccountId: drawer.accountId, transitAccountId: transit.id });
      const created = await tx.cashDeposit.create({
        data: { no, date, amount, memo, drawerId: drawer.id, bankId: bank.id, branchId: drawer.branchId, journalEntryId: entry.id } as unknown as Prisma.CashDepositUncheckedCreateInput,
        include: { drawer: { select: { id: true, name: true } }, bank: { select: { id: true, name: true } } },
      });
      return { ...created, amount: money(created.amount), date: created.date.toISOString().slice(0, 10), entryNo: entry.no };
    });
  }

  /**
   * الإلغاءُ عكسٌ لا محو — وقبل التأكيد وحدَه؛ المؤكَّدُ حقيقةٌ رآها كشفُ البنك فلا يُلغى بل يُعالَج بمستندٍ جديد.
   * **على مستوى المنشأة بحقّها**: مستندٌ واحد بمعرّفه، وفرعُه يُفحص على فروع القارئ.
   */
  void(companyId: string, allowedBranchIds: string[] | 'all', id: string, reason?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const deposit = await tx.cashDeposit.findUnique({ where: { id }, include: { drawer: { select: { accountId: true, branchId: true } } } });
      if (!deposit) throw new NotFoundException(MSG.cash_deposit_not_found);
      if (deposit.branchId) assertBranchAllowed(allowedBranchIds, deposit.branchId);
      if (deposit.status !== 'IN_TRANSIT') throw new ConflictException(MSG.cash_deposit_not_voidable);
      const transit = await getOrCreateAccountByCode(tx, companyId, CASH_IN_TRANSIT_CODE, CASH_IN_TRANSIT_NAME, 'asset');
      const entry = await postCashDepositVoidEntry(tx, companyId, {
        no: deposit.no,
        amount: Number(deposit.amount),
        memo: reason?.trim() || `إلغاء إيداع ${deposit.no}`,
        branchId: deposit.branchId,
        drawerAccountId: deposit.drawer.accountId,
        transitAccountId: transit.id,
        reversalOfId: deposit.journalEntryId,
      });
      const voided = await tx.cashDeposit.update({ where: { id }, data: { status: 'VOID', voidJournalEntryId: entry.id } });
      return { ...voided, amount: money(voided.amount), date: voided.date.toISOString().slice(0, 10), voidEntryNo: entry.no };
    });
  }
}
