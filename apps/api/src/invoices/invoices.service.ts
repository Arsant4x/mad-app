import { BadRequestException, ConflictException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../delegations/permissions.service';
import { checkCreditLimit } from './credit-limit.util';
import { CREDIT_CODE, CREDIT_OVERRIDE_ACTION, CREDIT_OVERRIDE_SCREEN, type CreditContext } from './credit-context';
import { grant } from '../delegations/permission-tree';
import { TenantContext } from '../auth/types';
import { assertBranchAllowed, branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { buildZatcaQr } from '../zatca/qr.util';
import { issuedWallClock } from '../common/wall-clock.util';
import { Prisma } from '@prisma/client';
import { toBaseAmount, resolveCurrency } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { computeDocumentTotals } from '../common/money/totals';
import { fulfilStockedLines, returnStockedLines, ReturnExceedsSoldError, type ReturnResult } from './sale-fulfilment.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postCogsEntry, postCogsReversalEntry, postCreditNoteEntry, postDebitNoteEntry, postInvoiceEntry, unpostIfLinked } from '../journal/auto-posting.util';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { documentYear } from '../common/document-year.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { NotificationsService } from '../notifications/notifications.service';
import { deadlineView } from './note-deadline.util';
import { events } from '../shared/events/event-bus';
import { INVOICE_ISSUED, type InvoiceIssuedPayload } from '../shared/events/domain-events';

/** `relatedInvoice` so a credit note can show which invoice it adjusts
 * without a second round-trip — number only, never the whole document. */
const INVOICE_INCLUDE = { customer: true, lines: true, relatedInvoice: { select: { id: true, no: true } } } as const;


/**
 * Always derive totals from the lines server-side — a client-submitted total is
 * never trusted (a client could otherwise bill an arbitrary amount).
 *
 * **كنسة التدوير (قرار المالك 2026-09-03):** المجاميع تُحسب في `common/money/totals.ts`
 * بالطريقة نفسها التي يبني بها `zatca/ubl/invoice-xml.util.ts` المستندَ المختوم —
 * صافي كل بندٍ مدوَّراً، ثم الوعاء لكل نسبة، ثم ضريبة النسبة مدوَّرةً مرةً واحدة.
 * كانت هذه الدالة تجمع البنود غير مدوَّرة ثم تدوّر المجموع، فاختلفت عن المستند
 * بهللةٍ على بنودٍ ثلاثيةٍ مثل `0.335` — **بنفس سياسة التدوير**. الآن الدفتر
 * والمستند دالةٌ واحدة، و`subtotal + taxTotal === total` بالضبط.
 */
export function computeTotals(lines: InvoiceLineDto[]) {
  const { subtotal, taxTotal, total } = computeDocumentTotals(lines);
  return { subtotal, taxTotal, total };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * What each document still leaves the customer owing.
   *
   * Derived here rather than on each screen because a credit note settles its
   * invoice **in the ledger** (it credits 1200) while deliberately leaving the
   * invoice row alone — so a status-only reading of receivables would keep
   * chasing a debt the books already show as cancelled, and every screen would
   * have to remember that independently.
   *
   * - an invoice owes its total, less whatever has been credited against it;
   * - a credit note owes nothing (it is the reduction, already applied above);
   * - a debit note owes its own total — it IS additional billing.
   *
   * Floored at zero: a fully-credited invoice that was also marked paid must
   * not read as the customer being owed money.
   */
  private outstandingOf(
    inv: { docType: string; status: string; total: Prisma.Decimal; id: string },
    creditedByInvoiceId: Map<string, number>,
    allocatedByInvoiceId: Map<string, number>,
  ): number {
    if (inv.docType === 'CREDIT_NOTE') return 0;
    if (inv.status === 'PAID') return 0;
    const credited = inv.docType === 'INVOICE' ? (creditedByInvoiceId.get(inv.id) ?? 0) : 0;
    // المقبوض يُطرح كما يُطرح الإشعار الدائن — وإغفاله كان يجعل الفاتورة
    // المسدَّدة جزئياً تُحتسب بكامل قيمتها، فيطالَب العميل بما دفعه.
    // (قاعدة 4.5: أي رقم يعرض «المتبقي» يُحسب من التخصيصات لا من حقل.)
    const allocated = allocatedByInvoiceId.get(inv.id) ?? 0;
    return Math.max(0, round2(Number(inv.total) - credited - allocated));
  }

  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const invoices = await tx.invoice.findMany({ where: branchFilter(allowedBranchIds), include: INVOICE_INCLUDE, orderBy: { issueDate: 'desc' } });

      // Credited amount per original invoice, in one pass — a per-row query
      // would be a request per invoice on a screen that lists all of them.
      const creditTotals = await tx.invoice.groupBy({
        by: ['relatedInvoiceId'],
        where: { docType: 'CREDIT_NOTE', relatedInvoiceId: { not: null } },
        _sum: { total: true },
      });
      const creditedByInvoiceId = new Map(creditTotals.map((row) => [row.relatedInvoiceId!, Number(row._sum.total ?? 0)]));

      // المقبوض لكل فاتورة في استعلام واحد — كما تفعل خريطة الإشعارات أعلاه،
      // فاستعلامٌ لكل صف على شاشة تسردها جميعاً طلبٌ لكل فاتورة.
      const allocationTotals = await tx.paymentAllocation.groupBy({ by: ['invoiceId'], _sum: { amount: true } });
      const allocatedByInvoiceId = new Map(allocationTotals.map((row) => [row.invoiceId, Number(row._sum.amount ?? 0)]));

      // The ZATCA QR is derived, not stored: it must reflect the company's
      // *current* legal name and VAT number, so an invoice issued before the
      // company profile was completed starts showing a valid QR the moment
      // those fields are filled in — rather than being permanently stamped
      // with the blanks it was created with.
      //
      // Company is the tenant identity row (no RLS, not in the tenant-scope
      // extension), so it's read straight by id from the verified context.
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { legalName: true, vatNumber: true },
      });

      return invoices.map((inv) => ({
        ...inv,
        /** What this document still leaves owing — see outstandingOf. */
        outstanding: this.outstandingOf(inv, creditedByInvoiceId, allocatedByInvoiceId),
        /** How much of this invoice has been credited back, so a screen can
         * show the invoice as partly reversed without a second request. */
        creditedTotal: inv.docType === 'INVOICE' ? (creditedByInvoiceId.get(inv.id) ?? 0) : 0,
        // مستندٌ مختوم يعرض رمزَه التساعي المحفوظ؛ وغيرُه الوسومَ الخمسة المشتقّة (`ق-١٨٧`).
        zatcaQr: inv.zatcaQrPayload ?? buildZatcaQr({
          sellerName: company?.legalName ?? '',
          vatNumber: company?.vatNumber ?? '',
          issued: issuedWallClock(inv),
          // ZATCA wants the figures as billed, in the invoice's own currency.
          total: Number(inv.total),
          vatAmount: Number(inv.taxTotal),
        }),
      }));
    });
  }

  /**
   * ⭐ **يبني سياقَ الائتمان لمسارٍ يفتح ذمّة** — **مصدرٌ واحدٌ للتصريح**.
   *
   * ⚠️ **وصلاحيةُ التجاوز تُقرأ من `PermissionsService.forActor` وحدها** —
   * **وهي عينُ ما تقرؤه الواجهة**، فلا يرى المستخدمُ زرّاً يرفضه الخادم ولا
   * العكس. **ولا حسابَ صلاحياتٍ محلّيّ ثانٍ يفترق عنه عند أول تعديل.**
   *
   * ⚠️ **ولا تُقرأ إلا حين يُصرَّح بالتجاوز**: قراءةُ الصلاحيات ليست مجّانية،
   * **والتصريحُ نادر** — فلا تُدفع كلفتُها على كل فاتورة. **وهي خارج المعاملة
   * عمداً**: `forActor` تفتح معاملتَها، **وقراءتُها داخل معاملة الفاتورة
   * معاملةٌ داخل معاملة** — وهو العطل الذي أوقف الكاشير (`ق-٣٥٩`).
   */
  async creditContextFor(
    tenant: TenantContext,
    actorName: string,
    dto: { creditOverride?: boolean },
    settlement: CreditContext['settlement'],
  ): Promise<CreditContext> {
    const overrideRequested = Boolean(dto.creditOverride);
    // ⚠️ **المفتاحُ يُبنى بـ`grant()` لا يُكتب نصّاً**: صيغةُ `شاشة:فعل` مصدرُها
    //    واحد، **ونصٌّ مكتوبٌ بيدٍ يفترق عنها بصمتٍ فيصير الفحصُ دائمَ الكذب**.
    const canOverride = overrideRequested
      ? (await this.permissions.forActor(tenant)).grants.includes(grant(CREDIT_OVERRIDE_SCREEN, 'review'))
      : false;
    return {
      settlement,
      actor: { id: tenant.profileId, actorType: tenant.actorType, name: actorName },
      overrideRequested,
      canOverride,
    };
  }

  async create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateInvoiceDto, credit: CreditContext) {
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextInvoiceNumber's comment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) => this.createWithinTx(tx, companyId, allowedBranchIds, dto, credit)),
    );
  }

  /**
   * ⭐ **بوّابةُ حدّ الائتمان — على `createWithinTx` وحدها** (`ق-٣٣٦` … `ق-٣٤٠`).
   *
   * **والمدخلُ واحدٌ مقيسٌ لا مفترَض**: الفاتورةُ المباشرة · تحويلُ عرض السعر ·
   * **وبيعُ الكاشير** (عبر `create`) — **ثلاثتُها تمرّ من هنا، فلا مسارَ يفلت**.
   *
   * **والترتيبُ مقصود**: يُفحص **قبل** `tx.invoice.create` — فبوّابةٌ تُفحص بعد
   * الإنشاء **تصير تقريراً لا منعاً**، وتترك رقمَ مستندٍ محروقاً في كل رفض.
   */
  private async gateCreditLimit(
    tx: Prisma.TransactionClient,
    companyId: string,
    args: { customerId: string; issueDate: Date; addingBase: number },
    credit: CreditContext,
  ): Promise<{ by: string; at: Date; exposure: number; limit: number } | null> {
    // ⚠️ **`ق-٣٣٨`**: ما يُسدَّد في الطلب نفسه لا يُفحص — **وحدٌّ يمنع بيعاً
    //    نقدياً عطلٌ يصنعه لا يمنعه**. وحدُّ هذا التصريح مُعلَنٌ في
    //    `credit-context.ts` ولا يُلتفّ عليه.
    if (credit.settlement === 'IMMEDIATE') return null;

    const check = await checkCreditLimit(tx, {
      customerId: args.customerId,
      asOf: args.issueDate,
      addingBase: args.addingBase,
    });
    if (!check.exceeded) return null;

    const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const numbers = {
      customer: check.customerName,
      limit: money(check.limit),
      exposure: money(check.exposure),
      adding: money(check.adding),
      after: money(check.after),
    };

    // ⚖️ **المنعُ الصلب إعدادٌ يختاره التاجر** (`ق-٣٤٠`) — **ولا تجاوزَ معه
    //    لأحد ولو ملك `review`**، وهو معنى «صلب».
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { creditLimitHardBlock: true } });
    if (company?.creditLimitHardBlock) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: formatMessage(MSG.credit_limit_hard_block, numbers),
        code: CREDIT_CODE.hardBlock,
      });
    }

    // ⚠️ **والرفضُ يسبق التجاوز**: طلبٌ لم يصرّح **يُردّ برسالةٍ تحمل الأرقام**
    //    — فالواجهة تسأل التاجر، **ولا يمرّ تجاوزٌ لم يقصده أحد**.
    if (!credit.overrideRequested) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        message: formatMessage(MSG.credit_limit_exceeded, numbers),
        code: CREDIT_CODE.exceeded,
      });
    }
    if (!credit.canOverride || !credit.actor) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: formatMessage(MSG.credit_limit_override_forbidden, {}),
        code: CREDIT_CODE.forbidden,
      });
    }

    return { by: credit.actor.id, at: new Date(), exposure: check.exposure, limit: check.limit };
  }

  /**
   * نقطة الدخول داخل-المعاملة (4.9): يستهلكها تحويل عرض السعر ليجعل إنشاء
   * الفاتورة وختمَ العرض معاملةً واحدة ذرّية. الجسد هو ما كان داخل create
   * حرفياً — لا تغيير سلوك للمسار القائم، واختباراته القديمة حكمُ ذلك.
   * ملاحظة: من يستدعيها مسؤول عن retryOnUniqueConflict حول معاملته كلها.
   */
  async createWithinTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    allowedBranchIds: string[] | 'all',
    dto: CreateInvoiceDto,
    credit: CreditContext,
  ) {
    const { subtotal, taxTotal, total } = computeTotals(dto.lines);
    const { currency, exchangeRate } = resolveCurrency(dto);
      /**
       * ⚖️ **الحدُّ يُفحص قبل أي كتابة** (`ق-٣٣٦`) — قبل الترقيم نفسِه:
       * **رفضٌ بعد `nextDocumentNumber` يحرق رقماً في كل محاولة**، والعدّادُ
       * ذرّيٌّ لا يعيد المحروق (`ق-٣٣١`③). فيُفحص أولاً، **ولا فجوةَ من رفض**.
       */
      const override = await this.gateCreditLimit(
        tx,
        companyId,
        { customerId: dto.customerId, issueDate: new Date(dto.issueDate), addingBase: toBaseAmount(total, exchangeRate) },
        credit,
      );
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      const no = await this.nextDocumentNumber(tx, companyId, 'INV', new Date(dto.issueDate));
      const created = await tx.invoice.create({
        // `companyId` (top-level and on each nested line) is set explicitly
        // rather than relying on the tenant-scope extension: nested relation
        // writes like `lines: { create: [...] }` happen inside the query
        // engine and are never seen by the extension's per-operation hook,
        // so it can only auto-inject companyId for the top-level Invoice
        // write, not for InvoiceLine here. Postgres RLS backstops this
        // regardless (see tenant-prisma.service.ts).
        data: {
          companyId,
          no,
          branchId,
          customerId: dto.customerId,
          issueDate: new Date(dto.issueDate),
          // لحظة الجهاز وانحرافه معاً أو لا شيء (`ق-١٨٥`) — الـDTO يضمن الاقتران.
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
          issuedOffsetMin: dto.issuedAt ? (dto.issuedOffsetMin ?? null) : null,
          dueDate: new Date(dto.dueDate),
          notes: dto.notes,
          // ⚖️ **التجاوزُ يُخزَّن على الفاتورة** (`ق-٣٣٩`) — الأربعةُ معاً أو
          //    `null` كلُّها. **والحفظُ في نفس الكتابة**: تجاوزٌ يُلحق بعدها
          //    قد لا يُلحق، **ففاتورةٌ متجاوِزةٌ بلا شهادةٍ هي الثغرة بعينها**.
          creditOverrideById: override?.by ?? null,
          creditOverrideAt: override?.at ?? null,
          creditOverrideExposure: override ? new Prisma.Decimal(override.exposure) : null,
          creditOverrideLimit: override ? new Prisma.Decimal(override.limit) : null,
          subtotal,
          taxTotal,
          total,
          currency,
          exchangeRate,
          baseSubtotal: toBaseAmount(subtotal, exchangeRate),
          baseTaxTotal: toBaseAmount(taxTotal, exchangeRate),
          baseTotal: toBaseAmount(total, exchangeRate),
          lines: {
            create: dto.lines.map((l) => ({
              companyId,
              description: l.description,
              productId: l.productId ?? null,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate,
            })),
          },
        } as unknown as Prisma.InvoiceUncheckedCreateInput,
        include: INVOICE_INCLUDE,
      });

      /**
       * ⚖️ **وحدثٌ باسمه في سجل التدقيق — بمعاملته** (`ق-٣٣٩`).
       *
       * ⚠️ **داخل المعاملة لا بعدها**، على سابقة `self-review` نصّاً: «**فعلٌ
       * حُفظ بلا شهادة هو الثغرة النظامية بعينها**». فتقع الفاتورةُ وشهادةُ
       * تجاوزها معاً، **أو لا يقع شيء**.
       *
       * **والفعلُ باسمه** (`credit-override`) **لا `add` عامّاً**: فيجده
       * المدقّق بحثاً — `GET /audit-log?action=credit-override` — **لا
       * بمقارنة حقلين يدوياً في كل فاتورة**.
       */
      if (override && credit.actor) {
        await this.audit.recordWithinTx(tx, {
          companyId,
          actorType: credit.actor.actorType,
          actorId: credit.actor.id,
          actorName: credit.actor.name,
          screen: 'invoice',
          action: CREDIT_OVERRIDE_ACTION,
          entity: 'invoices',
          entityId: created.id,
          method: 'POST',
          path: '/invoices',
          details: {
            no: created.no,
            customerId: created.customerId,
            limit: override.limit,
            exposureBefore: override.exposure,
            adding: Number(created.baseTotal),
          },
          ip: null,
        });
      }

      /**
       * ⭐ **التسليم من هنا وحده** — حركة المخزون وتكلفتها من مالكٍ واحد هو
       * سطر الفاتورة. والكاشير يمرّ من هذا المسار نفسه، فلا مسار ثانٍ يخصم.
       *
       * ⚠️ **وقيد التكلفة منفصل عن قيد الفاتورة**: الأول حدثٌ مخزنيّ والثاني
       * إيرادي، وقد يقع أحدهما بلا الآخر (بيع خدمة · بضاعة بلا مستودع).
       */
      const fulfilment = await fulfilStockedLines(tx, {
        companyId,
        branchId: created.branchId,
        date: created.issueDate,
        documentNo: created.no,
        lines: created.lines,
      });
      if (fulfilment.fulfilled) {
        await postCogsEntry(tx, companyId, {
          branchId: created.branchId,
          no: created.no,
          date: created.issueDate,
          baseCost: toBaseAmount(fulfilment.totalCost, exchangeRate),
        });
      }

      // Auto-post to the ledger; soft-skip (journalEntryId stays null) if the
      // required accounts (1200/4100/2200) aren't set up for this company yet
      // — see the schema comment on Invoice.journalEntryId.
      const entry = await postInvoiceEntry(tx, companyId, {
        branchId: created.branchId,
        no: created.no,
        issueDate: created.issueDate,
        customerName: created.customer.name,
        baseSubtotal: Number(created.baseSubtotal),
        baseTaxTotal: Number(created.baseTaxTotal),
        baseTotal: Number(created.baseTotal),
      });
      /**
       * `stockFulfilment` **حقلٌ عابر لا عمود** — لا يُخزَّن ولا يُقرأ لاحقاً:
       * هو تقرير ما وقع في هذه المعاملة بعينها، يستهلكه الكاشير ليعرض للبائع
       * سبب عدم الخصم إن لم يقع. **والحقيقة تبقى في دفتر الحركات وحده.**
       */
      /**
       * ⭐ **حدثُ الإصدار داخل المعاملة نفسها** (`ق-٣٩` · `ق-٤٩`).
       *
       * الطابور يُكتب هنا لا بعد الحفظ: **إن تعذّرت كتابته تُلغى الفاتورة**، فلا
       * تبقى فاتورةٌ تنتظر الهيئة ولا أحد يعلم بها. وكان الإرسال نقرةً يدوية —
       * أي أن فاتورةً تُنشأ **وتُنسى** بلا أثرٍ يقول إنها لم تصل.
       */
      await events.emitCompliance(tx, {
        type: INVOICE_ISSUED,
        companyId,
        payload: { invoiceId: created.id, docType: created.docType, no: created.no } satisfies InvoiceIssuedPayload,
      });

      if (!entry) return { ...created, stockFulfilment: fulfilment };
      const saved = await tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
      return { ...saved, stockFulfilment: fulfilment };
  }

  update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.invoice_not_found);

      // What the submitted XML is signed over. Notes and payment status are
      // absent on purpose: they never enter the document, so they stay
      // editable at every stage — a cleared invoice must still be markable
      // PAID.
      //
      // The test is presence, not difference: a field that arrives is treated
      // as an attempt to set it, exactly like `affectsPosting` below. Diffing
      // submitted values against stored ones would make the guard depend on
      // Decimal/date normalisation getting it right every time, and a guard
      // that silently lets an edit through when the comparison is wrong is
      // worse than one that refuses a no-op resubmission. It also means the
      // builder screen — which always posts the whole document — is refused
      // as a whole, which is the right answer for a locked invoice.
      const changesSignedContent =
        dto.lines !== undefined ||
        dto.customerId !== undefined ||
        dto.issueDate !== undefined ||
        dto.dueDate !== undefined ||
        // Currency and rate reach the authority through the base* columns:
        // ZATCA is told the VAT figure in SAR, and that is `baseTaxTotal`.
        dto.currency !== undefined ||
        dto.exchangeRate !== undefined;

      // A credit note adjusts a document as it stood — editing it afterwards
      // would silently change what was adjusted. Delete + reissue instead. A
      // debit note is receivable, so its payment status may still move.
      if (existing.docType === 'CREDIT_NOTE') throw new BadRequestException(MSG.credit_note_immutable);
      if (existing.docType === 'DEBIT_NOTE' && changesSignedContent) throw new BadRequestException(MSG.credit_note_immutable);

      if (changesSignedContent) {
        // The line is acceptance, not whether the chain was touched. A
        // CLEARED invoice is a standing legal document and the authority
        // holds its signed XML — editing the row would make the two disagree,
        // so correction is by credit note. A REJECTED one has no legal
        // existence at all: fixing the data and resubmitting is the intended
        // recovery, and a credit note against a document the authority never
        // accepted would be a note against nothing. (Deletion stays refused
        // for both — see remove(): a rejected invoice has still burned its
        // ICV slot, and editing keeps that slot while deleting leaves a gap.)
        if (existing.zatcaStatus === 'CLEARED') throw new ConflictException(MSG.zatca_invoice_cleared_locked);
        // In flight: the request may already be at the authority and may come
        // back CLEARED, which would leave the row disagreeing with the XML
        // just as an edit-after-clearance does. Brief by design — the status
        // is set immediately before dispatch and overwritten by the outcome.
        if (existing.zatcaStatus === 'SUBMITTING') throw new ConflictException(MSG.zatca_invoice_submitting_locked);
        // مختومٌ بانتظار الإبلاغ (`ق-١٨٧`): مستندٌ موقَّعٌ خرج إيصالُه — «قد تقبله الهيئة
        // في أي لحظة»، فيُقفل كالقيد الإرسال؛ وإن رُدّ صار قابلاً للتصحيح كسائر المردود.
        if (existing.zatcaStatus === 'STAMPED') throw new ConflictException(MSG.zatca_invoice_stamped_locked);

        // Second layer. `latestChainHash` no longer hands a rejected
        // invoice's hash to the next document, so the normal path can no
        // longer produce this shape — but rows recorded before that rule, and
        // any future path that sets a PIH another way, still can. Where a
        // successor has committed to this document's hash, recomputing it on
        // resubmission would leave that successor pointing at a hash that
        // exists nowhere. Testing for the successor directly (rather than
        // "is there a higher ICV") keeps the common case — fix the rejection
        // and retry immediately — open, and refuses only when something is
        // genuinely attached.
        if (existing.zatcaHash !== null) {
          const successors = await tx.invoice.count({ where: { zatcaPreviousHash: existing.zatcaHash } });
          if (successors > 0) throw new ConflictException(MSG.zatca_invoice_successor_locked);
        }
      }

      const data: Prisma.InvoiceUncheckedUpdateInput = {};
      if (dto.customerId) data.customerId = dto.customerId;
      if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
      if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.status) data.status = dto.status;

      if (dto.lines) {
        const totals = computeTotals(dto.lines);
        // The rate stays whatever the invoice was issued at unless the caller
        // explicitly sends a new one — re-editing lines must not silently
        // reprice the document at today's rate.
        const rate = dto.exchangeRate ?? Number(existing.exchangeRate);
        data.subtotal = totals.subtotal;
        data.taxTotal = totals.taxTotal;
        data.total = totals.total;
        data.baseSubtotal = toBaseAmount(totals.subtotal, rate);
        data.baseTaxTotal = toBaseAmount(totals.taxTotal, rate);
        data.baseTotal = toBaseAmount(totals.total, rate);
        if (dto.currency) data.currency = dto.currency;
        if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
        // Replace-all rather than diffing line-by-line — simplest correct
        // approach, and invoices are edited as a whole in the UI anyway.
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        data.lines = {
          create: dto.lines.map((l) => ({
            companyId,
            description: l.description,
            productId: l.productId ?? null,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
          })),
        } as unknown as Prisma.InvoiceUncheckedUpdateInput['lines'];
      }

      // Anything that changes what should be posted (who, when, or the
      // amounts) reverses the old auto-entry and re-posts fresh, rather than
      // trying to patch a posted entry in place — matches the "never edit a
      // posted entry" rule from journal-posting.util.
      const affectsPosting = dto.customerId !== undefined || dto.issueDate !== undefined || dto.lines !== undefined;
      if (affectsPosting && existing.journalEntryId) {
        // Detach first: the old entry can't be deleted while this invoice
        // still references it (onDelete: Restrict).
        data.journalEntryId = null;
      }

      const updated = await tx.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
      if (!affectsPosting) return updated;

      if (existing.journalEntryId) await unpostIfLinked(tx, existing.journalEntryId);
      const entry = await postInvoiceEntry(tx, companyId, {
        branchId: updated.branchId,
        no: updated.no,
        issueDate: updated.issueDate,
        customerName: updated.customer.name,
        baseSubtotal: Number(updated.baseSubtotal),
        baseTaxTotal: Number(updated.baseTaxTotal),
        baseTotal: Number(updated.baseTotal),
      });
      if (!entry) return updated;
      return tx.invoice.update({ where: { id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.invoice_not_found);
      // An assigned ICV means this document occupies a position in the
      // authority's hash chain — CLEARED or REJECTED alike (a retry reuses
      // the position, so even a rejected one has burned it). A submission
      // interrupted after the ICV was stamped but before the hash was
      // recorded is covered by the same condition. Deleting the row would
      // leave the next document chained onto a hash that no longer exists
      // locally. Reversal is a credit note, not a delete.
      if (existing.zatcaIcv !== null || existing.zatcaHash !== null) throw new ConflictException(MSG.zatca_invoice_chain_locked);
      // The FK is Restrict, so this would fail anyway — checked here to give
      // a diagnosable 409 instead of a raw constraint error.
      const adjustments = await tx.invoice.count({ where: { relatedInvoiceId: id } });
      if (adjustments > 0) throw new ConflictException(MSG.invoice_has_credit_notes);
      await tx.invoice.delete({ where: { id } });
      // Deleting the invoice first removes the only row referencing the
      // entry, so it can now be reversed and deleted without hitting the
      // Restrict FK.
      await unpostIfLinked(tx, existing.journalEntryId);
    });
  }

  /**
   * Issues a credit note against an existing invoice (ZATCA type 381).
   *
   * The original is never touched — not its lines, not its posted entry (the
   * never-edit rule from journal-posting.util). The note is its own row in
   * the invoice table (docType CREDIT_NOTE) carrying **positive** amounts —
   * direction comes from the docType, exactly as the UBL document ZATCA
   * receives carries positive amounts under type code 381 — and it posts its
   * own reversing journal entry.
   */
  issueCreditNote(companyId: string, allowedBranchIds: string[] | 'all', invoiceId: string, dto: CreateCreditNoteDto) {
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const original = await this.adjustableOriginal(tx, invoiceId, allowedBranchIds);

      const lines: InvoiceLineDto[] =
        dto.lines ??
        original.lines.map((l) => ({
          description: l.description,
          // ⚠️ يُنقل الصنف مع السطر: إشعارٌ دائن يفقد صنفه يعكس الإيراد ولا
          // يستطيع عكس تكلفته — فيبقى المخزون منقوصاً بلا مقابل.
          productId: l.productId ?? undefined,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxRate: Number(l.taxRate),
          // إشعارٌ كامل = مرتجعٌ كامل سليم (`SPEC 30.4`): كل سطرٍ يشير إلى أصله ويعود إلى الرفّ.
          returnsLineId: l.id,
          returnCondition: 'GOOD' as const,
        }));

      // `SPEC 30.2`: سطرُ مرتجعٍ يشير إلى سطرٍ من **هذه** الفاتورة الأصلية وحدها، وبكميةٍ لا
      // تتجاوز ما فُوتر فيه — والتراكم عبر الإشعارات السابقة يفحصه `returnStockedLines` من
      // الحركات. سطرٌ بلا `returnsLineId` إشعارٌ محاسبيّ لا يمسّ المخزون.
      const originalLines = new Map(original.lines.map((l) => [l.id, l]));
      for (const l of lines) {
        if (!l.returnsLineId) continue;
        const source = originalLines.get(l.returnsLineId);
        if (!source) throw new BadRequestException(MSG.return_line_not_original);
        if (l.quantity > Number(source.quantity) + 1e-9) {
          throw new BadRequestException(formatMessage(MSG.return_exceeds_sold, { sold: Number(source.quantity), returned: 0, requested: l.quantity }));
        }
        if (source.productId && l.productId && l.productId !== source.productId) throw new BadRequestException(MSG.return_line_not_original);
      }
      const totals = computeTotals(lines);

      // All credit notes on one invoice together must not exceed what it
      // billed — crediting more than was ever invoiced is a bookkeeping
      // error, not a judgment call. (No such cap exists for debit notes:
      // additional billing has no arithmetic ceiling.)
      const already = await tx.invoice.aggregate({
        where: { relatedInvoiceId: invoiceId, docType: 'CREDIT_NOTE' },
        _sum: { total: true },
      });
      // Both sides rounded to the money scale before comparing: `remaining`
      // comes back from Decimal columns, `totals.total` from computeTotals.
      // The epsilon then only absorbs float representation, not a rounding
      // difference — which is what used to reject a legitimate full credit.
      const remaining = round2(Number(original.total) - Number(already._sum.total ?? 0));
      if (round2(totals.total) > remaining + 0.001) throw new BadRequestException(MSG.credit_note_exceeds_remaining);

      return this.createAdjustmentNote(tx, companyId, original, {
        docType: 'CREDIT_NOTE',
        numberKind: 'CN',
        reason: dto.reason,
        issueDate: dto.issueDate,
        eventDate: dto.eventDate,
        lines,
        totals,
        // Nothing is receivable on a credit note — PAID keeps it out of
        // every outstanding/aging computation keyed on status.
        status: 'PAID',
        post: postCreditNoteEntry,
      });
    }));
  }

  /**
   * Issues a debit note (ZATCA type 383) — additional billing against an
   * already-issued invoice (an undercharge, extra delivery costs). Same
   * document mechanics as the credit note, opposite economics: it posts in
   * the invoice's own direction and IS receivable, so it starts DUE and its
   * payment status may later move to PAID.
   */
  issueDebitNote(companyId: string, allowedBranchIds: string[] | 'all', invoiceId: string, dto: CreateDebitNoteDto) {
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const original = await this.adjustableOriginal(tx, invoiceId, allowedBranchIds);
      return this.createAdjustmentNote(tx, companyId, original, {
        docType: 'DEBIT_NOTE',
        numberKind: 'DN',
        reason: dto.reason,
        issueDate: dto.issueDate,
        eventDate: dto.eventDate,
        lines: dto.lines,
        totals: computeTotals(dto.lines),
        status: 'DUE',
        post: postDebitNoteEntry,
      });
    }));
  }

  /** The one invoice a note may point at: exists, is a real invoice (a chain
   * of notes must all reference the one original — adjusting an adjustment
   * would compound), and sits in a branch the caller may write to. */
  private async adjustableOriginal(tx: Prisma.TransactionClient, invoiceId: string, allowedBranchIds: string[] | 'all') {
    const original = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true, lines: true } });
    if (!original) throw new NotFoundException(MSG.invoice_not_found);
    if (original.docType !== 'INVOICE') throw new BadRequestException(MSG.credit_note_target_invalid);
    assertBranchAllowed(allowedBranchIds, original.branchId);
    return original;
  }

  /** Shared tail of both note kinds: the row, its lines, and its own posted
   * entry. Everything that differs between 381 and 383 arrives decided. */
  private async createAdjustmentNote(
    tx: Prisma.TransactionClient,
    companyId: string,
    original: { id: string; branchId: string | null; customerId: string; currency: string; exchangeRate: Prisma.Decimal },
    note: {
      docType: 'CREDIT_NOTE' | 'DEBIT_NOTE';
      numberKind: 'CN' | 'DN';
      reason: string;
      issueDate?: string;
      /** يوم قبول الإعادة — تُحسب منه المهلة النظامية. راجع `note-deadline.util.ts`. */
      eventDate?: string;
      lines: InvoiceLineDto[];
      totals: { subtotal: number; taxTotal: number; total: number };
      status: 'PAID' | 'DUE';
      post: typeof postCreditNoteEntry;
    },
  ) {
    // Same currency at the SAME rate as the original: the note adjusts that
    // document, so repricing at today's rate would make the pair
    // irreconcilable in base currency.
    const rate = Number(original.exchangeRate);
    // التاريخ يسبق الرقم — فالبادئة تُشتقّ منه.
    const issueDate = note.issueDate ? new Date(note.issueDate) : new Date();
    const no = await this.nextDocumentNumber(tx, companyId, note.numberKind, issueDate);
    const { subtotal, taxTotal, total } = note.totals;

    const created = await tx.invoice.create({
      data: {
        companyId,
        no,
        docType: note.docType,
        relatedInvoiceId: original.id,
        adjustmentReason: note.reason,
        // فارغٌ ⇒ الواقعة يوم الإصدار. ولا يُملأ رجعياً لما سبق (`ق-٥٣`).
        adjustmentEventDate: note.eventDate ? new Date(note.eventDate) : issueDate,
        branchId: original.branchId,
        customerId: original.customerId,
        issueDate,
        dueDate: issueDate,
        status: note.status,
        subtotal,
        taxTotal,
        total,
        currency: original.currency,
        exchangeRate: rate,
        baseSubtotal: toBaseAmount(subtotal, rate),
        baseTaxTotal: toBaseAmount(taxTotal, rate),
        baseTotal: toBaseAmount(total, rate),
        lines: {
          create: note.lines.map((l) => ({
            companyId,
            description: l.description,
            productId: l.productId ?? null,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            // رابطُ المرتجع وحالته على سطر الإشعار الدائن وحده (`SPEC 30.2` · `30.4`).
            returnsLineId: note.docType === 'CREDIT_NOTE' ? (l.returnsLineId ?? null) : null,
            returnCondition: note.docType === 'CREDIT_NOTE' ? (l.returnCondition ?? null) : null,
          })),
        },
      } as unknown as Prisma.InvoiceUncheckedCreateInput,
      include: INVOICE_INCLUDE,
    });

    /**
     * ⭐ **المرتجع السليم يعود إلى الرفّ وتُعكس تكلفته** (`SPEC 30.4`، موجة أ 2026-09-03) — من
     * المالك الواحد نفسه لكتابتَي الحركة والتكلفة (`sale-fulfilment.util`)، لا من مسارٍ ثانٍ.
     * قيدُ عكس التكلفة مستقلٌّ عن قيد الإشعار (الذي يعكس الإيراد والضريبة والذمّة) — كما أن قيد
     * التكلفة مستقلٌّ عن قيد الفاتورة. وما لم يعد إلى الرفّ يُعلَن في `restocking.skipped` بسببه.
     */
    /**
     * ⚠️ **تنبيهُ التأخّر يُرفع ولا يمنع** (قرار المالك 2026-09-04، `م٥٤`).
     *
     * المستند يوجبه النظام، فردُّه بعد انقضاء المهلة **يزيد المخالفة لا يمنعها** —
     * والتاجر المتأخّر ما زال ملزَماً بإصداره. فيصدر، ويُسجَّل التأخّر ليُرى.
     * والمفتاح يحمل رقم المستند، فتكرارُ الحفظ لا يكرّر الجرس.
     */
    const deadline = deadlineView(created.adjustmentEventDate ?? created.issueDate, created.issueDate);
    if (deadline.status === 'LATE') {
      await NotificationsService.raise(tx, companyId, {
        kind: 'NOTE_ISSUED_LATE',
        dedupeKey: `note-late:${created.id}`,
        title: `إشعارٌ صدر بعد مهلته — ${created.no}`,
        body:
          `واقعتُه ${created.adjustmentEventDate?.toISOString().slice(0, 10) ?? '—'} ومهلتُه ` +
          `${deadline.deadline.toISOString().slice(0, 10)}، وصدر بعدها بـ${Math.abs(deadline.daysLeft)} يوماً. ` +
          `والمهلة النظامية ١٥ يوماً من نهاية شهر الواقعة.`,
        linkScreen: 'invoice',
        linkId: created.id,
      });
    }

    let restocking: ReturnResult | null = null;
    if (note.docType === 'CREDIT_NOTE') {
      try {
        restocking = await returnStockedLines(tx, {
          companyId,
          branchId: created.branchId,
          date: created.issueDate,
          documentNo: created.no,
          lines: created.lines,
        });
      } catch (e) {
        if (e instanceof ReturnExceedsSoldError) {
          throw new BadRequestException(formatMessage(MSG.return_exceeds_sold, { sold: e.sold, returned: e.alreadyReturned, requested: e.requested }));
        }
        throw e;
      }
      if (restocking.totalCost > 0) {
        await postCogsReversalEntry(tx, companyId, {
          branchId: created.branchId,
          no: created.no,
          date: created.issueDate,
          baseCost: toBaseAmount(restocking.totalCost, rate),
        });
      }
    }

    const entry = await note.post(tx, companyId, {
      branchId: created.branchId,
      no: created.no,
      issueDate: created.issueDate,
      customerName: created.customer.name,
      baseSubtotal: Number(created.baseSubtotal),
      baseTaxTotal: Number(created.baseTaxTotal),
      baseTotal: Number(created.baseTotal),
    });
    if (!entry) return created;
    return tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
  }

  /** `INV-<year>-<seq>` for invoices, `CN-`/`DN-` for credit/debit notes,
   * matching the original mockup's numbering. Based on the highest existing
   * sequence for the year, not `count()` — a count-based scheme collides with
   * an already-issued number as soon as any row has ever been deleted
   * (count() drops but the old high number is still taken). Two concurrent
   * creates can still compute the same next number; `@@unique([companyId,
   * no])` turns that into a P2002 instead of a silent duplicate, and the
   * callers retry the whole transaction on that error (see
   * retryOnUniqueConflict). */
  private async nextDocumentNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    kind: 'INV' | 'CN' | 'DN',
    issueDate: Date,
  ): Promise<string> {
    // عدّادٌ ذرّيّ لا مسحُ سنة (ق-٣٢٨) — والبذرُ من أعلى قائمٍ مرّةً واحدة.
    return nextDocumentNumber(tx, companyId, issueDate, { kind, pad: 4 }, (prefix) => highestSequenceOf(tx.invoice, prefix));
  }

  /**
   * الوسوم الخمسة لمستندٍ واحد — لإيصال الكاشير (`ق-١٨٦`): **البنّاءُ نفسه وساعةُ
   * الحائط نفسها** التي تُصدَر بها قائمة الفواتير، فلا يفترق رمزُ الإيصال عن رمز
   * القائمة يوماً أو حرفاً. مشتقٌّ لا مخزَّن، للسبب المشروح في `list()`.
   */
  async zatcaQrFor(
    companyId: string,
    inv: { issueDate: Date; issuedAt: Date | null; issuedOffsetMin: number | null; total: Prisma.Decimal | number; taxTotal: Prisma.Decimal | number; zatcaQrPayload?: string | null },
    /** معاملةُ المستدعي حين يكون داخل واحدة — فلا تُفتح ثانيةٌ فوقها. */
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    // مستندٌ مختوم: رمزُه التساعي المحفوظ لحظةَ الختم — لا يُبنى ثانيةً (`ق-١٨٧`).
    if (inv.zatcaQrPayload) return inv.zatcaQrPayload;

    /**
     * ⚠️ **معاملةُ المستدعي تُستعمل إن وُجدت — ولا تُفتح ثانيةٌ داخلها**
     * (`ق-٣٦٠`).
     *
     * **العطلُ المقيس**: `PosService.ring` يفتح معاملةً، ثم يُنادي هذه من
     * داخلها، **فكانت تفتح معاملةً ثانية**. ⇒ **كلُّ بيعةٍ طائرة تمسك اتصالاً
     * وتطلب ثانياً** — وثلاثُ بيعاتٍ متزامنة تطلب ستةً وتمسك ثلاثة. **فإن كان
     * مجموعُ الاتصالات دونها وقع تجويعٌ تامّ**: كلٌّ ينتظر ما لن يُفرَج عنه،
     * حتى تنتهي مهلةُ بدء المعاملة ويعود `500`.
     *
     * **ولا يظهر على جهازٍ بأنويةٍ كثيرة** (المجموع يُشتقّ من عددها) — **ظهر
     * على عتاد السير وحده**، وأصاب **ثلاث بيعاتٍ متزامنة: الحالةَ العادية في
     * متجرٍ نشط لا النادرة**.
     */
    const readCompany = (tx: Prisma.TransactionClient) =>
      tx.company.findUnique({ where: { id: companyId }, select: { legalName: true, vatNumber: true } });
    const company = tx ? await readCompany(tx) : await this.tenantPrisma.runInTenantContext(companyId, readCompany);
    return buildZatcaQr({
      sellerName: company?.legalName ?? '',
      vatNumber: company?.vatNumber ?? '',
      issued: issuedWallClock(inv),
      total: Number(inv.total),
      vatAmount: Number(inv.taxTotal),
    });
  }
}
