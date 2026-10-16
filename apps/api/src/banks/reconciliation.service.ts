import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { assertBranchAllowed } from '../branches/branch-scope.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { dayEndOf, dayStartOf } from '../common/wall-clock.util';
import { postBankStatementLineEntry } from '../journal/auto-posting.util';
import { readLedger, type LedgerRow } from '../reports/ledger.util';
import { CASH_IN_TRANSIT_CODE, CASH_IN_TRANSIT_NAME, getOrCreateAccountByCode } from '../journal/pos-settlement.util';
import { lockBankForReconciliationClose, lockReconciledBanks } from './reconciliation-lock.util';

/**
 * **التسويةُ البنكية** (`ق-١٢٦١` ج — `domain-scan/07` A1).
 *
 * ثلاثةُ أطرافٍ في هذا الملفّ، وتمييزُها هو التصميم:
 * - **سطورُ الكشف** = صفوفُ `bank_transactions` **اليدوية** (`entryNo` فارغ — `ق-٢٨١`: سطرُ مطابقةٍ لا مصدرُ قيد)؛
 *   ما كتبه التاجر من كشف البنك. **المرآةُ** (`entryNo` مكتوب — تُكتب من مسار الترحيل) ليست كشفاً بل صورةَ الدفتر،
 *   فلا تدخل جانبَ الكشف.
 * - **سطورُ الدفتر** = سطورُ القيود على حساب البنك — تُقرأ **بمحرّك الأستاذ نفسِه** (`readLedger`).
 * - **المطابقة** تربط سطرَ كشفٍ بسطرِ دفترٍ واحد (`matchedLineId` فريد) بمبلغٍ مساوٍ وإشارةٍ متّفقة؛ **والسطرُ الذي لا
 *   دفترَ له** (رسمٌ بنكيّ · فائدةٌ · تحويلٌ لم يُسجَّل) **يُرحَّل عند المطابقة بطرفٍ يختاره المحاسب** — وبه تُحلّ
 *   `ق-٢٨١` (السطرُ اليدويّ كان بلا طرفٍ فلا يُرحَّل) بلا أن يُخترع الطرف.
 * - **الإقفال** (`reconciledUntil`): لا سطرَ كشفٍ معلَّقاً حتى التاريخ؛ وبعده **لا قيدَ على حساب البنك بتاريخٍ ≤ التاريخ**
 *   (حارسٌ في `createJournalEntry`) **ولا فكَّ مطابقةٍ قبله** — فالمطابَقُ حقيقةٌ أُغلقت كإقفال الفترة.
 *
 * ⚠️ حدودٌ معلَنة: المطابقةُ واحدٌ لواحد بمبلغٍ مساوٍ (لا تجميعُ سطورٍ ولا مطابقةٌ جزئية) · لا استيرادَ ملفّ كشف
 * (يدويٌّ اليوم، مستورَدٌ غداً بالبنية نفسِها) · المقترَحاتُ بالمبلغ والتاريخ `±3` أيام لا أكثر.
 */
const SUGGEST_DAYS = 3;

/**
 * سطرُ كشفٍ = ليس مرآةً: المرآةُ تحمل `entryNo` بلا `matchedLineId` (كتبها الترحيل)؛ والسطرُ اليدويُّ بلا `entryNo`،
 * فإن رُحِّل من التسوية حمل الاثنين معاً — ويبقى سطرَ كشفٍ لأنه هو الحركةُ التي كتبها التاجر.
 */
const STATEMENT_ROW: Prisma.BankTransactionWhereInput = { OR: [{ entryNo: null }, { NOT: { matchedLineId: null } }] };
const isStatementRow = (row: { entryNo: string | null; matchedLineId: string | null }) => row.entryNo === null || row.matchedLineId !== null;

export interface ReconciliationQuery {
  from?: string;
  to?: string;
}

