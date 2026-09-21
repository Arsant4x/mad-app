import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertBranchAllowed, requestedBranchFilter } from '../branches/branch-scope.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postNetworkSettlementEntry, postNetworkSettlementVoidEntry } from '../journal/auto-posting.util';
import { getOrCreateInputVatAccount } from '../journal/inventory-accounts.util';
import {
  getOrCreateAccountByCode,
  NETWORK_FEE_EXPENSE_CODE,
  NETWORK_FEE_EXPENSE_NAME,
  NETWORK_RECEIVABLE_CODE,
  NETWORK_RECEIVABLE_NAME,
} from '../journal/pos-settlement.util';
import { readLedger } from '../reports/ledger.util';

/**
 * **تسويةُ الشبكة `1251`** (`ق-١٢٦١` ج — `domain-scan/07` A2).
 *
 * بيعُ البطاقة يُرحَّل **مديناً `1251` «مدينو شبكة المدفوعات»** (`ق-٣٠٩`) — ذمّةٌ على البنك المستحوذ حتى يحوّل.
 * ولم يكن لها مسارٌ يقفلها: الذمّةُ تتراكم إلى الأبد، والعمولةُ التي خصمها المستحوذ لا تُثبَت في شهرها. المسارُ
 * الآن **مستندٌ يطالب بسندات القبض** (`Payment.networkSettlementId` — بالمعرّف لا بالتاريخ وحدَه، `§6.3`):
 *
 *   `مدين البنك (الصافي) · مدين 5910 عمولاتُ الشبكة · مدين 1250 ضريبةُ المدخلات على العمولة · دائن 1251 (الإجمالي)`
 *
 * **والإجماليُّ من السندات لا من اليد**: ما رحّلته السنداتُ المطالَبُ بها على `1251` (مديناً موجباً، والعكسُ
 * والردُّ سالبَين) — فلا يُختم مستندٌ يخالف الدفتر. والعمولةُ وضريبتُها من إشعار المستحوذ يُدخلان يداً.
 * **والإلغاءُ عكسٌ لا محو** ويُعيد السنداتِ إلى المفتوح — ولا يُلغى ما طابقه كشفُ البنك (`⑦A1`).
 *
 * ⚠️ حدودٌ معلَنة: التغذيةُ من كشف المستحوذ (ملفّ) لاحقة · لا رمزَ ردٍّ (chargeback) مستقلّ — الردُّ عبر الشبكة
 * سندُ ردٍّ يحمل سالباً على `1251` فتأخذه التسويةُ التالية · سطرٌ على `1251` بلا سند (قيدٌ يدويّ) لا تطالب به
 * التسويةُ ويُعلَن فرقاً بين الدفتر والمفتوح · رمزُ `5910` مشتقٌّ من موضعه بعد `5900` «أو ما يُقرَّر».
 */
type Tx = Prisma.TransactionClient;

interface OpenReceipt {
  id: string;
  no: string;
  date: Date;
  branchId: string | null;
  customerName: string;
  /** ما رحّله السندُ على `1251`: موجبٌ للقبض، سالبٌ للعكس والردّ. */
  signed: number;
}

