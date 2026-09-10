import { BadRequestException, ConflictException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ClaimKind, DeductionKind, DepositType, Prisma, Property, Unit } from '@prisma/client';
import { documentYear } from '../common/document-year.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import {
  postClaimIssueEntry,
  postKeyMoneyEntry,
  postClaimPaymentEntry,
  postClaimWaiverEntry,
  postContractSettlementEntry,
  postDepositReceiptEntry,
  postDepositSettlementEntry,
  postRentPaymentEntry,
} from '../journal/auto-posting.util';
import { activeReservationForUnit, expireStaleReservations } from '../reservations/reservations.service';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { CreateClaimDto, PayClaimDto, WaiveClaimDto } from './dto/claim.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { ListContractsQueryDto } from './dto/list-contracts-query.dto';
import { CreateHandoverDto, HandoverItemDto, SignHandoverDto, UpdateHandoverDto } from './dto/handover.dto';
import { RecordKeyMoneyDto } from './dto/key-money.dto';
import { RecordDepositDto, SettleDepositDto } from './dto/deposit.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { generateInstallmentSchedule } from './installment-schedule.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { FilesService } from '../files/files.service';
import { round2, formatMoney } from '../common/money/rounding';
import { moneyEquals, sumMoney } from '../common/money/allocation';

const CONTRACT_INCLUDE = {
  unit: { include: { property: true } },
  installments: { orderBy: { dueDate: 'asc' as const } },
  payments: { orderBy: { date: 'desc' as const } },
  deposits: { include: { deductions: true }, orderBy: { receivedAt: 'asc' as const } },
  settlementLines: { orderBy: { createdAt: 'asc' as const } },
  claims: { orderBy: { issuedAt: 'desc' as const } },
  keyMoney: { orderBy: { paidAt: 'asc' as const } },
  // photos عبر select صريح: fileKey مفتاح تخزين داخلي لا يغادر الخادم —
  // التنزيل عبر رابط موقَّع فقط (اكتشاف المراجعة).
  handovers: {
    include: {
      items: { orderBy: { createdAt: 'asc' as const } },
      photos: { select: { id: true, handoverId: true, itemId: true, filename: true, size: true, mimeType: true, note: true, uploadedAt: true } },
    },
    orderBy: { date: 'asc' as const },
  },
};

/** Arabic labels for the ledger memo — permanent record, so not translated at
 * read time. Same reasoning as DEPOSIT_TYPE_LABEL below. */
const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  MAINTENANCE: 'صيانة',
  UTILITIES: 'فواتير خدمات',
  LATE_FEE: 'غرامة تأخير',
  DAMAGE: 'أضرار',
  OTHER: 'أخرى',
};

/** Arabic labels for the journal memo. Kept here rather than in the message
 * catalog: a posted entry's memo is a permanent ledger record, so it must not
 * change when a *reader* switches language. */
const DEPOSIT_TYPE_LABEL: Record<DepositType, string> = {
  RENT: 'تأمين إيجار',
  FACILITY: 'تأمين منشأة',
};

/** Unpaid rent settles a receivable that was already recognized as revenue;
 * everything else is income the landlord keeps. This split is the whole reason
 * a deduction carries a kind rather than just an amount. */
function deductionTarget(kind: DeductionKind): 'receivable' | 'income' {
  return kind === 'UNPAID_RENT' ? 'receivable' : 'income';
}

/** Maps a Unit's free-text `type` to the same activity-type space as
 * Property.activityType, so the two can be compared. Custom/unrecognized
 * unit types simply skip the check (see validateContract) — there's no way
 * to validate an arbitrary free-text type against the fixed property enum. */