@Injectable()
export class ReconciliationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** البنكُ بمعرّفه، ثم فرعُه يُفحص على فروع القارئ — فكلُّ قراءةٍ بعده مقيَّدةٌ ببنكٍ أُذن به. */
  private async bankOf(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', bankId: string) {
    const bank = await tx.bank.findUnique({ where: { id: bankId }, select: { id: true, name: true, accountId: true, branchId: true, reconciledUntil: true, balance: true, deletedAt: true } });
    if (!bank || bank.deletedAt) throw new NotFoundException(MSG.bank_not_found);
    if (bank.branchId) assertBranchAllowed(allowedBranchIds, bank.branchId);
    return bank;
  }

  /**
   * الجانبان والمقترَحاتُ والمجاميع — كلُّ رقمٍ محسوبٌ هنا ويُرسَل نصّاً (`ق-١٢٤٣`).
   * **على مستوى المنشأة بحقّها**: سطورُ الكشف تُقرأ ببنكٍ واحد فُحص فرعُه في `bankOf`، وسطورُ الدفتر بمحرّك الأستاذ
   * الذي يرشّح بفروع القارئ بنفسه — فالفرعُ محروسٌ عبر البنك والمحرّك لا عبر مرشِّحٍ على الصفّ هنا.
   */
  overview(companyId: string, allowedBranchIds: string[] | 'all', bankId: string, query: ReconciliationQuery) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const bank = await this.bankOf(tx, allowedBranchIds, bankId);
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;

      // سطورُ الكشف اليدوية في المدى — مع ما طابقته.
      const statement = await tx.bankTransaction.findMany({
        where: { bankId, ...STATEMENT_ROW, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        select: { id: true, date: true, description: true, amount: true, matchedLineId: true, matchedAt: true, source: true },
      });
      // سطورُ الدفتر على حساب البنك — بالمحرّك نفسِه، والافتتاحيُّ والجاري معه.
      const ledger = await readLedger(tx, { allowedBranchIds, accountId: bank.accountId, from, to }, 'debit');
      const matchedLineIds = new Set(statement.map((s) => s.matchedLineId).filter((x): x is string => Boolean(x)));
      // سطورٌ طابقتها صفوفٌ خارج المدى تبقى «مطابَقة» — تُقرأ من الجدول لا من المدى.
      const outsideMatches = await tx.bankTransaction.findMany({ where: { bankId, matchedLineId: { in: ledger.rows.map((r) => r.lineId) } }, select: { matchedLineId: true } });
      for (const m of outsideMatches) if (m.matchedLineId) matchedLineIds.add(m.matchedLineId);

      const ledgerRows = ledger.rows.map((r) => ({ ...r, matched: matchedLineIds.has(r.lineId) }));
      const unmatchedLedger = ledgerRows.filter((r) => !r.matched);
      const unmatchedStatement = statement.filter((s) => !s.matchedLineId);

      // المقترَحات: المبلغُ نفسُه بإشارته (موجبٌ ⟵ مدين على البنك) وتاريخٌ في حدود ±3 أيام — لكلِّ سطرِ كشفٍ معلَّق.
      const suggestions = unmatchedStatement.map((s) => {
        const amount = Number(s.amount);
        const candidates = unmatchedLedger.filter((r) => {
          // المبلغُ الموقَّع للسطر: مدينٌ يدخل البنكَ (+) ودائنٌ يخرج (−) — كإشارة سطر الكشف.
          const lineAmount = Number(r.debit) - Number(r.credit);
          const days = Math.abs((new Date(r.date).getTime() - s.date.getTime()) / 86_400_000);
          return Math.abs(lineAmount - amount) < 0.005 && days <= SUGGEST_DAYS;
        });
        return { transactionId: s.id, lineIds: candidates.map((r) => r.lineId) };
      });

      const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
      return {
        bank: { id: bank.id, name: bank.name, accountId: bank.accountId, reconciledUntil: bank.reconciledUntil ? bank.reconciledUntil.toISOString().slice(0, 10) : null, mirrorBalance: money(bank.balance) },
        from: query.from ?? null,
        to: query.to ?? null,
        statement: statement.map((s) => ({ id: s.id, date: s.date.toISOString().slice(0, 10), description: s.description, amount: money(s.amount), matchedLineId: s.matchedLineId, matchedAt: s.matchedAt, source: s.source })),
        ledger: { opening: ledger.opening, closing: ledger.closing, rows: ledgerRows, truncated: ledger.truncated },
        suggestions,
        totals: {
          unmatchedStatement: money(sum(unmatchedStatement.map((s) => Number(s.amount)))),
          unmatchedStatementCount: unmatchedStatement.length,
          unmatchedLedger: money(sum(unmatchedLedger.map((r) => Number(r.debit) - Number(r.credit)))),
          unmatchedLedgerCount: unmatchedLedger.length,
        },
      };
    });
  }

  /**
   * يربط سطرَ كشفٍ بسطرِ دفترٍ — بمبلغٍ مساوٍ وإشارةٍ متّفقة، وما قبل الإقفال لا يُمسّ.
   * **على مستوى المنشأة بحقّها**: الصفوفُ الثلاثة تُقرأ بمعرّفاتها داخل بنكٍ واحد أُذن بفرعه أعلاه، والسطرُ يُقيَّد
   * بحساب ذلك البنك — قراءةٌ بالمعرّف لا قراءةٌ جامعة، والفرعُ حُسم قبلها.
   */
  match(companyId: string, allowedBranchIds: string[] | 'all', bankId: string, transactionId: string, lineId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const bank = await this.bankOf(tx, allowedBranchIds, bankId);
      const row = await tx.bankTransaction.findFirst({ where: { id: transactionId, bankId } });
      if (!row || !isStatementRow(row)) throw new NotFoundException(MSG.bank_transaction_not_found);
      if (row.matchedLineId) throw new ConflictException(MSG.reconciliation_already_matched);
      this.assertAfterClose(bank.reconciledUntil, row.date);
      const line = await tx.journalLine.findFirst({ where: { id: lineId, accountId: bank.accountId }, include: { journalEntry: { select: { date: true, no: true } } } });
      if (!line) throw new NotFoundException(MSG.reconciliation_line_not_found);
      const taken = await tx.bankTransaction.findFirst({ where: { matchedLineId: lineId }, select: { id: true } });
      if (taken) throw new ConflictException(MSG.reconciliation_line_taken);
      const amount = Number(row.amount);
      const lineAmount = Number(line.debit) - Number(line.credit);
      if (Math.abs(lineAmount - amount) >= 0.005) {
        throw new ConflictException(formatMessage(MSG.reconciliation_amount_mismatch, { statement: money(amount), ledger: money(lineAmount) }));
      }
      return tx.bankTransaction.update({ where: { id: row.id }, data: { matchedLineId: lineId, matchedAt: new Date(), matched: true } });
    });
  }

  /**
   * يفكّ مطابقةً — لا قبل الإقفال.
   * **على مستوى المنشأة بحقّها**: صفٌّ واحد بمعرّفه في بنكٍ فُحص فرعُه — لا مسحَ على الفروع هنا.
   */
  unmatch(companyId: string, allowedBranchIds: string[] | 'all', bankId: string, transactionId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const bank = await this.bankOf(tx, allowedBranchIds, bankId);
      const row = await tx.bankTransaction.findFirst({ where: { id: transactionId, bankId } });
      if (!row || !isStatementRow(row)) throw new NotFoundException(MSG.bank_transaction_not_found);
      if (!row.matchedLineId) throw new ConflictException(MSG.reconciliation_not_matched);
      // Read under the shared lock, so a close in progress is waited for and a close after this waits for the unmatch.
      const [locked] = await lockReconciledBanks(tx, companyId, { bankIds: [bank.id] });
      this.assertAfterClose(locked?.reconciledUntil ?? null, row.date);
      // السطرُ الذي رُحِّل من التسوية يبقى حاملاً قيدَه (`entryNo`) — فكُّ المطابقة لا يمحو قيداً، والقيدُ يُعكس إن لزم.
      return tx.bankTransaction.update({ where: { id: row.id }, data: { matchedLineId: null, matchedAt: null, matched: row.entryNo !== null } });
    });
  }

  /**
   * سطرُ كشفٍ بلا دفتر: يُرحَّل بطرفٍ يختاره المحاسب (رسمٌ · فائدةٌ · تحويلٌ لم يُسجَّل) بتاريخ السطر — والقيدُ يمرّ
   * بقفل الفترة وحارس الإقفال البنكيّ كأيِّ قيد — ثم يُطابَق بسطر البنك من القيد نفسِه.
   * **على مستوى المنشأة بحقّها**: سطرُ الكشف يُقرأ بمعرّفه في البنك المأذون، والقيدُ يُرحَّل على فرع البنك نفسِه —
   * فلا قراءةَ تتجاوز فرعَ القارئ.
   */
  postFromStatement(companyId: string, allowedBranchIds: string[] | 'all', bankId: string, transactionId: string, counterpartyAccountId: string | undefined, memo?: string, depositId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const bank = await this.bankOf(tx, allowedBranchIds, bankId);
      const row = await tx.bankTransaction.findFirst({ where: { id: transactionId, bankId } });
      if (!row || row.entryNo !== null) throw new NotFoundException(MSG.bank_transaction_not_found);
      if (row.matchedLineId) throw new ConflictException(MSG.reconciliation_already_matched);
      this.assertAfterClose(bank.reconciledUntil, row.date);

      // تأكيدُ إيداعِ درجٍ (⑦A3): الطرفُ «نقدٌ في الطريق» حتماً، والسطرُ بمبلغ الإيداع نفسِه — فلا يُؤكَّد إيداعٌ بسطرٍ غيرِه.
      const deposit = depositId
        ? await tx.cashDeposit.findUnique({ where: { id: depositId }, select: { id: true, no: true, amount: true, status: true, bankId: true } })
        : null;
      if (depositId && (!deposit || deposit.bankId !== bank.id)) throw new NotFoundException(MSG.cash_deposit_not_found);
      if (deposit && deposit.status !== 'IN_TRANSIT') throw new ConflictException(MSG.cash_deposit_not_in_transit);
      if (deposit && Math.abs(Number(deposit.amount) - Number(row.amount)) >= 0.005) {
        throw new ConflictException(formatMessage(MSG.reconciliation_deposit_amount, { statement: money(row.amount), no: deposit.no, deposit: money(deposit.amount) }));
      }
      const counterparty = deposit
        ? await getOrCreateAccountByCode(tx, companyId, CASH_IN_TRANSIT_CODE, CASH_IN_TRANSIT_NAME, 'asset')
        : await tx.account.findFirst({ where: { id: counterpartyAccountId ?? '' }, select: { id: true } });
      if (!counterparty) throw new NotFoundException(MSG.account_not_found);
      if (counterparty.id === bank.accountId) throw new BadRequestException(MSG.reconciliation_counterparty_is_bank);
      const posted = await postBankStatementLineEntry(tx, companyId, {
        bank: { id: bank.id, accountId: bank.accountId, branchId: bank.branchId },
        counterpartyAccountId: counterparty.id,
        date: row.date,
        amount: Number(row.amount),
        memo: memo?.trim() || (deposit ? `تأكيد إيداع ${deposit.no}` : row.description),
      });
      if (deposit) {
        await tx.cashDeposit.update({ where: { id: deposit.id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedTransactionId: row.id } });
      }
      return tx.bankTransaction.update({
        where: { id: row.id },
        data: { matchedLineId: posted.bankLineId, matchedAt: new Date(), matched: true, entryNo: posted.entryNo, source: row.source ?? (deposit ? 'cash-deposit' : 'statement') },
      });
    });
  }

  /**
   * الإقفالُ حتى تاريخ: لا سطرَ كشفٍ معلَّقاً حتى التاريخ — وإلا يُسمّى العددُ ويُرفض.
   * **على مستوى المنشأة بحقّها**: عدُّ المعلَّق في بنكٍ واحد فُحص فرعُه — الإقفالُ حالةُ البنك لا حالةُ فرع القارئ.
   */
  close(companyId: string, allowedBranchIds: string[] | 'all', bankId: string, until: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const bank = await this.bankOf(tx, allowedBranchIds, bankId);
      // Waits for postings, unmatches and edits holding the bank's shared lock, so the pending count below sees them.
      const reconciledUntil = await lockBankForReconciliationClose(tx, companyId, bank.id);
      const untilDate = new Date(until);
      if (reconciledUntil && untilDate < reconciledUntil) throw new ConflictException(MSG.reconciliation_close_backwards);
      // المعلَّقُ حتى التاريخ — يُسمّى في الرفض بعدده وأوّل تاريخٍ فيه (لا ترقيمٌ من العدّ — حارسُ ق-١٩٨ يقرأ count() ترقيماً).
      // (السطرُ المرحَّل من التسوية يحمل matchedLineId فلا يُعدّ معلَّقاً؛ والمرآةُ تحمل entryNo فلا تدخل.)
      const pendingRows = await tx.bankTransaction.findMany({ where: { bankId, entryNo: null, matchedLineId: null, date: { lte: untilDate } }, select: { id: true }, orderBy: { date: 'asc' } });
      if (pendingRows.length > 0) throw new ConflictException(formatMessage(MSG.reconciliation_pending_lines, { count: String(pendingRows.length), until }));
      const updated = await tx.bank.update({ where: { id: bank.id }, data: { reconciledUntil: untilDate }, select: { id: true, reconciledUntil: true } });
      return { bankId: updated.id, reconciledUntil: updated.reconciledUntil?.toISOString().slice(0, 10) ?? null };
    });
  }

  /** إعادةُ فتح الإقفال — فعلٌ مقصود بصلاحية المراجعة، كإعادة فتح الفترة. */
  reopen(companyId: string, allowedBranchIds: string[] | 'all', bankId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const bank = await this.bankOf(tx, allowedBranchIds, bankId);
      await tx.bank.update({ where: { id: bank.id }, data: { reconciledUntil: null } });
      return { bankId: bank.id, reconciledUntil: null };
    });
  }

  private assertAfterClose(reconciledUntil: Date | null, date: Date) {
    if (reconciledUntil && dayStartOf(date) <= dayEndOf(reconciledUntil)) {
      throw new ConflictException(formatMessage(MSG.reconciliation_locked, { until: reconciledUntil.toISOString().slice(0, 10) }));
    }
  }
}

export type ReconciliationLedgerRow = LedgerRow & { matched: boolean };