@Injectable()
export class NetworkSettlementsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** `NS-YYYY-NNNN` — من العدّاد الذرّيّ (`ق-٣٢٨`). */
  private nextNumber(tx: Tx, companyId: string, date: Date): Promise<string> {
    return nextDocumentNumber(tx, companyId, date, { kind: 'NS', pad: 4 }, (prefix) => highestSequenceOf(tx.networkSettlement, prefix));
  }

  /**
   * السنداتُ المفتوحة على الشبكة: سندُ قبضٍ بطريقة الشبكة لم تطالب به تسوية، ومبلغُه **ما رحّله على `1251`**
   * (لا `amount` — فالعكسُ والردُّ سالبان بالدفتر). تُقرأ بفروع القارئ عبر فرع السند.
   */
  private async openReceipts(tx: Tx, allowedBranchIds: string[] | 'all', range: { from?: Date; to?: Date; branchId?: string }): Promise<OpenReceipt[]> {
    const scope = requestedBranchFilter(allowedBranchIds, range.branchId);
    const network = await tx.account.findFirst({ where: { code: NETWORK_RECEIVABLE_CODE }, select: { id: true } });
    if (!network) return [];
    const payments = await tx.payment.findMany({
      where: {
        method: 'CARD',
        networkSettlementId: null,
        journalEntryId: { not: null },
        ...(range.from ? { date: { gte: range.from } } : {}),
        ...(range.to ? { date: { ...(range.from ? { gte: range.from } : {}), lte: range.to } } : {}),
        ...scope,
      },
      select: {
        id: true,
        no: true,
        date: true,
        branchId: true,
        customer: { select: { name: true } },
        journalEntry: { select: { lines: { where: { accountId: network.id }, select: { debit: true, credit: true } } } },
      },
      orderBy: [{ date: 'asc' }, { no: 'asc' }],
    });
    return payments
      .map((p) => ({
        id: p.id,
        no: p.no,
        date: p.date,
        branchId: p.branchId,
        customerName: p.customer.name,
        signed: round2((p.journalEntry?.lines ?? []).reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0)),
      }))
      .filter((p) => p.signed !== 0);
  }

  /** رصيدُ `1251` بالدفتر مقابل مجموع المفتوح — الفرقُ يُعلَن (سطرٌ بلا سند · تسويةٌ يدوية) ولا يُصحَّح. */
  private async transitSummary(tx: Tx, allowedBranchIds: string[] | 'all') {
    const network = await tx.account.findFirst({ where: { code: NETWORK_RECEIVABLE_CODE }, select: { id: true } });
    const ledger = network ? (await readLedger(tx, { allowedBranchIds, accountId: network.id }, 'debit')).closing : money(0);
    const open = await this.openReceipts(tx, allowedBranchIds, {});
    const openTotal = round2(open.reduce((t, r) => t + r.signed, 0));
    return { ledger, open: money(openTotal), openCount: open.length, matched: Math.abs(Number(ledger) - openTotal) < 0.005 };
  }

  /**
   * المفتوحُ في مدى: ما ستطالب به تسويةٌ لهذا المدى وإجماليُّه — تقرؤه الشاشةُ قبل الإنشاء.
   * **على مستوى المنشأة بحقّها**: السنداتُ تُرشَّح بفروع القارئ في `openReceipts`، ومحرّكُ الأستاذ يرشّح بنفسه.
   */
  open(companyId: string, allowedBranchIds: string[] | 'all', q: { from?: string; to?: string; branchId?: string }) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      if (q.branchId) assertBranchAllowed(allowedBranchIds, q.branchId);
      const receipts = await this.openReceipts(tx, allowedBranchIds, { from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, branchId: q.branchId });
      const gross = round2(receipts.reduce((t, r) => t + r.signed, 0));
      return {
        receipts: receipts.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10), signed: money(r.signed) })),
        gross: money(gross),
        summary: await this.transitSummary(tx, allowedBranchIds),
      };
    });
  }

  /**
   * القائمة مع ملخّص `1251`.
   * **على مستوى المنشأة بحقّها**: التسوياتُ تُقرأ بفروع القارئ عبر حقل الفرع على المستند.
   */
  list(companyId: string, allowedBranchIds: string[] | 'all', bankId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const items = await tx.networkSettlement.findMany({
        where: {
          ...(bankId ? { bankId } : {}),
          ...(allowedBranchIds === 'all' ? {} : { OR: [{ branchId: { in: allowedBranchIds } }, { branchId: null }] }),
        },
        include: { bank: { select: { id: true, name: true } }, _count: { select: { receipts: true } } },
        orderBy: [{ date: 'desc' }, { no: 'desc' }],
      });
      return {
        items: items.map((s) => this.present(s)),
        summary: await this.transitSummary(tx, allowedBranchIds),
      };
    });
  }

  /**
   * التسوية: تطالب بسندات المدى (أو بما سُمّي منها)، الإجماليُّ من الدفتر، والصافي = الإجمالي − العمولة − ضريبتها.
   * **على مستوى المنشأة بحقّها**: البنكُ بمعرّفه، والسنداتُ بفروع القارئ، وفرعُ المستند يُفحص على فروعه.
   */
  create(
    companyId: string,
    allowedBranchIds: string[] | 'all',
    dto: { bankId: string; date: string; periodFrom: string; periodTo: string; feeAmount: number; feeVatAmount: number; branchId?: string; memo?: string; receiptIds?: string[] },
  ) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const bank = await tx.bank.findUnique({ where: { id: dto.bankId }, select: { id: true, name: true, accountId: true, branchId: true, currency: true, deletedAt: true } });
      if (!bank || bank.deletedAt) throw new NotFoundException(MSG.bank_not_found);
      // الشبكةُ بالعملة الأساسية: بنكٌ بعملةٍ أخرى يحتاج سعرَ يومٍ وفرقَ صرفٍ لم يُبنيا هنا — حدٌّ معلَن لا افتراض.
      const company = await tx.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });
      if (company && bank.currency !== company.baseCurrency) {
        throw new BadRequestException(formatMessage(MSG.network_settlement_bank_currency, { bank: bank.name, currency: bank.currency }));
      }
      if (dto.branchId) assertBranchAllowed(allowedBranchIds, dto.branchId);
      const periodFrom = new Date(dto.periodFrom);
      const periodTo = new Date(dto.periodTo);
      if (periodTo < periodFrom) throw new BadRequestException(MSG.network_settlement_period_backwards);
      const date = new Date(dto.date);
      const fee = round2(dto.feeAmount);
      const feeVat = round2(dto.feeVatAmount);
      if (fee < 0 || feeVat < 0) throw new BadRequestException(MSG.network_settlement_fee_negative);

      const candidates = await this.openReceipts(tx, allowedBranchIds, { from: periodFrom, to: periodTo, branchId: dto.branchId });
      let claimed = candidates;
      if (dto.receiptIds?.length) {
        const wanted = new Set(dto.receiptIds);
        claimed = candidates.filter((r) => wanted.has(r.id));
        const missing = dto.receiptIds.filter((id) => !claimed.some((r) => r.id === id));
        if (missing.length) throw new ConflictException(formatMessage(MSG.network_settlement_receipt_not_open, { count: String(missing.length) }));
      }
      const gross = round2(claimed.reduce((t, r) => t + r.signed, 0));
      if (claimed.length === 0 || gross <= 0) throw new ConflictException(MSG.network_settlement_nothing_open);
      const net = round2(gross - fee - feeVat);
      if (net <= 0) throw new BadRequestException(formatMessage(MSG.network_settlement_fee_exceeds_gross, { gross: money(gross), fee: money(round2(fee + feeVat)) }));

      const network = await getOrCreateAccountByCode(tx, companyId, NETWORK_RECEIVABLE_CODE, NETWORK_RECEIVABLE_NAME, 'asset');
      const feeAccount = await getOrCreateAccountByCode(tx, companyId, NETWORK_FEE_EXPENSE_CODE, NETWORK_FEE_EXPENSE_NAME, 'expense');
      const inputVatAccountId = feeVat > 0 ? await getOrCreateInputVatAccount(tx, companyId) : null;
      const no = await this.nextNumber(tx, companyId, date);
      const memo = dto.memo?.trim() || `تسوية شبكة ${no} — ${dto.periodFrom} إلى ${dto.periodTo} — ${bank.name}`;
      const entry = await postNetworkSettlementEntry(tx, companyId, {
        no,
        date,
        memo,
        branchId: dto.branchId ?? null,
        bank: { id: bank.id, accountId: bank.accountId, currency: bank.currency },
        networkAccountId: network.id,
        feeAccountId: feeAccount.id,
        inputVatAccountId,
        gross,
        fee,
        feeVat,
        net,
      });
      const created = await tx.networkSettlement.create({
        data: {
          no,
          date,
          periodFrom,
          periodTo,
          grossAmount: gross,
          feeAmount: fee,
          feeVatAmount: feeVat,
          netAmount: net,
          memo,
          bankId: bank.id,
          branchId: dto.branchId ?? null,
          journalEntryId: entry.id,
        } as unknown as Prisma.NetworkSettlementUncheckedCreateInput,
        include: { bank: { select: { id: true, name: true } }, _count: { select: { receipts: true } } },
      });
      // المطالبةُ بالمعرّف: السندُ الذي طالبت به تسويةٌ لا تراه أخرى.
      await tx.payment.updateMany({ where: { id: { in: claimed.map((r) => r.id) }, networkSettlementId: null }, data: { networkSettlementId: created.id } });
      return { ...this.present({ ...created, _count: { receipts: claimed.length } }), entryNo: entry.no };
    });
  }

  /**
   * الإلغاءُ عكسٌ لا محو: يُعيد `1251` والبنكَ والعمولةَ، ويُطلق السنداتِ إلى المفتوح. ولا يُلغى ما طابقه كشفُ
   * البنك — يُفكّ من التسوية البنكية أولاً — ولا ما وقع قبل إقفال التسوية (يرفضه مسارُ الترحيل).
   * **على مستوى المنشأة بحقّها**: مستندٌ واحد بمعرّفه، وفرعُه يُفحص على فروع القارئ.
   */
  void(companyId: string, allowedBranchIds: string[] | 'all', id: string, reason?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const settlement = await tx.networkSettlement.findUnique({
        where: { id },
        include: { bank: { select: { id: true, name: true, accountId: true, currency: true } }, journalEntry: { select: { no: true, lines: { select: { id: true, accountId: true } } } } },
      });
      if (!settlement) throw new NotFoundException(MSG.network_settlement_not_found);
      if (settlement.branchId) assertBranchAllowed(allowedBranchIds, settlement.branchId);
      if (settlement.status !== 'POSTED') throw new ConflictException(MSG.network_settlement_not_voidable);
      const bankLine = settlement.journalEntry?.lines.find((l) => l.accountId === settlement.bank.accountId);
      if (bankLine) {
        const matched = await tx.bankTransaction.findFirst({ where: { matchedLineId: bankLine.id }, select: { id: true } });
        if (matched) throw new ConflictException(formatMessage(MSG.network_settlement_matched, { no: settlement.no }));
      }
      const network = await getOrCreateAccountByCode(tx, companyId, NETWORK_RECEIVABLE_CODE, NETWORK_RECEIVABLE_NAME, 'asset');
      const feeAccount = await getOrCreateAccountByCode(tx, companyId, NETWORK_FEE_EXPENSE_CODE, NETWORK_FEE_EXPENSE_NAME, 'expense');
      const feeVat = Number(settlement.feeVatAmount);
      const inputVatAccountId = feeVat > 0 ? await getOrCreateInputVatAccount(tx, companyId) : null;
      const entry = await postNetworkSettlementVoidEntry(tx, companyId, {
        no: settlement.no,
        memo: reason?.trim() || `إلغاء تسوية شبكة ${settlement.no}`,
        branchId: settlement.branchId,
        bank: { id: settlement.bank.id, accountId: settlement.bank.accountId, currency: settlement.bank.currency },
        networkAccountId: network.id,
        feeAccountId: feeAccount.id,
        inputVatAccountId,
        gross: Number(settlement.grossAmount),
        fee: Number(settlement.feeAmount),
        feeVat,
        net: Number(settlement.netAmount),
        reversalOfId: settlement.journalEntryId,
      });
      await tx.payment.updateMany({ where: { networkSettlementId: id }, data: { networkSettlementId: null } });
      const voided = await tx.networkSettlement.update({
        where: { id },
        data: { status: 'VOID', voidJournalEntryId: entry.id },
        include: { bank: { select: { id: true, name: true } }, _count: { select: { receipts: true } } },
      });
      return { ...this.present(voided), voidEntryNo: entry.no };
    });
  }

  private present(s: {
    id: string;
    no: string;
    date: Date;
    periodFrom: Date;
    periodTo: Date;
    grossAmount: Prisma.Decimal | number;
    feeAmount: Prisma.Decimal | number;
    feeVatAmount: Prisma.Decimal | number;
    netAmount: Prisma.Decimal | number;
    memo: string | null;
    status: string;
    branchId: string | null;
    bankId: string;
    journalEntryId: string | null;
    voidJournalEntryId: string | null;
    bank: { id: string; name: string };
    _count: { receipts: number };
  }) {
    const day = (d: Date) => d.toISOString().slice(0, 10);
    return {
      id: s.id,
      no: s.no,
      date: day(s.date),
      periodFrom: day(s.periodFrom),
      periodTo: day(s.periodTo),
      grossAmount: money(s.grossAmount),
      feeAmount: money(s.feeAmount),
      feeVatAmount: money(s.feeVatAmount),
      netAmount: money(s.netAmount),
      memo: s.memo,
      status: s.status,
      branchId: s.branchId,
      bankId: s.bankId,
      bank: s.bank,
      journalEntryId: s.journalEntryId,
      voidJournalEntryId: s.voidJournalEntryId,
      receiptCount: s._count.receipts,
    };
  }
}