const UNIT_TYPE_TO_ACTIVITY: Record<string, string> = {
  'سكني': 'residential',
  'محل': 'shop',
  'معرض': 'showroom',
  'مكتب': 'office',
  'مخزن': 'warehouse',
};

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
  ) {}

  list(companyId: string, query: ListContractsQueryDto = {}) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => this.listRefreshed(tx, query));
  }

  findOne(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.refreshInstallmentStatuses(tx, id);
      const contract = await tx.contract.findUnique({ where: { id }, include: CONTRACT_INCLUDE });
      if (!contract) throw new NotFoundException(MSG.contract_not_found);
      return contract;
    });
  }

  create(companyId: string, dto: CreateContractDto) {
    const { currency, exchangeRate } = resolveCurrency(dto);
    // Retries the whole transaction on a "no" collision from a concurrent
    // create — same reasoning as InvoicesService.create.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const unit = await tx.unit.findUnique({ where: { id: dto.unitId }, include: { property: true } });
        if (!unit) throw new NotFoundException(MSG.unit_not_found);

        const start = new Date(dto.start);
        const end = new Date(dto.end);
        const isDraft = dto.draft ?? false;
        if (!isDraft) await this.validateContract(tx, unit, unit.property, start, end, dto.tenant);

        const no = await this.nextContractNumber(tx, companyId, start);
        const customerId = isDraft ? null : (await this.syncTenantCustomer(tx, dto.tenant, dto.phone)).id;

        const created = await tx.contract.create({
          data: {
            unitId: dto.unitId,
            customerId,
            no,
            ejarNo: dto.ejarNo,
            tenant: dto.tenant,
            phone: dto.phone,
            value: dto.value,
            cycle: dto.cycle,
            start,
            end,
            deposit: dto.deposit ?? 0,
            services: dto.services,
            furnished: dto.furnished,
            status: isDraft ? 'DRAFT' : 'DUE',
            currency,
            exchangeRate,
            baseValue: toBaseAmount(dto.value, exchangeRate),
          } as unknown as Prisma.ContractUncheckedCreateInput,
        });

        if (!isDraft) {
          const schedule = generateInstallmentSchedule(start, end, dto.value, dto.cycle);
          await tx.installment.createMany({
            // Installments inherit the contract's currency and rate — they're
            // just a schedule of the same obligation, not separate deals.
            data: schedule.map((s) => ({
              contractId: created.id,
              dueDate: s.dueDate,
              amount: s.amount,
              // فترةُ الخدمة تُثبَّت لحظةَ التوليد ولا تُشتقّ لاحقاً (ق-٤٧٥/②).
              serviceStart: s.serviceStart,
              serviceEnd: s.serviceEnd,
              currency,
              exchangeRate,
              baseAmount: toBaseAmount(s.amount, exchangeRate),
            })) as unknown as Prisma.InstallmentUncheckedCreateInput[],
          });

          // Matches the mockup: creating a live (non-draft) contract for a
          // unit that carries a matching-name active reservation converts
          // that reservation rather than leaving it dangling — mismatched
          // names were already rejected above by validateContract.
          const rsv = await activeReservationForUnit(tx, dto.unitId);
          if (rsv) await tx.reservation.update({ where: { id: rsv.id }, data: { status: 'CONVERTED' } });
        }

        return tx.contract.findUniqueOrThrow({ where: { id: created.id }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateContractDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.contract.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.contract_not_found);

      const data: Prisma.ContractUncheckedUpdateInput = {};
      if (dto.tenant !== undefined) data.tenant = dto.tenant;
      if (dto.phone !== undefined) data.phone = dto.phone;
      if (dto.services !== undefined) data.services = dto.services;
      if (dto.furnished !== undefined) data.furnished = dto.furnished;
      if (dto.ejarNo !== undefined) data.ejarNo = dto.ejarNo;

      return tx.contract.update({ where: { id }, data, include: CONTRACT_INCLUDE });
    });
  }

  cancel(companyId: string, id: string, dto: CancelContractDto) {
    // Retries on a journal-entry "no" collision when a settlement is posted.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const existing = await tx.contract.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException(MSG.contract_not_found);
        if (existing.status === 'CANCELLED') throw new ConflictException(MSG.contract_already_cancelled);

        const cancelDate = new Date(dto.cancelDate);

        // Worked out **before** the installments are touched: 'all' and
        // 'installments' read the very rows that `installmentDisposition:
        // 'cancel'` is about to void, and voiding them first would settle at
        // zero.
        const settlementAmount = await this.resolveSettlementAmount(tx, id, cancelDate, dto);
        // بنود التسوية (§16): التفصيل لا يغيّر المبلغ — يشرحه. مجموعٌ لا
        // يساويه = خطأ إدخال يُرفض قبل أي أثر.
        if (dto.settlementLines?.length) {
          // الجمع مدوَّرٌ عند كل تراكم والمقارنة بالتسامح المركزي — وكانت هنا
          // عتبةٌ مكتوبةٌ بيد على جمعٍ عائم، وهو ما كان يخترعه كل ملف لنفسه.
          if (!moneyEquals(sumMoney(dto.settlementLines.map((l) => l.amount)), settlementAmount)) {
            throw new BadRequestException(MSG.settlement_lines_mismatch);
          }
        }
        const settlementEntry =
          settlementAmount > 0
            ? await postContractSettlementEntry(tx, companyId, {
                unitId: existing.unitId,
                contractNo: existing.no,
                tenant: existing.tenant,
                date: cancelDate,
                baseAmount: toBaseAmount(settlementAmount, Number(existing.exchangeRate)),
              })
            : null;

        const data: Prisma.ContractUncheckedUpdateInput = {
          status: 'CANCELLED',
          cancelDate,
          cancelReason: dto.cancelReason,
          ...(settlementAmount > 0 ? { settlementAmount, settlementEntryId: settlementEntry?.id ?? null } : {}),
        };
        // Shrinking `end` to the cancel date is what frees the unit up again —
        // UnitsService's status check only looks at contracts still covering
        // today (start <= today <= end).
        if (cancelDate < existing.end) data.end = cancelDate;

        await tx.contract.update({ where: { id }, data });

        if (dto.settlementLines?.length) {
          await tx.contractSettlementLine.createMany({
            data: dto.settlementLines.map((l) => ({ companyId, contractId: id, label: l.label, amount: l.amount })),
          });
        }

        if (dto.installmentDisposition === 'cancel') {
          await tx.installment.updateMany({
            where: { contractId: id, status: { in: ['DUE', 'LATE'] }, dueDate: { gte: cancelDate } },
            data: { status: 'CANCELLED' },
          });
        }

        return tx.contract.findUniqueOrThrow({ where: { id }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  /** Turns the chosen basis into a figure. Returns 0 for 'none', and for the
   * installment-derived bases when nothing is left unpaid — cancelling a fully
   * paid lease owes nothing. */
  private async resolveSettlementAmount(tx: Prisma.TransactionClient, contractId: string, cancelDate: Date, dto: CancelContractDto): Promise<number> {
    const basis = dto.settlementBasis ?? 'none';
    if (basis === 'none') return 0;
    if (basis === 'amount') return dto.settlementAmount ?? 0;

    const remaining = await tx.installment.findMany({
      where: { contractId, status: { in: ['DUE', 'LATE'] }, dueDate: { gte: cancelDate } },
      orderBy: { dueDate: 'asc' },
      ...(basis === 'installments' ? { take: dto.settlementInstallments } : {}),
      select: { amount: true },
    });

    return round2(remaining.reduce((sum, i) => sum + Number(i.amount), 0));
  }

  recordPayment(companyId: string, contractId: string, dto: RecordPaymentDto) {
    // Retries on a journal-entry "no" collision from a concurrent payment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);

        let installment = null;
        if (dto.installmentId) {
          installment = await tx.installment.findUnique({ where: { id: dto.installmentId } });
          if (!installment || installment.contractId !== contractId) throw new NotFoundException(MSG.installment_not_found);
        }

        if (dto.method === 'BANK' && !dto.bankId) throw new BadRequestException(MSG.bank_required);
        // A bankId is honoured for **either** method: a bank transfer names the
        // account, and a cash receipt may name the branch cash box it landed in
        // (a cash box is just a Bank record pointed at a branch — CLAUDE.md 6.8).
        // Either way the balance moves and a transaction is written, so a
        // branch's cash box reflects real money rather than only the GL account.
        const bank = dto.bankId ? await tx.bank.findUnique({ where: { id: dto.bankId } }) : null;
        if (dto.bankId && !bank) throw new NotFoundException(MSG.bank_not_found);

        // A payment defaults to the contract's currency/rate, but can carry
        // its own — the gap between the rate the contract was priced at and
        // the one it settles at is the realized FX gain/loss.
        const payCurrency = dto.currency?.trim() || contract.currency;
        const payRate = dto.exchangeRate ?? Number(contract.exchangeRate);

        const discount = dto.discount ?? 0;
        const netAmount = round2(dto.amount - discount);
        if (netAmount <= 0) throw new BadRequestException(MSG.payment_net_must_be_positive);

        const journalEntry = await postRentPaymentEntry(tx, companyId, {
          unitId: contract.unitId,
          contractNo: contract.no,
          tenant: contract.tenant,
          date: new Date(dto.date),
          baseNetAmount: toBaseAmount(netAmount, payRate),
          // Priced at the contract's rate — but only when the payment is in
          // the contract's own currency. A payment made in a different
          // currency altogether has no rate difference to recognize.
          baseExpectedAmount:
            payCurrency === contract.currency ? toBaseAmount(netAmount, Number(contract.exchangeRate)) : toBaseAmount(netAmount, payRate),
          // (ق-٢٧٧) الطرفُ المدين حسابُ البنك حين يُقبض الإيجارُ على بنك — لا `1000`.
          cashAccountId: bank?.accountId ?? null,
        });

        if (bank) {
          await tx.bank.update({ where: { id: bank.id }, data: { balance: { increment: netAmount } } });
          await tx.bankTransaction.create({
            data: {
              bankId: bank.id,
              date: new Date(dto.date),
              description: `دفعة إيجار — عقد ${contract.no} — ${contract.tenant}`,
              amount: netAmount,
              source: 'rent',
              matched: !!journalEntry,
              entryNo: journalEntry?.no ?? null,
              currency: payCurrency,
              exchangeRate: payRate,
              baseAmount: toBaseAmount(netAmount, payRate),
            } as unknown as Prisma.BankTransactionUncheckedCreateInput,
          });
        }

        const payment = await tx.rentPayment.create({
          data: {
            contractId,
            installmentId: dto.installmentId,
            date: new Date(dto.date),
            amount: dto.amount,
            discount,
            netAmount,
            method: dto.method,
            // Records which money-holder took it — the bank account for a
            // transfer, or the branch cash box for a cash receipt.
            bankId: bank ? bank.id : undefined,
            notes: dto.notes,
            journalEntryId: journalEntry?.id,
            currency: payCurrency,
            exchangeRate: payRate,
            baseAmount: toBaseAmount(dto.amount, payRate),
            baseDiscount: toBaseAmount(discount, payRate),
            baseNetAmount: toBaseAmount(netAmount, payRate),
          } as unknown as Prisma.RentPaymentUncheckedCreateInput,
        });

        if (installment) {
          await tx.installment.update({ where: { id: installment.id }, data: { status: 'PAID' } });
        }

        return tx.rentPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { installment: true } });
      }),
    );
  }

  private async validateContract(tx: Prisma.TransactionClient, unit: Unit, property: Property, start: Date, end: Date, tenantName: string, excludeContractId?: string): Promise<void> {
    if (start > end) throw new BadRequestException(MSG.contract_start_after_end);

    if (property.activityType && property.activityType !== 'mixed') {
      const mapped = UNIT_TYPE_TO_ACTIVITY[unit.type];
      if (mapped && mapped !== property.activityType) {
        throw new ConflictException(MSG.unit_type_activity_mismatch);
      }
    }
    if (property.activityType === 'residential' && property.activitySubtype && unit.subtype && unit.subtype !== property.activitySubtype) {
      throw new ConflictException(MSG.unit_subtype_mismatch);
    }
    if (property.ownership === 'leased' && property.leaseStart && property.leaseEnd) {
      if (start < property.leaseStart || end > property.leaseEnd) {
        throw new ConflictException(MSG.contract_outside_head_lease);
      }
    }

    const overlapping = await tx.contract.findFirst({
      where: {
        unitId: unit.id,
        status: { not: 'CANCELLED' },
        ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
        start: { lte: end },
        end: { gte: start },
      },
    });
    if (overlapping) throw new ConflictException(formatMessage(MSG.contract_dates_overlap, { contractNo: overlapping.no }));

    await expireStaleReservations(tx);
    const activeRsv = await activeReservationForUnit(tx, unit.id);
    if (activeRsv && activeRsv.name.trim() !== tenantName.trim()) {
      throw new ConflictException(
        formatMessage(MSG.reservation_name_mismatch, {
          name: activeRsv.name,
          expiryDate: activeRsv.expiryDate.toISOString().slice(0, 10),
        }),
      );
    }
  }

  private async syncTenantCustomer(tx: Prisma.TransactionClient, name: string, phone?: string) {
    const existing = await tx.customer.findFirst({ where: { name } });
    if (existing) {
      if (phone && phone !== existing.phone) {
        return tx.customer.update({ where: { id: existing.id }, data: { phone } });
      }
      return existing;
    }
    return tx.customer.create({ data: { name, phone } as unknown as Prisma.CustomerCreateInput });
  }

  /**
   * Renews a lease: a **new** contract that carries the tenancy forward, linked
   * back to the one it replaces.
   *
   * Not an edit of the old contract. The expiring one keeps its own installments
   * and payment history — that record is what a dispute is settled against, and
   * stretching its dates would erase it.
   *
   * The renewal is created as UPCOMING when its term hasn't started yet: signed
   * and certain, unlike a DRAFT which may never happen. It becomes DUE by the
   * same date-driven refresh that already moves DUE to LATE.
   */
  renew(companyId: string, id: string, dto: RenewContractDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const source = await tx.contract.findUnique({ where: { id }, include: { unit: { include: { property: true } }, renewedTo: true } });
        if (!source) throw new NotFoundException(MSG.contract_not_found);
        if (source.status === 'CANCELLED') throw new ConflictException(MSG.contract_cancelled_cannot_renew);
        // The unique constraint would catch this too, but as an opaque 500.
        if (source.renewedTo) throw new ConflictException(formatMessage(MSG.contract_already_renewed, { contractNo: source.renewedTo.no }));

        const start = new Date(dto.start);
        const end = new Date(dto.end);
        if (start <= source.start) throw new BadRequestException(MSG.renewal_must_start_after_source);

        // The renewal is a real tenancy on the same unit, so it goes through
        // the same overlap and activity checks as any other contract. The
        // source itself is excluded: a renewal starting the day after it ends
        // is precisely the point, and an early renewal signed while the old
        // lease still runs must not collide with it either.
        await this.validateContract(tx, source.unit, source.unit.property, start, end, source.tenant, source.id);

        const value = dto.value ?? Number(source.value);
        const cycle = dto.cycle ?? source.cycle;
        // التجديد: بادئته من بداية العقد **الجديد** لا الأصل — فهو مستندٌ قائم
        // بذاته بمدّته الخاصة.
        const no = dto.no?.trim() || (await this.nextContractNumber(tx, companyId, start));
        if (dto.no?.trim()) {
          const taken = await tx.contract.findFirst({ where: { no } });
          if (taken) throw new ConflictException(formatMessage(MSG.contract_no_taken, { contractNo: no }));
        }

        const exchangeRate = Number(source.exchangeRate);
        const created = await tx.contract.create({
          data: {
            unitId: source.unitId,
            customerId: source.customerId,
            no,
            ejarNo: dto.ejarNo ?? null,
            tenant: source.tenant,
            phone: source.phone,
            value,
            cycle,
            start,
            end,
            // The agreed deposit figure carries over as-is; whether the money
            // itself moves is `carryDeposits` below.
            deposit: source.deposit,
            services: source.services,
            furnished: source.furnished,
            status: start > new Date() ? 'UPCOMING' : 'DUE',
            currency: source.currency,
            exchangeRate,
            baseValue: toBaseAmount(value, exchangeRate),
            renewedFromId: source.id,
          } as unknown as Prisma.ContractUncheckedCreateInput,
        });

        const schedule = generateInstallmentSchedule(start, end, value, cycle);
        await tx.installment.createMany({
          data: schedule.map((s) => ({
            contractId: created.id,
            dueDate: s.dueDate,
            amount: s.amount,
            // كسابقتها في `create` — الفترةُ تُثبَّت لا تُشتقّ (ق-٤٧٥/②).
            serviceStart: s.serviceStart,
            serviceEnd: s.serviceEnd,
            currency: source.currency,
            exchangeRate,
            baseAmount: toBaseAmount(s.amount, exchangeRate),
          })) as unknown as Prisma.InstallmentUncheckedCreateInput[],
        });

        // Carrying a deposit forward posts **nothing**: the cash never moved,
        // and the liability is the same one — only the lease it secures
        // changed. Refunding and re-collecting it on paper would invent two
        // cash movements that never happened.
        if (dto.carryDeposits ?? true) {
          await tx.contractDeposit.updateMany({
            where: { contractId: source.id, status: 'HELD' },
            data: { contractId: created.id },
          });
        }

        return tx.contract.findUniqueOrThrow({ where: { id: created.id }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  /**
   * Creates a condition-of-unit form as a draft.
   *
   * Nothing is posted: a handover is a record of state, not a financial event.
   * What it feeds is the *argument* over a later deposit deduction.
   */
  createHandover(companyId: string, contractId: string, dto: CreateHandoverDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new NotFoundException(MSG.contract_not_found);

      const created = await tx.contractHandover.create({
        data: {
          contractId,
          type: dto.type,
          date: new Date(dto.date),
          electricityMeter: dto.electricityMeter?.trim() || null,
          waterMeter: dto.waterMeter?.trim() || null,
          notes: dto.notes?.trim() || null,
        } as unknown as Prisma.ContractHandoverUncheckedCreateInput,
      });

      await this.replaceHandoverItems(tx, created.id, dto.items);
      return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
    });
  }

  /** Draft only — see `assertHandoverEditable`. */
  updateHandover(companyId: string, contractId: string, handoverId: string, dto: UpdateHandoverDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const handover = await this.loadEditableHandover(tx, contractId, handoverId);

      await tx.contractHandover.update({
        where: { id: handover.id },
        data: {
          ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
          ...(dto.electricityMeter !== undefined ? { electricityMeter: dto.electricityMeter.trim() || null } : {}),
          ...(dto.waterMeter !== undefined ? { waterMeter: dto.waterMeter.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        },
      });

      if (dto.items) await this.replaceHandoverItems(tx, handover.id, dto.items);
      return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
    });
  }

  /**
   * Signs the form and freezes it.
   *
   * `signedAt` is the **server's** clock, never the caller's. A document whose
   * purpose is to be unarguable later cannot let one side choose the time it
   * claims to have been signed.
   */
  signHandover(companyId: string, contractId: string, handoverId: string, dto: SignHandoverDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const handover = await this.loadEditableHandover(tx, contractId, handoverId);

      await tx.contractHandover.update({
        where: { id: handover.id },
        data: { status: 'SIGNED', signedAt: new Date(), signedBy: dto.signedBy.trim() },
      });

      return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
    });
  }

  /** Deleting is a draft-only operation for the same reason editing is. */
  async deleteHandover(companyId: string, contractId: string, handoverId: string) {
    const { photoKeys, refreshed } = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const handover = await this.loadEditableHandover(tx, contractId, handoverId);
      // صور المسودة تُحذف صفوفها بالتتالي — نلتقط مفاتيح كائناتها قبل ذلك
      // كي لا تبقى بايتاتها يتيمةً في التخزين (اكتشاف المراجعة).
      const photos = await tx.handoverPhoto.findMany({ where: { handoverId: handover.id }, select: { fileKey: true } });
      await tx.contractHandover.delete({ where: { id: handover.id } });
      const refreshed = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
      return { photoKeys: photos.map((p) => p.fileKey), refreshed };
    });
    for (const key of photoKeys) {
      await this.files.remove(companyId, key).catch((e: Error) => this.logger.warn(`Could not delete handover photo object "${key}": ${e.message}`));
    }
    return refreshed;
  }

  /** The single gate every mutation goes through — one place to be wrong, and
   * one place to get right. */
  private async loadEditableHandover(tx: Prisma.TransactionClient, contractId: string, handoverId: string) {
    const handover = await tx.contractHandover.findUnique({ where: { id: handoverId } });
    if (!handover || handover.contractId !== contractId) throw new NotFoundException(MSG.handover_not_found);
    if (handover.status === 'SIGNED') throw new ConflictException(MSG.handover_signed_immutable);
    return handover;
  }

  private async replaceHandoverItems(tx: Prisma.TransactionClient, handoverId: string, items: HandoverItemDto[]) {
    // Photos hang off items by id, and this replace strategy re-creates every
    // item with a NEW id (onDelete: SetNull would silently orphan them —
    // caught in adversarial review). Remember which labels each photo pointed
    // at, and re-attach by label after the rebuild; a photo whose item was
    // truly removed degrades to a whole-form photo rather than vanishing.
    const linkedPhotos = await tx.handoverPhoto.findMany({
      where: { handoverId, itemId: { not: null } },
      select: { id: true, item: { select: { label: true } } },
    });

    await tx.handoverItem.deleteMany({ where: { handoverId } });

    if (items.length > 0) {
      await tx.handoverItem.createMany({
        data: items.map((i) => ({
          handoverId,
          label: i.label.trim(),
          condition: i.condition,
          note: i.note?.trim() || null,
        })) as unknown as Prisma.HandoverItemUncheckedCreateInput[],
      });
    }

    if (linkedPhotos.length > 0) {
      const fresh = await tx.handoverItem.findMany({ where: { handoverId }, select: { id: true, label: true } });
      const idByLabel = new Map(fresh.map((i) => [i.label, i.id]));
      for (const photo of linkedPhotos) {
        const newItemId = photo.item ? (idByLabel.get(photo.item.label) ?? null) : null;
        await tx.handoverPhoto.update({ where: { id: photo.id }, data: { itemId: newItemId } });
      }
    }
  }

  /**
   * Records key money — the lump sum paid for the right to a commercial
   * location, in whichever direction it went.
   *
   * Recorded per contract rather than as a contract field because a tenancy can
   * legitimately carry more than one (an initial payment and a top-up on
   * renewal), and each is its own cash movement with its own date.
   */
  recordKeyMoney(companyId: string, contractId: string, dto: RecordKeyMoneyDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);

        const currency = dto.currency?.trim() || contract.currency;
        const exchangeRate = dto.exchangeRate ?? Number(contract.exchangeRate);
        const baseAmount = toBaseAmount(dto.amount, exchangeRate);

        const journalEntry = await postKeyMoneyEntry(tx, companyId, {
          unitId: contract.unitId,
          contractNo: contract.no,
          tenant: contract.tenant,
          date: new Date(dto.paidAt),
          baseAmount,
          received: dto.direction === 'RECEIVED',
        });

        await tx.contractKeyMoney.create({
          data: {
            contractId,
            direction: dto.direction,
            amount: dto.amount,
            note: dto.note?.trim() || null,
            currency,
            exchangeRate,
            baseAmount,
            paidAt: new Date(dto.paidAt),
            journalEntryId: journalEntry?.id ?? null,
          } as unknown as Prisma.ContractKeyMoneyUncheckedCreateInput,
        });

        return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  /**
   * Raises a claim against the tenant — a repair they caused, a utility bill
   * they left, a late fee.
   *
   * Posted immediately as a receivable: the demand exists from the moment it is
   * made, and holding it unposted until someone pays would leave the landlord's
   * books understating what they are owed.
   */
  createClaim(companyId: string, contractId: string, dto: CreateClaimDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);

        const currency = dto.currency?.trim() || contract.currency;
        const exchangeRate = dto.exchangeRate ?? Number(contract.exchangeRate);
        const baseAmount = toBaseAmount(dto.amount, exchangeRate);

        const journalEntry = await postClaimIssueEntry(tx, companyId, {
          unitId: contract.unitId,
          contractNo: contract.no,
          tenant: contract.tenant,
          date: new Date(dto.issuedAt),
          baseAmount,
          kindLabel: CLAIM_KIND_LABEL[dto.kind as ClaimKind],
        });

        await tx.contractClaim.create({
          data: {
            contractId,
            kind: dto.kind,
            amount: dto.amount,
            description: dto.description.trim(),
            currency,
            exchangeRate,
            baseAmount,
            issuedAt: new Date(dto.issuedAt),
            journalEntryId: journalEntry?.id ?? null,
          } as unknown as Prisma.ContractClaimUncheckedCreateInput,
        });

        return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  /** Collects a claim in cash. Partial collection isn't supported: a claim is a
   * single agreed demand, and splitting one is better modelled as two claims. */
  payClaim(companyId: string, contractId: string, claimId: string, dto: PayClaimDto) {
    return this.settleClaim(companyId, contractId, claimId, 'PAID', new Date(dto.paidAt), null);
  }

  /** Writes a claim off. Reverses the income rather than deleting the claim —
   * it really was raised, and the audit trail has to show both facts. */
  waiveClaim(companyId: string, contractId: string, claimId: string, dto: WaiveClaimDto) {
    return this.settleClaim(companyId, contractId, claimId, 'WAIVED', new Date(dto.waivedAt), dto.reason.trim());
  }

  private settleClaim(companyId: string, contractId: string, claimId: string, status: 'PAID' | 'WAIVED', date: Date, waiveReason: string | null) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const claim = await tx.contractClaim.findUnique({ where: { id: claimId }, include: { contract: true } });
        if (!claim || claim.contractId !== contractId) throw new NotFoundException(MSG.claim_not_found);
        if (claim.status !== 'OPEN') throw new ConflictException(MSG.claim_already_settled);

        const posting = {
          unitId: claim.contract.unitId,
          contractNo: claim.contract.no,
          tenant: claim.contract.tenant,
          date,
          baseAmount: Number(claim.baseAmount),
          kindLabel: CLAIM_KIND_LABEL[claim.kind],
        };
        const entry = status === 'PAID' ? await postClaimPaymentEntry(tx, companyId, posting) : await postClaimWaiverEntry(tx, companyId, posting);

        await tx.contractClaim.update({
          where: { id: claimId },
          data: { status, settledAt: date, waiveReason, settlementEntryId: entry?.id ?? null },
        });

        return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  /**
   * Records a deposit the tenant has actually handed over, and posts it as a
   * liability.
   *
   * `Contract.deposit` remains what was *agreed*; this is what was *received*.
   * The two are separate on purpose — a contract can be signed with a deposit
   * owed but not yet paid, and only the second belongs in the ledger.
   */
  recordDeposit(companyId: string, contractId: string, dto: RecordDepositDto) {
    // Retries on a journal-entry "no" collision from a concurrent posting.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract) throw new NotFoundException(MSG.contract_not_found);

        // A deposit defaults to the contract's currency and rate, since it is
        // part of the same deal, but may carry its own.
        const currency = dto.currency?.trim() || contract.currency;
        const exchangeRate = dto.exchangeRate ?? Number(contract.exchangeRate);
        const baseAmount = toBaseAmount(dto.amount, exchangeRate);

        // Only a deposit the company actually holds hits the ledger. One
        // blocked on Ejar is tracked here so it shows on the contract and can
        // be settled later, but the company neither received cash nor owes it
        // back — the platform is the custodian.
        const holder = dto.holder ?? 'COMPANY';
        const journalEntry =
          holder === 'COMPANY'
            ? await postDepositReceiptEntry(tx, companyId, {
                unitId: contract.unitId,
                contractNo: contract.no,
                tenant: contract.tenant,
                date: new Date(dto.receivedAt),
                baseAmount,
                typeLabel: DEPOSIT_TYPE_LABEL[dto.type as DepositType],
              })
            : null;

        await tx.contractDeposit.create({
          data: {
            contractId,
            type: dto.type,
            holder,
            amount: dto.amount,
            currency,
            exchangeRate,
            baseAmount,
            receivedAt: new Date(dto.receivedAt),
            note: dto.note,
            journalEntryId: journalEntry?.id ?? null,
          } as unknown as Prisma.ContractDepositUncheckedCreateInput,
        });

        return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  /**
   * Closes a deposit out: itemized deductions, and whatever is left goes back
   * to the tenant.
   *
   * Settling twice is refused rather than allowed to post a second entry — the
   * liability only exists once, and a repeat would credit cash the landlord
   * never paid.
   */
  settleDeposit(companyId: string, contractId: string, depositId: string, dto: SettleDepositDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const deposit = await tx.contractDeposit.findUnique({ where: { id: depositId }, include: { contract: true } });
        if (!deposit || deposit.contractId !== contractId) throw new NotFoundException(MSG.deposit_not_found);
        if (deposit.status === 'SETTLED') throw new ConflictException(MSG.deposit_already_settled);

        const held = Number(deposit.amount);
        // Rounded at every accumulation: two 2-decimal amounts can sum to a
        // float like 300.00000000000006 and spuriously exceed the deposit.
        const deducted = sumMoney(dto.deductions.map((d) => d.amount));
        if (deducted > held) {
          throw new BadRequestException(formatMessage(MSG.deductions_exceed_deposit, { held: formatMoney(held) }));
        }

        const rate = Number(deposit.exchangeRate);
        const sumOf = (target: 'receivable' | 'income') =>
          toBaseAmount(
            sumMoney(dto.deductions.filter((d) => deductionTarget(d.kind as DeductionKind) === target).map((d) => d.amount)),
            rate,
          );

        const refund = round2(held - deducted);

        const settlementEntry = await postDepositSettlementEntry(tx, companyId, {
          unitId: deposit.contract.unitId,
          contractNo: deposit.contract.no,
          tenant: deposit.contract.tenant,
          date: new Date(dto.settledAt),
          // An Ejar-held deposit has no liability to clear — only what the
          // platform releases to the company gets posted.
          heldByCompany: deposit.holder === 'COMPANY',
          baseAmount: Number(deposit.baseAmount),
          againstReceivable: sumOf('receivable'),
          againstIncome: sumOf('income'),
          refund: toBaseAmount(refund, rate),
          typeLabel: DEPOSIT_TYPE_LABEL[deposit.type],
        });

        if (dto.deductions.length > 0) {
          await tx.depositDeduction.createMany({
            data: dto.deductions.map((d) => ({
              depositId,
              kind: d.kind,
              amount: d.amount,
              reason: d.reason,
            })) as unknown as Prisma.DepositDeductionUncheckedCreateInput[],
          });
        }

        await tx.contractDeposit.update({
          where: { id: depositId },
          data: {
            status: 'SETTLED',
            settledAt: new Date(dto.settledAt),
            refundAmount: refund,
            settlementEntryId: settlementEntry?.id ?? null,
          },
        });

        return tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: CONTRACT_INCLUDE });
      }),
    );
  }

  /** `EJ-<year>-<seq>`, same max-based scheme as invoice/purchase/journal
   * numbering — see InvoicesService.nextInvoiceNumber for why count() would
   * be wrong here. */
  /**
   * بادئة رقم العقد من **`startDate`** — قرار المالك 2026-08-15.
   *
   * ولا تاريخ توقيع في نموذج العقد أصلاً (`create-contract.dto.ts` يحمل `start`
   * و`end` لا غير). والحجّة: **تاريخ العقد الفعلي الذي يعرفه الطرفان ويظهر في
   * المستند — ولا يعتمد على ساعة الخادم إطلاقاً.**
   *
   * ⚠️ و`signedAt` بندٌ مسجَّل بلا بدء (نماذج التسليم والتوقيع الرقمي). **وحين
   * يُضاف لا تنتقل البادئة إليه تلقائياً** — تغييرُ أساس الترقيم بعد إصدار أرقام
   * قرارٌ مستقل يُعاد فتحه، لا أثرٌ جانبي لحقلٍ جديد.
   */
  private async nextContractNumber(tx: Prisma.TransactionClient, companyId: string, startDate: Date): Promise<string> {
    // عدّادٌ ذرّيّ لا مسحُ سنة (ق-٣٢٨) — والبذرُ من أعلى قائمٍ مرّةً واحدة.
    return nextDocumentNumber(tx, companyId, startDate, { kind: 'EJ', pad: 4 }, (prefix) => highestSequenceOf(tx.contract, prefix));
  }

  /** Lazily flips DUE -> LATE for any installment whose due date has passed
   * — matches the mockup's `refreshInstallmentStatuses`, called on every
   * read rather than via a background job. */
  private async refreshInstallmentStatuses(tx: Prisma.TransactionClient, contractId?: string): Promise<void> {
    await tx.installment.updateMany({
      where: { status: 'DUE', dueDate: { lt: new Date() }, ...(contractId ? { contractId } : {}) },
      data: { status: 'LATE' },
    });

    // An UPCOMING renewal becomes live the day its term starts. Driven by the
    // same lazy read-time refresh as the line above rather than a scheduled
    // job — a contract that only turns active when someone happens to look at
    // it is still correct, because nothing reads it without going through here.
    await tx.contract.updateMany({
      where: { status: 'UPCOMING', start: { lte: new Date() }, ...(contractId ? { id: contractId } : {}) },
      data: { status: 'DUE' },
    });
  }

  /**
   * Paginated, slim list — contract row + unit/property only, never the full
   * sub-tree. The old shape (every contract with all installments, payments,
   * deposits, claims, key money and handovers) grew linearly with portfolio
   * size and blew the tenant transaction's 5s timeout at ~1,300 contracts
   * (~12 MB of JSON). The detail modal loads one contract's sub-tree via
   * findOne, which keeps CONTRACT_INCLUDE.
   *
   * Statuses stay mockup-faithful: the same lazy refresh runs first, and each
   * row's `status` is the stored, freshly-refreshed value — nothing is
   * computed per row.
   */
  private async listRefreshed(tx: Prisma.TransactionClient, query: ListContractsQueryDto) {
    await this.refreshInstallmentStatuses(tx);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.search?.trim();
    const where: Prisma.ContractWhereInput = q
      ? {
          OR: [
            { tenant: { contains: q, mode: 'insensitive' } },
            { no: { contains: q, mode: 'insensitive' } },
            { unit: { unitNo: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {};

    // Sequential on purpose: an interactive transaction runs on a single
    // connection, so concurrent queries on `tx` would only race for it.
    const total = await tx.contract.count({ where });
    const items = await tx.contract.findMany({
      where,
      include: { unit: { include: { property: true } } },
      // ترتيبٌ تامّ لا جزئيّ (`ق-٣٥٦`) — `start` بدقّة اليوم فيتعادل، و`id` يحسم.
      orderBy: [{ start: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }
}
