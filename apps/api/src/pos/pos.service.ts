import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PosCardVerification, Prisma } from '@prisma/client';
import { TenantContext } from '../auth/types';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { moneyEquals } from '../common/money/allocation';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { computeTotals, InvoicesService } from '../invoices/invoices.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { formatMessage } from '../common/i18n/messages';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { FulfilmentReport } from '../invoices/sale-fulfilment.util';
import { CloseShiftDto, CreatePosSaleDto, OpenShiftDto, PosSaleLineDto, SyncPosSaleDto } from './dto/pos.dto';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { toBaseAmount } from '../common/currency/base-amount.util';
import {
  NETWORK_RECEIVABLE_CODE,
  NETWORK_RECEIVABLE_NAME,
  getOrCreateAccountByCode,
  postShiftVarianceEntry,
} from '../journal/pos-settlement.util';
import { assertBuyerKindDeclared } from '../customers/buyer-kind.util';
import { invoiceTypeFor } from '../zatca/hash-chain.util';
import { translate } from '../common/i18n/messages';
import { PaymentsService } from '../payments/payments.service';
import { localDateOf } from '../common/wall-clock.util';
import { rateForCategory } from '../common/vat/line-tax.util';
import { ZatcaService } from '../zatca/zatca.service';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { listItems, pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';
import { LINE_ORDER } from '../common/document-lines.util';

/** حقولُ البحث المُعلَنة للمناوبات (`ق-١٢٣٦`) — اسمُ من فتحها وملاحظاتُ الإقفال. */
const SHIFT_SEARCH_FIELDS = ['openedByName', 'notes'] as const;

// ⑧ كان هنا `POS_TAX_RATE = 15` — نسبةٌ ثابتةٌ لكلِّ سطرٍ يرنّه الكاشير، فتُرَنّ الأدويةُ (نسبة الصفر)
// بالنسبة الأساسية. صارت الفئةُ تُقرأ من بطاقة الصنف لحظةَ البيع والنسبةُ تُشتقّ منها (`ق-١٢١٢`):
// الكاشيرُ **يقرأ فقط** ولا يختار فئةً ولا نسبة (`§3.5` في الموجز).

/**
 * يومُ الإقفال **بتقويم الكاشير** عند منتصف ليل `UTC` — الشكلُ الذي يقرؤه `@db.Date` (`ق-٧٣٦`).
 *
 * ⚠️ كان هنا `new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))` بحسبان أنه «يومُ
 * الجهاز» — **وهو يومُ الخادم**، والخادمُ المنشور بلا منطقة (`UTC`) — فكان يومَ `UTC` متنكّراً في زيّ يومٍ
 * محلّي: مناوبةٌ تُقفل الحاديةَ صباحاً بتوقيت الرياض تُؤرَّخ بالأمس، وإن كان شهرُه مقفلاً رُفض الإقفال.
 * فالمصدرُ الصحيح **انحرافُ الطرفية** كما في البيع (`ringOffsetMin`)؛ وبلا انحرافٍ (طرفيةٌ أقدم) يومُ `UTC`
 * **صراحةً** لا خلسةً — حدٌّ معلَن.
 */
export function settlementDate(offsetMin: number | undefined, now = new Date()): Date {
  return new Date(`${localDateOf(now, offsetMin ?? 0)}T00:00:00.000Z`);
}

/** اسم عميل المرور الافتراضي — created once per company, then reused. */
const WALK_IN_CUSTOMER = 'عميل نقدي';

/** ما يُقرأ مع فاتورة البيع للإيصال — مصدرٌ واحد للمباشر والمزامَن والمكرَّر ومحاولة الدفع. */
// الإيصالُ بترتيب السلّة المعلَن (`ق-١٤١٢`) — والثابتُ الواحد يحمله إلى كلِّ قراءةٍ لبيع (الإتمام · المزامنة · الإيصال).
const SALE_INCLUDE = { lines: LINE_ORDER, customer: true, posPayments: true } as const;
type SaleRow = Prisma.InvoiceGetPayload<{ include: typeof SALE_INCLUDE }>;

/** جزءُ دفعٍ واحد — نقدٌ أو بطاقة بمبلغه. */
export interface SalePart {
  method: 'CASH' | 'CARD';
  amount: number;
}

/**
 * **البيعُ محضَّراً قبل أيّ كتابة** (`ق-١٤٠١`): المستندُ بسطوره وأسعاره وفئاته لحظةَ الرنّ، وأجزاءُ دفعه. هو ما يُحفظ لقطةً
 * في محاولة الدفع، ومنه وحدَه تُنشأ الفاتورةُ عند الإتمام.
 */
export interface PreparedSale {
  shiftId: string;
  shiftBranchId: string | null;
  invoiceDto: CreateInvoiceDto;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  parts: SalePart[];
  total: number;
  cardAmount: number;
  cardParts: number;
}

/** ⚖️ **بمَ ثبت دفعُ جزء البطاقة** (`ق-١٣٩٧` · `ق-١٣٩٩`) — يُكتب على صفّ البطاقة وحدَه. */
export interface CardProof {
  verification: PosCardVerification;
  providerRef?: string | null;
  approvalCode?: string | null;
  deviceReference?: string | null;
  attemptId?: string | null;
}

/** البيعُ كما يخرج من معاملة الإتمام — قبل الختم. */
export type SoldSale = SaleRow & { zatcaQr: string | null; zatcaStamped: boolean; stockDeduction: StockDeductionReport; clearanceRequired: boolean };

/**
 * تقرير خصم المخزون المرفق بردّ البيع (معلوماتي فقط — الرصيد نفسه يبقى
 * مشتقاً من دفتر الحركات وحده، قاعدة 11: لا حالة موازية).
 *
 * `deducted: false` هو سلوك التراجع الصريح، لا عطلاً: وردية بلا فرع، أو فرع
 * بلا مستودع مربوط، أو سلة كلها بنود غير مخزنية — البيع يمضي والخصم يُتخطى.
 */
export type StockDeductionReport =
  | {
      deducted: true;
      warehouseId: string;
      /** عدد حركات OUT المُنشأة (حركة لكل بند مخزني). */
      movements: number;
      /** بنود هبط رصيدها تحت الصفر — تحذير ناعم لا مانع، كسياسة المخزون القائمة. */
      belowZero: { productId: string; resultingQty: string }[];
    }
  | { deducted: false; reason: 'NO_BRANCH_WAREHOUSE' | 'NO_TRACKED_PRODUCTS' };

/**
 * يترجم تقرير التسليم (`م٦`) إلى شكل التقرير الذي يعرفه الكاشير.
 *
 * ⚠️ **والشكل يبقى كما هو عمداً**: الخصم انتقل مالكُه من الكاشير إلى سطر
 * الفاتورة، **وهذا تغييرٌ داخليّ لا يخصّ من يقرأ الردّ**. فمن غيّر الشكل مع
 * المالك أجبر كل واجهةٍ على تتبّع إعادة تنظيمٍ لا تعنيها.
 */
function toDeductionReport(f: FulfilmentReport | undefined): StockDeductionReport {
  if (!f || !f.fulfilled) {
    return { deducted: false, reason: f?.reason === 'NO_TRACKED_PRODUCTS' ? 'NO_TRACKED_PRODUCTS' : 'NO_BRANCH_WAREHOUSE' };
  }
  // ② الكمّيةُ نصّاً بثلاث خانات (`ق-١٢٣٥`) تصل من صورة حدّ التسليم نفسِها — تُمرَّر ولا تُعاد صياغتها.
  return { deducted: true, warehouseId: f.warehouseId, movements: f.movements, belowZero: f.belowZero.map((b) => ({ productId: b.productId, resultingQty: b.resultingQty })) };
}

/** مجاميعُ المناوبة رقماً — للحساب داخل الخادم (فرقُ الجرد · قيدُ الفرق). */
interface ShiftTotalsNumeric {
  salesCount: number;
  cashTotal: number;
  cardTotal: number;
  /** openingFloat + cashTotal — what should be in the drawer. */
  expectedCash: number;
}

/**
 * ② مجاميعُ المناوبة كما تخرج للكاشير — **المالُ نصّاً بخانتين** (`ق-١٢٣٥` · النطاقُ الثاني):
 * `cashTotal` · `cardTotal` · `expectedCash` نصٌّ من `money()`، والعدُّ رقمٌ كما هو.
 */
export interface ShiftTotals {
  salesCount: number;
  cashTotal: string;
  cardTotal: string;
  /** openingFloat + cashTotal — what should be in the drawer. */
  expectedCash: string;
}

const totalsText = (t: ShiftTotalsNumeric): ShiftTotals => ({
  salesCount: t.salesCount,
  cashTotal: money(t.cashTotal),
  cardTotal: money(t.cardTotal),
  expectedCash: money(t.expectedCash),
});

/**
 * الكاشير (مستند §6، النسخة الأولى — أونلاين): مناوبات + بيع يُسجَّل كفاتورة
 * حقيقية مدفوعة.
 *
 * A POS sale is not a parallel document type: it goes through
 * InvoicesService.create — same numbering chain, same VAT math, same ledger
 * auto-posting — then gets stamped PAID onto the open shift. The drawer's
 * expected cash is *derived* from those invoices, never accumulated in a
 * mutable counter that could drift.
 */
@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly integrationsService: IntegrationsService,
    private readonly zatca: ZatcaService,
    // سندُ قبض البيع بالمسار المبنيّ لا بمسارٍ ثانٍ (ق-٣١٦).
    private readonly payments: PaymentsService,
  ) {}

  /**
   * **على مستوى المنشأة بحقّها**: مناوبةُ الكاشير المفتوحة تُبحث بهويّته لا
   * بفرعه — فمناوبةٌ فتحها في فرعٍ لم يعد يراه تبقى مفتوحةً ويجب أن تمنعه من
   * ثانية، والفرعُ الجديد يُقاس بعدها بـ`resolveBranchId`.
   *
   * **صندوقُه لا يُقاس هنا**: الدرجُ يُقاس في `resolveDrawerId` بقاعدةٍ أشدّ من `ق-١٤٣٧` — مطابقةٌ تامّةٌ لفرع المناوبة
   * (`cash_drawer_branch_mismatch`)، فلا درجَ للمنشأة في مناوبة فرعٍ ولا درجَ فرعٍ في مناوبةٍ بلا فرع.
   */
  openShift(tenant: TenantContext, dto: OpenShiftDto) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      // One open drawer per cashier: a second float with the first still open
      // is how cash goes missing between counts.
      const open = await tx.posShift.findFirst({ where: { status: 'OPEN', openedById: tenant.profileId } });
      if (open) throw new ConflictException(MSG.pos_shift_already_open);

      /**
       * 🔴 **الفرعُ يُقاس على فروع المستخدم لا على وجوده وحده** (`ق-٥١٢`).
       *
       * **كان هنا فحصُ وجودٍ وحده** — **فمستخدمٌ مقصورٌ على فرعٍ يفتح مناوبةً
       * على فرعٍ آخر**، **ونقدُه يقع في درجٍ ليس له**. **ولا يُكشَف بالاستعمال**:
       * البياناتُ تبدو صحيحةً لمن يراها.
       *
       * ⇒ **والمصدرُ الواحد هو `resolveBranchId`** — يتحقّق من الوجود **ثم من
       * الإذن** (`assertBranchAllowed`)، **وهو ما تمرّ به تسعُ خدماتٍ أخرى**.
       */
      const branchId = await resolveBranchId(tx, dto.branchId, tenant.allowedBranchIds);

      const drawerId = await this.resolveDrawerId(tx, dto, branchId);

      return tx.posShift.create({
        data: {
          branchId,
          drawerId,
          openedById: tenant.profileId,
          openedByName: await this.actorName(tx, tenant),
          openingFloat: dto.openingFloat,
        } as unknown as Prisma.PosShiftUncheckedCreateInput,
      });
    });
  }

  /**
   * درجُ المناوبة (`ق-٢١٨` · `ق-٢٦١`): **مُسمّىً إن اختاره الكاشير، وإلا فالدرجُ
   * الافتراضيُّ لفرعها**.
   *
   * ⚠️ **وفراغُه معلَنٌ لا مسكوتٌ عنه**: منشأةٌ بلا أدراجٍ بعدُ تفتح مناوبةً بلا
   * درج — فلا يُخترع لها درجٌ من فتح مناوبة. والدرجُ يُنشئه المالك من الإعدادات،
   * والترحيلُ إلى حسابه يأتي في الدفعة التالية.
   *
   * **على مستوى المنشأة بحقّها**: الفرعُ هنا مُحلَّلٌ بـ`resolveBranchId` قبل
   * الاستدعاء — فالمرشِّحُ معرّفُ فرعٍ مأذونٍ للكاشير لا قائمةُ رؤيته، والدرجُ
   * المختارُ يُقاس على الفرع نفسِه.
   */
  private async resolveDrawerId(tx: Prisma.TransactionClient, dto: OpenShiftDto, branchId: string | null): Promise<string | null> {
    if (dto.drawerId) {
      const chosen = await tx.cashDrawer.findUnique({ where: { id: dto.drawerId } });
      if (!chosen) throw new NotFoundException(MSG.cash_drawer_not_found);
      if (!chosen.isActive) throw new ConflictException(formatMessage(MSG.cash_drawer_inactive, { name: chosen.name }));
      // درجٌ لفرعٍ آخر يجعل نقدَ فرعٍ في حساب فرعٍ ثانٍ — وهو عينُ ما بُني الدرجُ لمنعه.
      if ((chosen.branchId ?? null) !== branchId) {
        throw new ConflictException(formatMessage(MSG.cash_drawer_branch_mismatch, { name: chosen.name }));
      }
      return chosen.id;
    }
    const preferred = await tx.cashDrawer.findFirst({ where: { branchId, isDefault: true, isActive: true } });
    if (preferred) return preferred.id;

    // ولا افتراضيَّ للفرع (منشأةٌ أنشأت أدراجَها بيدها): **درجٌ نشِطٌ واحدٌ يُؤخذ،
    // وأكثرُ من واحدٍ يُترك للاختيار** — فاختيارُ الأول من عدّةٍ يزعم ترتيباً لا
    // معنى له، ويضع نقدَ درجٍ في حساب آخر بلا أن يُسأل أحد.
    const active = await tx.cashDrawer.findMany({ where: { branchId, isActive: true }, take: 2 });
    return active.length === 1 ? active[0].id : null;
  }

  /**
   * The caller's open shift with live drawer math — null when none is open.
   *
   * **على مستوى المنشأة بحقّها**: المناوبةُ الحالية هي مناوبةُ الكاشير نفسِه —
   * مفتاحُها هويّتُه لا فرعُه، ولا تُعرض مناوبةُ غيره من هذا المسار.
   */
  currentShift(tenant: TenantContext) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const shift = await tx.posShift.findFirst({ where: { status: 'OPEN', openedById: tenant.profileId } });
      if (!shift) return null;
      return { ...shift, ...totalsText(await this.totalsFor(tx, shift.id, Number(shift.openingFloat))) };
    });
  }

  /**
   * ⚠️ **كانت تعرض مناوباتِ المنشأة كلِّها بمجاميع نقدها** — لكلّ من يملك شاشةَ
   * نقطة البيع. **فكاشيرُ فرعٍ يقرأ صندوقَ كلّ فرعٍ آخر مناوبةً مناوبة** (`ق-٥١٧`).
   * والآن مقصورةٌ على فروع القارئ — كالفواتير والأدراج سواء.
   */
  listShifts(companyId: string, allowedBranchIds: string[] | 'all', query?: PagedQueryDto) {
    const where: Prisma.PosShiftWhereInput = { ...branchFilter(allowedBranchIds), ...searchWhere(searchTerm(query), SHIFT_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const result = await pagedFindMany(query, tx.posShift, { where, orderBy: { openedAt: 'desc' } });
      // المجاميعُ للمناوبات المُعادة وحدَها (القائمةُ كلُّها أو الصفحة) — فلا تُحسب مناوبةٌ خارج النافذة.
      const shifts = listItems(result);
      const totals = await this.totalsForMany(tx, shifts);
      const withTotals = shifts.map((s) => ({ ...s, ...totalsText(totals.get(s.id)!) }));
      return Array.isArray(result) ? withTotals : { ...result, items: withTotals };
    });
  }

  closeShift(tenant: TenantContext, id: string, dto: CloseShiftDto) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const shift = await tx.posShift.findUnique({ where: { id } });
      if (!shift) throw new NotFoundException(MSG.pos_shift_not_found);
      if (shift.status === 'CLOSED') throw new ConflictException(MSG.pos_shift_closed);
      // A cashier closes their own drawer; the owner can close anyone's
      // (an employee who left with a shift still open must not wedge it).
      if (shift.openedById !== tenant.profileId && tenant.actorType !== 'COMPANY') {
        throw new ForbiddenException(MSG.pos_not_your_shift);
      }

      /**
       * ⚖️ **المعلّقُ لا يحبس المناوبةَ أبداً** (`ق-١٤١٨` · التوجيه ٢٦٣ §٥ بنصّ المالك: «تُقفل وهو فيها مسمّىً، وينتقل إلى
       * قائمة المطابقة بالتسوية ⇒ فلا يُخمَّن، ولا يُحبس التاجرُ عن إقفال يومه») — **ونسخ `409` الذي كان هنا** (`ق-١٤٠١`).
       * محاولةُ بطاقةٍ تُشحن أو معلّقةٌ أو مقبولةٌ لم تكتمل **تبقى بحالها**: تُسمّى في ردّ الإقفال، وتظهر في قائمة المطابقة
       * (`card-verifications` · `unresolvedAttempts`) حتى يحسمها جوابُ المزوّد (الكانس) أو الدليل — **والنقدُ لا يمسّه شيءٌ منها**:
       * بطاقةٌ لا درج، فجردُ الدرج يُبنى على ما فيه.
       * **وما لم يُرسل بعد (`CREATED`) يُلغى مع الإقفال**: لا مالَ فيه، وإبقاؤه يُشحن على مناوبةٍ مقفلة.
       */
      const pendingAttempts = await tx.posPaymentAttempt.findMany({
        where: { shiftId: id, status: { in: ['CHARGING', 'UNKNOWN', 'APPROVED'] } },
        select: { id: true, status: true, cardAmount: true, clientSaleId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      await tx.posPaymentAttempt.updateMany({ where: { shiftId: id, status: 'CREATED' }, data: { status: 'CANCELLED', resolution: 'CANCELLED', resolvedAt: new Date() } });

      const totals = await this.totalsFor(tx, shift.id, Number(shift.openingFloat));
      /** موجب = زيادة في الدرج، سالب = عجز. */
      const variance = round2(dto.declaredClosing - totals.expectedCash);

      const closed = await tx.posShift.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), declaredClosing: dto.declaredClosing, notes: dto.notes, variance },
      });

      /**
       * ⭐ **العمودُ والقيدُ في المعاملة نفسها** (`ق-٣٠٨`، شرطُ المالك الأول).
       *
       * سقوطُ أحدهما يُسقط الإقفال: **تخزينُ الفرق بلا ترحيله يُعيد إنتاج
       * «رقمٍ يتحرك بلا قيدٍ يسنده»** — وهو العطلُ الذي أُغلقت الكتلةُ لأجله.
       * **وصفرُ الفرق لا يُرحَّل قيداً** (الشرط الثاني) — الدالّةُ تعيد `null`.
       */
      const drawer = shift.drawerId
        ? await tx.cashDrawer.findUnique({ where: { id: shift.drawerId }, select: { accountId: true } })
        : null;
      await postShiftVarianceEntry(tx, tenant.companyId, {
        shiftNo: shift.id.slice(0, 8),
        // ⚖️ يومُ الكاشير من انحراف طرفيته (`ق-٧٣٦`) — لا يومُ الخادم؛ وبلا انحرافٍ يومُ `UTC` صراحةً.
        date: settlementDate(dto.closedOffsetMin),
        branchId: shift.branchId,
        drawerAccountId: drawer?.accountId ?? null,
        variance,
      });

      // ② الفرقُ نصّاً بخانتين كسائر المبالغ (`ق-١٢٣٥`) — موجبٌ زيادةٌ وسالبٌ عجزٌ، والإشارةُ تُقرأ بـ`num()` في الشاشة.
      return {
        ...closed,
        ...totalsText(totals),
        variance: money(variance),
        // مسمّاةً في ردّ الإقفال (`ق-١٤١٨`) — ومنه إلى قائمة المطابقة حتى تُحسم.
        pendingAttempts: pendingAttempts.map((a) => ({
          id: a.id,
          status: a.status,
          cardAmount: money(a.cardAmount),
          clientSaleId: a.clientSaleId,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    });
  }

  /** بيع كاشير: فاتورة حقيقية (ترقيم/ضريبة/قيد) تُختم مدفوعةً على المناوبة. */
  createSale(tenant: TenantContext, dto: CreatePosSaleDto) {
    return this.ringDirect(tenant, dto, { ringAt: dto.ringAt, ringOffsetMin: dto.ringOffsetMin, cardDeviceReference: dto.cardDeviceReference });
  }

  /**
   * مزامنة بيع سُجّل أوفلاين (مستند §6 v2) — idempotent بمعرّف الطرفية:
   * resending the same clientSaleId returns the SAME invoice, never a copy.
   * The real invoice number is assigned HERE, centrally — two terminals that
   * sold offline at the same moment can therefore never collide on numbering,
   * which is exactly the conflict the requirements doc flags.
   */
  async syncSale(tenant: TenantContext, dto: SyncPosSaleDto) {
    const existing = await this.findByClientSaleId(tenant.companyId, dto.clientSaleId);
    if (existing) return this.withReceiptQr(tenant.companyId, existing);
    try {
      const sold = await this.ringDirect(tenant, dto, {
        clientSaleId: dto.clientSaleId,
        offlineRef: dto.offlineRef,
        ringAt: dto.ringAt,
        ringOffsetMin: dto.ringOffsetMin,
        // بيع أوفلاين أُخذت بطاقته على الجهاز وقت الانقطاع — لا نعيد تمريرها عند المزامنة؛
        // **ورقمُ مرجع الجهاز من إيصاله إلزاميٌّ والربطُ فعّال** (`ق-١٣٩٧`).
        viaSync: true,
        cardDeviceReference: dto.cardDeviceReference,
      });
      // (ج) `ق-١٩٢`: واقعةُ الانقطاع تُستنتَج بعد أن التزم البيع — وسقوطُ استنتاجها
      // لا يُسقط بيعاً التزم؛ يُسجَّل ويُقاس لا يُعمّى.
      await this.recordOfflineIncident(tenant.companyId, sold.id, dto.ringAt).catch((e: Error) =>
        this.logger.warn(`تعذّر استنتاج واقعة الانقطاع للبيع ${sold.id}: ${e.message}`),
      );
      return sold;
    } catch (e) {
      // Two terminals racing the same clientSaleId: the loser reads the
      // winner's row — the caller cannot tell the difference, by design.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.findByClientSaleId(tenant.companyId, dto.clientSaleId);
        if (winner) return this.withReceiptQr(tenant.companyId, winner);
      }
      throw e;
    }
  }

  /**
   * ⭐ **واقعةُ انقطاعٍ مستنتَجة على الخادم** (`ق-١٩٢`/ج · `ق-٢٠١`).
   *
   * لا هويةَ طرفيةٍ عندنا، فالانقطاع يُستنتَج من البيوع المزامَنة: بيعٌ رنَّ قبل
   * مزامنته بأكثر من **حدّ الفصل** (إعدادُ المنشأة `posOfflineGapMinutes`) وقع في
   * انقطاع. **والنافذة من أزمنة الرنّ لا من ترتيب الوصول** (`ق-٢٠١`/٣): المزامنة
   * تصل مبعثرةً — الأحدثُ قبل الأقدم، أو بيعٌ متأخّر يقع **بين** واقعتَين قائمتَين
   * فيجسرهما — فتُلتقط كلُّ الوقائع التي تتقاطع نافذتُها `[الرنّ − الحدّ، الرنّ + الحدّ]`
   * وتُدمَج في أولها؛ بيوعُ المدموجة تُعاد إلى الباقية **قبل** حذفها.
   *
   * حدُّ الاستنتاج يُحفظ مع الواقعة ويُعرَض في التقرير: **استنتاجٌ لا قياس**.
   * وبيعٌ تأخّرُه دون الحدّ ليس انقطاعاً — بطء شبكةٍ لا غيابُها.
   */
  private async recordOfflineIncident(companyId: string, invoiceId: string, ringAtIso: string | undefined, now = new Date()): Promise<string | null> {
    if (!ringAtIso) return null;
    const ringAt = new Date(ringAtIso);
    if (Number.isNaN(ringAt.getTime())) return null;
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // قفلٌ استشاريّ على المنشأة داخل المعاملة (`ق-٢٠١`/٣): ثلاث مزامناتٍ تصل في
      // لحظةٍ واحدة تقرأ «لا واقعةَ متقاطعة» ثلاثتُها فتُنشئ ثلاثاً. القياس (⑥) مرّ
      // مرةً بلا قفل — والآلية لا تُترك للحظّ. يُحرَّر مع الالتزام.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pos_offline_incident:' + companyId}))`;
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { posOfflineGapMinutes: true } });
      const gapMs = company.posOfflineGapMinutes * 60_000;
      if (now.getTime() - ringAt.getTime() < gapMs) return null;

      const lo = new Date(ringAt.getTime() - gapMs);
      const hi = new Date(ringAt.getTime() + gapMs);
      const overlapping = await tx.posOfflineIncident.findMany({
        where: { startedAt: { lte: hi }, endedAt: { gte: lo } },
        orderBy: { startedAt: 'asc' },
      });

      if (overlapping.length === 0) {
        const created = await tx.posOfflineIncident.create({
          data: { companyId, startedAt: ringAt, endedAt: ringAt, firstSyncedAt: now, gapMinutes: company.posOfflineGapMinutes },
        });
        await tx.invoice.update({ where: { id: invoiceId }, data: { offlineIncidentId: created.id } });
        return created.id;
      }

      const [survivor, ...absorbed] = overlapping;
      const times = [ringAt, ...overlapping.map((i) => i.startedAt), ...overlapping.map((i) => i.endedAt)].map((d) => d.getTime());
      const startedAt = new Date(Math.min(...times));
      const endedAt = new Date(Math.max(...times));
      const firstSyncedAt = new Date(Math.min(now.getTime(), ...overlapping.map((i) => i.firstSyncedAt.getTime())));
      if (absorbed.length > 0) {
        // جَسْرٌ: بيعٌ متأخّر ربط واقعتَين — بيوعُهما تُعاد أولاً، ثم تُحذف الفارغة.
        const ids = absorbed.map((a) => a.id);
        await tx.invoice.updateMany({ where: { offlineIncidentId: { in: ids } }, data: { offlineIncidentId: survivor.id } });
        await tx.posOfflineIncident.deleteMany({ where: { id: { in: ids } } });
      }
      await tx.posOfflineIncident.update({ where: { id: survivor.id }, data: { startedAt, endedAt, firstSyncedAt } });
      await tx.invoice.update({ where: { id: invoiceId }, data: { offlineIncidentId: survivor.id } });
      return survivor.id;
    });
  }

  /** تقريرُ وقائع الانقطاع — بحدّ الاستنتاج ظاهراً مع كل واقعة (`ق-٢٠١`/٢ب). */
  listIncidents(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const [company, rows] = await Promise.all([
        tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { posOfflineGapMinutes: true } }),
        tx.posOfflineIncident.findMany({ orderBy: { startedAt: 'desc' }, take: 100, include: { _count: { select: { invoices: true } } } }),
      ]);
      return {
        /** استنتاجٌ من أزمنة رنّ البيوع المزامَنة — لا قياسٌ من الجهاز. */
        inferred: true as const,
        gapMinutes: company.posOfflineGapMinutes,
        items: rows.map((r) => ({
          id: r.id,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          firstSyncedAt: r.firstSyncedAt,
          gapMinutes: r.gapMinutes,
          durationMinutes: Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 60_000),
          salesCount: r._count.invoices,
        })),
      };
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: مفتاحُ البيع من الجهاز (`clientSaleId`) فريدٌ
   * في المنشأة، والبحثُ به يمنع تكرارَ البيعة عند المزامنة أياً كان فرعُها —
   * وحجبُه يُصدر الفاتورةَ مرّتين.
   */
  private findByClientSaleId(companyId: string, clientSaleId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findFirst({ where: { clientSaleId }, include: SALE_INCLUDE }));
  }

  /**
   * إيصالُ بيعٍ مكتمل بمعرّف فاتورته — لمحاولة دفعٍ اكتملت قبل هذا الطلب (إعادةُ الشحن أو القراءة).
   * **على مستوى المنشأة بحقّها**: الفاتورةُ تُبلغ عبر محاولةٍ قُرئت مرشَّحةً بفروع القارئ أو هي محاولتُه.
   */
  async receiptFor(companyId: string, invoiceId: string) {
    const invoice = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.findUnique({ where: { id: invoiceId }, include: SALE_INCLUDE }));
    return invoice ? this.withReceiptQr(companyId, invoice) : null;
  }

  /**
   * **على مستوى المنشأة بحقّها**: البيعُ يقع في مناوبة الكاشير المفتوحة —
   * مفتاحُها هويّتُه، وفرعُ المناوبة هو ما يُقاس عليه البيعُ لا العكس، فلا
   * قائمةَ فروعٍ في هذا الاستعلام أصلاً.
   */
  /**
   * ⭐ **تحضيرُ البيع — تحقّقٌ وبناءُ مستندٍ بلا كتابةٍ ولا شحن** (`ق-١٤٠١`).
   *
   * ما كان المعاملةَ الأولى من ثلاثٍ في `ring()`: المناوبة · الأصناف · صفةُ المشتري · يومُ الجهاز · السطورُ بفئاتها ·
   * الدفعُ المقسّم بالدالّة الواحدة. **وكان الشحنُ داخلها** — فجهازٌ يستغرق ستّ ثوانٍ في معاملة الخمس ⟸ المالُ قُبل
   * والبيعُ سقط `500` (القياس ② في الموجز). **الآن لا شحنَ هنا**: البيعُ بلا ربطٍ يُتمّ في المعاملة نفسِها
   * (`completeSaleWithinTx`)، والبطاقةُ والربطُ فعّال تُحفظ لقطتُها في محاولة دفعٍ تُشحن خارج كلِّ معاملة.
   *
   * (ومستودعُ الفرع لم يعد يُقرأ هنا: الخصمُ صار مالكُه سطرَ الفاتورة — `م٦` — وكان المتغيّرُ يُحسب ولا يُقرأ.)
   */
  async prepareSale(tx: Prisma.TransactionClient, tenant: TenantContext, dto: CreatePosSaleDto, opts: { ringAt?: string; ringOffsetMin?: number }): Promise<PreparedSale> {
      const shift = await tx.posShift.findFirst({ where: { status: 'OPEN', openedById: tenant.profileId } });
      if (!shift) throw new ConflictException(MSG.pos_no_open_shift);

      const ids = dto.lines.map((l) => l.productId);
      const products = await tx.product.findMany({ where: { id: { in: ids } } });
      const byId = new Map(products.map((p) => [p.id, p]));
      const missing = ids.find((id) => !byId.has(id));
      if (missing) throw new NotFoundException(MSG.product_not_found);

      const customerId = dto.customerId ?? (await this.walkInCustomerId(tx));
      // ②A1: مشترٍ مسمّىً لم يُعلن صفتَه لا يُصدَر له مستند — الكاشيرُ لا يقرّر الصفة، صاحبُ المنشأة يعلنها من البطاقة.
      // ⑤A4: وصفتُه تقرّر نوعَ المستند — كاملةٌ (مؤسّسة/اعتباريّ/مسجَّل) تُجاز قبل أن تُشارَك، فيُعلَم ذلك هنا للإيصال.
      if (dto.customerId) await assertBuyerKindDeclared(tx, dto.customerId);
      /**
       * ⭐ **يومُ الفاتورة يومُ الجهاز، لا يومُ UTC ولا يومُ عودة الشبكة** (`ق-١٨٥`).
       *
       * كان يُشتقّ من `toISOString().slice(0, 10)` — تاريخُ UTC — فبيعٌ في الواحدة
       * صباحاً بتوقيت الرياض يُؤرَّخ **أمس**، وبيعٌ أوفلاين يُزامَن بعد يوم يُبلَّغ
       * بتاريخٍ خارج نافذة الـ٢٤ ساعة **ونحن من صنعها**. الآن: اللحظة من الجهاز
       * (`ringAt`) وانحرافُه معها، فيُحسب يومُه؛ وتُحفظ اللحظةُ والانحراف لمستند
       * الهيئة. طرفيةٌ لم تُرسل انحرافاً (عميلٌ أقدم) تُعامَل كما كانت: يومُ UTC
       * بلا وقتٍ معلوم — حدٌّ معلَن لا تخمين.
       */
      const rungAt = opts.ringAt ? new Date(opts.ringAt) : new Date();
      const offsetKnown = opts.ringAt !== undefined && opts.ringOffsetMin !== undefined;
      const issueDate = localDateOf(rungAt, offsetKnown ? opts.ringOffsetMin! : 0);
      const posLines = dto.lines.map((l) => {
          const p = byId.get(l.productId)!;
          /**
           * ⚠️ **`productId` يُنقل ولا يُترك عند الاسم.**
           *
           * الكاشير **يعرف الصنف يقيناً** — يبحث عنه هنا بالسطر الذي فوق —
           * وكان يحتفظ باسمه وحده. فينتج سطرُ فاتورةٍ بلا صنف، أي «خدميّ»
           * بتعريف الطبقة، **فلا تكلفةَ مبيعات له أبداً** مهما اكتملت
           * الطبقات لاحقاً.
           *
           * وهو المسار الأخطر تحديداً لأنه **الوحيد الذي يخصم من المخزون**:
           * فتخرج البضاعة من الرفّ ولا يخرج ما يقابلها من الدفتر.
           */
          return {
            description: p.name,
            productId: p.id,
            // ① وحدةُ الكمّية من بطاقة الصنف لحظةَ البيع — ولا رمزَ لصنفٍ لم يُعلنها.
            unitCode: p.unitCode ?? null,
            quantity: l.quantity,
            unitPrice: Number(p.price),
            discount: l.discount ?? 0,
            // ⑧ الفئةُ من البطاقة والنسبةُ مشتقّةٌ منها — الخادمُ يعيد حلَّها من الصنف نفسِه عند الإنشاء،
            // وتُمرَّر هنا كي تُحسب المجاميعُ (تدقيقُ الدفع المقسَّم أدناه) بالدالّة نفسِها وبالنسبة نفسِها.
            taxRate: rateForCategory(p.taxCategory),
            taxCategory: p.taxCategory as 'S' | 'Z' | 'E' | 'O',
            taxExemptionReasonCode: p.taxExemptionReasonCode ?? undefined,
            taxExemptionReason: p.taxExemptionReason ?? undefined,
          };
        });
      const invoiceDto = {
        customerId,
        issueDate,
        issuedAt: offsetKnown ? rungAt.toISOString() : undefined,
        issuedOffsetMin: offsetKnown ? opts.ringOffsetMin : undefined,
        // Paid on the spot — due = issue keeps it out of every aging bucket.
        dueDate: issueDate,
        branchId: shift.branchId ?? undefined,
        lines: posLines,
      } as CreateInvoiceDto;

      // الدفع المقسّم يُدقَّق قبل إنشاء أي شيء: نفس دالة المجاميع التي
      // ستحسب الفاتورة تتحقق أن الأجزاء تساويها — لا فاتورة نصف مدفوعة.
      const total = computeTotals(posLines).total;
      if (dto.paymentMethod === 'SPLIT') {
        if (!dto.payments?.length) throw new BadRequestException(MSG.pos_split_parts_required);
        const paid = dto.payments.reduce((sum, p) => sum + p.amount, 0);
        if (Math.abs(paid - total) > 0.01) throw new BadRequestException(MSG.pos_split_mismatch);
      } else if (dto.payments?.length) {
        throw new BadRequestException(MSG.pos_split_only_for_split);
      }
      // صفّ دفعة لكل طريقة: البيع البسيط جزءٌ واحد بكامل المبلغ، والمقسّم كما فصّله الكاشير.
      const parts: SalePart[] = dto.paymentMethod === 'SPLIT' ? dto.payments!.map((p) => ({ method: p.method, amount: p.amount })) : [{ method: dto.paymentMethod, amount: total }];
      const cardParts = parts.filter((p) => p.method === 'CARD');
      return {
        shiftId: shift.id,
        shiftBranchId: shift.branchId,
        invoiceDto,
        paymentMethod: dto.paymentMethod,
        parts,
        total,
        cardAmount: round2(cardParts.reduce((sum, p) => sum + p.amount, 0)),
        cardParts: cardParts.length,
      };
  }

  /**
   * ⭐ **بمَ يثبت جزءُ البطاقة في البيع المباشر** (`ق-١٣٩٧` · الموجز ٢.١ و٢.١٠ · `ق-١٤١٩`).
   *
   * - **والربطُ فعّال**: **المسارُ الحيّ يرفض** جزءَ البطاقة (يمرّ بمحاولة الدفع — فلا مالَ يُقبل لدى المزوّد بلا بيعٍ
   *   يُسجَّل)؛ **والمزامنةُ تقبله بثلاثة شروط** (`ق-١٣٩٧`): رقمُ مرجع الجهاز **إلزاميٌّ من إيصاله** · ويُعلَّم «غيرَ متحقَّق»
   *   حتى تطالب به تسويةُ الشبكة · وما لم يُطابَق بعد مهلتها يُرفع للمراجعة باسم الكاشير. **وجزءٌ واحد**: عمليةٌ واحدة
   *   على الجهاز لها مرجعٌ واحد.
   * - ⚖️ **وبلا ربطٍ فعّال — جهازٌ مستقلّ — الحكمُ نفسُه** (`ق-١٤١٩` · التوجيه ٢٦٣ §٥ بنصّ المالك: «يسري عليه شرطُ رقم
   *   المرجع كبيع البطاقة دون اتصال، فالحكمُ واحد»): رقمُ المرجع إلزاميّ وجزءٌ واحد، ويُعلَّم «غيرَ متحقَّق» حتى تطابقه
   *   التسوية — **ونسخ «أكّده الكاشير» (`CASHIER_CONFIRMED`) للبيع الجديد**؛ وما كُتب به قبل هذا يبقى كما هو.
   */
  private async directCardProof(tx: Prisma.TransactionClient, prepared: PreparedSale, opts: { viaSync?: boolean; cardDeviceReference?: string }): Promise<CardProof> {
    const reference = opts.cardDeviceReference?.trim() || null;
    const gateway = await this.integrationsService.activeGateway(tx);
    if (gateway && !opts.viaSync) throw new ConflictException(MSG.pos_card_requires_attempt);
    if (prepared.cardParts > 1) throw new BadRequestException(MSG.pos_card_single_part);
    if (!reference) throw new BadRequestException(MSG.pos_card_device_reference_required);
    return { verification: 'DEVICE_REFERENCE', deviceReference: reference };
  }

  /**
   * ⭐ **البيعُ المباشر — تحضيرٌ وإتمامٌ في معاملةٍ واحدة** (`ق-١٤٠١` · `ق-١٣٩٤`).
   *
   * كان ثلاثَ معاملات، فسقوطُ الأخيرة يترك فاتورةً يتيمة `DUE` بقيدٍ مرحَّل، **وإعادةُ المزامنة بالمعرّف نفسِه فاتورةٌ ثانية**
   * — «بيعٌ واحد ⟸ فاتورتان، ولو كان نقداً» (القياس ③). الآن: **سقوطُ أيّ خطوةٍ لا يترك شيئاً، وإعادتُها بالمعرّف نفسِه
   * تُنتج فاتورةً واحدة** — ومعرّفُ البيع يُفحص **داخل** المعاملة نفسِها، ويُلفّ الكلُّ بإعادة المحاولة على تعارض الترقيم.
   *
   * **على مستوى المنشأة بحقّها**: معرّفُ البيع من الجهاز (`clientSaleId`) فريدٌ في المنشأة، والبحثُ به يمنع تكرارَ البيعة أياً كان
   * فرعُها — وحجبُه يُصدر الفاتورةَ مرّتين.
   */
  private async ringDirect(
    tenant: TenantContext,
    dto: CreatePosSaleDto,
    opts: { clientSaleId?: string; offlineRef?: string; ringAt?: string; ringOffsetMin?: number; viaSync?: boolean; cardDeviceReference?: string },
  ) {
    const outcome = await retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx): Promise<{ kind: 'replay'; invoice: SaleRow } | { kind: 'sold'; sold: SoldSale }> => {
        if (opts.clientSaleId) {
          const replay = await tx.invoice.findFirst({ where: { clientSaleId: opts.clientSaleId }, include: SALE_INCLUDE });
          if (replay) return { kind: 'replay', invoice: replay };
          await this.releaseUnsentAttempt(tx, opts.clientSaleId);
        }
        const prepared = await this.prepareSale(tx, tenant, dto, opts);
        const card = prepared.cardAmount > 0 ? await this.directCardProof(tx, prepared, opts) : undefined;
        const sold = await this.completeSaleWithinTx(tx, {
          companyId: tenant.companyId,
          allowedBranchIds: tenant.allowedBranchIds,
          prepared,
          clientSaleId: opts.clientSaleId,
          offlineRef: opts.offlineRef,
          card,
        });
        return { kind: 'sold', sold };
      }),
    );
    if (outcome.kind === 'replay') return this.withReceiptQr(tenant.companyId, outcome.invoice);
    return this.finishReceipt(tenant.companyId, outcome.sold);
  }

  /**
   * بيعٌ يصل بالمزامنة ولمعرّفه محاولةُ دفعٍ عبر المزوّد (`ق-١٤٠١`): **لم تُرسل بعد ⟸ تُلغى** (لا مالَ فيها، والبيعُ يُسجَّل
   * بالمزامنة) · **تُشحن أو معلّقةٌ أو قبلها المزوّدُ ولم تكتمل ⟸ `409`** — تُحسم أوّلاً، **ولا يُسجَّل البيعُ مرّتين**.
   * المرفوضةُ والملغاةُ منتهيتان فلا تمنعان.
   */
  private async releaseUnsentAttempt(tx: Prisma.TransactionClient, clientSaleId: string): Promise<void> {
    const attempt = await tx.posPaymentAttempt.findFirst({ where: { clientSaleId }, select: { id: true, status: true } });
    if (!attempt) return;
    if (attempt.status === 'CHARGING' || attempt.status === 'UNKNOWN' || attempt.status === 'APPROVED') throw new ConflictException(MSG.pos_attempt_in_flight);
    if (attempt.status === 'CREATED') {
      await tx.posPaymentAttempt.updateMany({ where: { id: attempt.id, status: 'CREATED' }, data: { status: 'CANCELLED', resolution: 'CANCELLED', resolvedAt: new Date() } });
    }
  }

  /**
   * ⭐ **الإتمامُ الذرّيّ — لكلِّ المسارات** (`ق-١٤٠١` · الموجز ٢.٥).
   *
   * الفاتورةُ (رقمُها · قيدُها · خصمُها · حدثُ الهيئة) **وصفوفُ الدفع وسنداتُها وختمُ `PAID` ومعرّفُ البيع** في معاملة
   * المستدعي وحدَها: سقوطُ أيّ خطوةٍ يُسقطها كلَّها. والمستدعي مسؤولٌ عن إعادة المحاولة على تعارض الترقيم حول معاملته.
   * ومحاولةُ الدفع تستدعيه بلقطتها (`trustLineTax`) وبما شُحن (`expectedTotal`) — فلا يُتمّ بيعٌ على مبلغٍ غير المشحون.
   */
  async completeSaleWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      allowedBranchIds: string[] | 'all';
      prepared: Pick<PreparedSale, 'shiftId' | 'shiftBranchId' | 'invoiceDto' | 'paymentMethod' | 'parts'>;
      clientSaleId?: string;
      offlineRef?: string;
      /** بمَ ثبت جزءُ البطاقة — إلزاميٌّ متى كان في الأجزاء بطاقة. */
      card?: CardProof;
      /** السطورُ من لقطةٍ محفوظة — فئتُها كما كُتبت لحظةَ البيع. */
      trustLineTax?: boolean;
      /** إجماليُّ ما شُحن عليه البيع — يُطابَق بإجماليّ الفاتورة قبل أيّ صفّ دفع. */
      expectedTotal?: number;
    },
  ): Promise<SoldSale> {
    const { companyId, prepared, card } = input;
    /**
     * ⚖️ **`IMMEDIATE` — والبيعُ المسدَّدُ فوراً لا يُفحص على الحدّ** (`ق-٣٣٨`).
     *
     * «**وحدٌّ يمنع بيعاً نقدياً عطلٌ يصنعه لا يمنعه**»: السندُ يُنشأ بعد هذا
     * السطر، **فعند لحظة الفحص تكون الذمّةُ ارتفعت والدفعةُ لم تصل** — فيُرفض
     * بيعُ عميلٍ عند حدّه **نقداً**، وهو عطلٌ نصنعه.
     *
     * ⚠️ **وحدُّ هذا التصريح مُعلَنٌ في `credit-context.ts` ولا يُلتفّ عليه**:
     * إن سقطت معاملةُ السند بقيت فاتورةٌ مفتوحةٌ أُعفيت من الحدّ — **بيعةٌ
     * واحدة، ويظهر تعرّضُها في الفحص التالي**.
     *
     * ⚠️ **ولا تجاوزَ يُطلب هنا**: بيعُ الكاشير لا يُفحص أصلاً، **فتصريحُ
     * تجاوزٍ فيه يوهم بقرارٍ لم يقع**.
     */
    const invoice = await this.invoicesService.createWithinTx(
      tx,
      companyId,
      input.allowedBranchIds,
      prepared.invoiceDto,
      {
        settlement: 'IMMEDIATE',
        actor: null,
        overrideRequested: false,
        canOverride: false,
      },
      input.trustLineTax ? { trustLineTax: true } : null,
    );
    // ما شُحن هو ما يُفوتَر — وإلا فلا إتمام: المعاملةُ تسقط والمحاولةُ تبقى مقبولةً معلَنةً فلا تُقفل مناوبتُها.
    if (input.expectedTotal !== undefined && !moneyEquals(Number(invoice.total), input.expectedTotal)) {
      throw new ConflictException(formatMessage(MSG.pos_attempt_total_mismatch, { total: money(invoice.total), charged: money(input.expectedTotal) }));
    }
    // ⑤A4: نوعُ المستند من صفة مشتريه كما أُنشئ — كاملةٌ تُجاز قبل أن تُشارَك، فيُعلَم ذلك للإيصال أدناه.
    const clearanceRequired = invoiceTypeFor(invoice.customer, invoice.lines) === 'standard';

    {
      // صفّ دفعة لكل طريقة: البيع البسيط صفٌّ واحد بكامل المبلغ، والمقسّم
      // كما فصّله الكاشير — درجُ المناوبة يجمع صفوف النقد فقط.
      const parts: SalePart[] = prepared.paymentMethod === 'SPLIT' ? prepared.parts : [{ method: prepared.paymentMethod, amount: Number(invoice.total) }];
      if (parts.some((p) => p.method === 'CARD') && !card) throw new Error('completeSaleWithinTx: جزءُ بطاقةٍ بلا إعلانٍ بمَ ثبت — خطأُ مستدعٍ');
      await tx.posPayment.createMany({
        data: parts.map((p) => {
          const isCard = p.method === 'CARD';
          return {
            companyId,
            invoiceId: invoice.id,
            method: p.method,
            amount: p.amount,
            // بمَ ثبت دفعُ البطاقة ومراجعُه — تلتصق بصفّ البطاقة وحدَه (`ق-١٣٩٧`).
            providerRef: isCard ? (card?.providerRef ?? null) : null,
            verification: isCard ? card!.verification : null,
            deviceReference: isCard ? (card?.deviceReference ?? null) : null,
            approvalCode: isCard ? (card?.approvalCode ?? null) : null,
            attemptId: isCard ? (card?.attemptId ?? null) : null,
          };
        }),
      });
      // حسابُ درج المناوبة — إليه يدخل نقدُ البيع (ق-٣٠٩). و`null` لمناوبةٍ سبقت موجةَ الأدراج: تسقط إلى `1000` بإعلانٍ في مُرحِّلها.
      const shift = await tx.posShift.findUniqueOrThrow({ where: { id: prepared.shiftId }, select: { drawerId: true } });
      const drawer = shift.drawerId ? await tx.cashDrawer.findUnique({ where: { id: shift.drawerId }, select: { accountId: true } }) : null;
      const drawerAccountId = drawer?.accountId ?? null;
      const shiftBranchId = prepared.shiftBranchId;

      /**
       * ⭐ **تحصيلُ البيع سندُ قبضٍ حقيقيّ** (`ق-٣١٦`) — وكان لا يُرحَّل إطلاقاً.
       *
       * الفاتورةُ رحّلت `مدين 1200 / دائن 4100 + 2200`، **وصفوفُ الدفع تُكتب
       * ولا تُرحَّل**. وأولُ إصلاحٍ رحّل القيدَ مباشرةً — **فكان مساراً ثانياً**:
       * يُصلح الأستاذَ ويترك **الأعمارَ تعدّه ديناً والردَّ يرفضه**. فصار
       * **سنداً بالمسار المبنيّ**، فتُغلق الثلاثةُ معاً.
       *
       * ⚠️ **وسندٌ لكل طريقة**: النقدُ إلى حساب الدرج، **والشبكةُ إلى `1251`**
       * — والبيعُ المختلط سندان، وهو ما يقوله الواقع.
       *
       * ⚠️ **وفي معاملة البيع نفسها**: سقوطُه يُسقط البيعَ كلَّه.
       */
      const network = await getOrCreateAccountByCode(tx, companyId, NETWORK_RECEIVABLE_CODE, NETWORK_RECEIVABLE_NAME, 'asset');
      const byMethod = new Map<'CASH' | 'CARD', number>();
      for (const p of parts) {
        const key = p.method === 'CASH' ? 'CASH' : 'CARD';
        byMethod.set(key, round2((byMethod.get(key) ?? 0) + p.amount));
      }
      for (const [method, amount] of byMethod) {
        await this.payments.recordPosReceipt(tx, companyId, {
          invoiceId: invoice.id,
          invoiceNo: invoice.no,
          customerId: invoice.customerId,
          customerName: invoice.customer.name,
          date: invoice.issueDate,
          branchId: shiftBranchId,
          currency: invoice.currency,
          exchangeRate: Number(invoice.exchangeRate),
          method,
          amount,
          drawerAccountId,
          networkAccountId: network.id,
        });
      }
      /**
       * ⭐ **الخصم لم يعد هنا** — صار مالكه سطرَ الفاتورة (`م٦`).
       *
       * كان الكاشير يخصم بنفسه والفاتورة تُرحّل وحدها: **كتابتان لمالكين
       * مختلفين**، ومنه جاء عطل `م١` — مسارٌ يعرف الصنف ثم يرميه. وبقاء
       * الخصم هنا بعد `م٦` كان سيخصم **مرّتين**.
       *
       * والخصم ما زال داخل معاملة إتمام البيع نفسها (موجز POS §6): سقوطها
       * يُسقط حركاتها معها، **فلا خصم مزدوج بنيوياً**.
       */
      const stockDeduction = toDeductionReport(invoice.stockFulfilment);

      // ومعرّفُ البيع يُكتب في معاملة الفاتورة نفسِها — فالحارسُ على التكرار يقع معها أو لا يقع شيء (`ق-١٣٩٤`).
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          posShiftId: prepared.shiftId,
          paymentMethod: prepared.paymentMethod,
          clientSaleId: input.clientSaleId,
          offlineRef: input.offlineRef,
        } as Prisma.InvoiceUncheckedUpdateInput,
        // الإيصالُ بترتيب السلّة المعلَن (`ق-١٤١٢`) — عبر الثابت الواحد.
        include: SALE_INCLUDE,
      });
      // إيصال العميل يحمل الوسوم الخمسة من هذه اللحظة — لا من قائمة الفواتير وحدها (ق-١٨٦).
      return { ...(await this.withReceiptQr(companyId, updated, tx)), stockDeduction, clearanceRequired };
    }
  }

  /**
   * ما بعد الالتزام: ختمُ المستند للإيصال (`ق-١٨٧`) أو إعلانُ الإجازة (`ق-١٢٦١` أ) — ويستدعيه كلُّ مسارٍ أتمّ بيعاً،
   * المباشرُ ومحاولةُ الدفع سواء.
   */
  async finishReceipt(companyId: string, sold: SoldSale) {
    /**
     * ⭐ **الختمُ المتزامن — بعد معاملة البيع لا داخلها** (`ق-١٨٧` · `ق-١٩٦`).
     *
     * البيعُ التزم وخُتم مدفوعاً؛ الآن يُختم مستندُه (١٠–٣٦ مللي ثانية) فيخرج
     * الإيصالُ بالوسوم التسعة — والإبلاغُ يبقى في الطابور. **وسقوطُ الختم لا يُسقط
     * البيع** (`ق-١٩٦`/١): `stampForReceipt` لا يرمي، فيخرج الإيصال بالوسوم الخمسة
     * ويُنبَّه الكاشير، والطابور يعيد الختم والإبلاغ. والمزامَن يمرّ هنا أيضاً —
     * وهذا هو (`ق-١٩٢`/ب): الممتثلة بتاريخ المعاملة عند عودة الاتصال.
     */
    /**
     * ⚖️ **الكاملةُ لا تُشارَك قبل الاعتماد** (`ق-١٢٦١` أ — ⑤A4): مستندُ مشترٍ مؤسّسةٍ أو اعتباريٍّ أو مسجَّلٍ فاتورةٌ
     * ضريبيةٌ كاملة **تُجاز** لدى الهيئة قبل أن تُسلَّم للمشتري — لا تُبلَّغ بعد التسليم كالمبسّطة. فالبيعُ يمضي (المالُ
     * قُبض والقيدُ رُحِّل) **والإيصالُ يخرج بلا رمزٍ ولا يُطبع** حتى تعود الإجازةُ من الطابور؛ والشاشةُ تقرأ
     * `clearance.required` فتحجب الطباعةَ وتحيل إلى شاشة الفواتير. **ما يُعلَن**: رمزُ الإجازة (من المستند المُجاز الذي
     * تعيده الهيئة) لا يُخزَّن بعدُ — بندٌ في ⑤.
     */
    if (sold.clearanceRequired) {
      const { clearanceRequired: _, ...rest } = sold;
      return {
        ...rest,
        zatcaQr: null,
        zatcaStamped: false,
        stampError: null,
        clearance: { required: true, status: sold.zatcaStatus, message: translate(MSG.pos_clearance_required, 'ar') },
      };
    }
    const stamp = await this.zatca.stampForReceipt(companyId, sold.id);
    const { clearanceRequired: _, ...rest } = sold;
    return { ...rest, zatcaQr: stamp.qrPayload ?? sold.zatcaQr, zatcaStamped: stamp.qrPayload !== null, stampError: stamp.error, clearance: { required: false } };
  }

  /**
   * ⭐ **إيصالُ الكاشير يحمل رمز الهيئة في كل مساراته** — الحيّ والمزامَن والمكرَّر (`ق-١٨٦`).
   *
   * الملحق (١) من قرار التنفيذ: `QR` **إلزاميٌّ توليداً وطباعةً** على الفاتورة
   * المبسّطة. وكان الرمز يُبنى لقائمة الفواتير وحدها، **والإيصالُ الذي يُسلَّم
   * للعميل بلا رمزٍ إطلاقاً** — مخالفةٌ في كل بيعٍ في نقطة البيع. البنّاءُ نفسه
   * وساعةُ الحائط نفسها (`ق-١٨٥`)، فلا يفترق رمزُ الإيصال عن رمز القائمة.
   * `null` حين يغيب الاسم القانوني أو الرقم الضريبي — والواجهة تُنبّه الكاشير
   * بدل رمزٍ يُقرأ ولا يصحّ.
   */
  private async withReceiptQr<
    T extends { issueDate: Date; issuedAt: Date | null; issuedOffsetMin: number | null; total: Prisma.Decimal; taxTotal: Prisma.Decimal; zatcaQrPayload?: string | null },
  >(companyId: string, invoice: T, tx?: Prisma.TransactionClient): Promise<T & { zatcaQr: string | null; zatcaStamped: boolean }> {
    // مستندٌ مختوم يعيد رمزَه التساعي المحفوظ — فإعادةُ المزامنة تطبع ما طُبع أولَ مرة حرفاً.
    //
    // ⚠️ **و`tx` تُمرَّر حين نكون داخل معاملة** (`ق-٣٦٠`): بدونها كانت تُفتح
    // معاملةٌ ثانية فوق الأولى، **فتمسك البيعةُ اتصالاً وتطلب ثانياً** — وثلاثُ
    // بيعاتٍ متزامنة تُجوّع المجموعَ فيعود `500`.
    return { ...invoice, zatcaQr: await this.invoicesService.zatcaQrFor(companyId, invoice, tx), zatcaStamped: Boolean(invoice.zatcaQrPayload) };
  }


  /** مناوبةٌ واحدة — حالةٌ خاصّة من الجمع، لا حسابٌ ثانٍ (`totalsForMany`). */
  private async totalsFor(tx: Prisma.TransactionClient, shiftId: string, openingFloat: number): Promise<ShiftTotalsNumeric> {
    return (await this.totalsForMany(tx, [{ id: shiftId, openingFloat }])).get(shiftId)!;
  }

  /**
   * مجاميعُ مناوباتٍ كثيرة **باستعلامَين لا باستعلامَين لكلّ مناوبة**.
   *
   * 🔴 كانت القائمةُ تسأل مرّتين عن كلّ مناوبة، **فبثلاثمئةٍ وستٍّ متراكمةٍ في
   * منشأة العرض تجاوزت معاملةُ الخمس ثوانٍ فسقطت `500`** (مقيسٌ 2026-09-11 —
   * `Transaction already closed … 5025 ms`). **ولا يظهر في السير** لأن قاعدتَه
   * تُنشأ جديدةً كلَّ مرّة (`ق-٤٩٥`)، **ويظهر عند أوّل تاجرٍ يعمل سنة**.
   *
   * ومن صفوف الدفعات لا من الفواتير: الفاتورةُ المقسّمة تضع في الدرج جزءها
   * النقديَّ فقط.
   *
   * **على مستوى المنشأة بحقّها**: المجاميعُ تُقرأ بمعرّفات مناوباتٍ مُمرَّرةٍ من
   * مستدعٍ قرأها مرشَّحةً أو تحقّق منها — فالمرشِّحُ هنا مجموعةُ معرّفاتٍ لا
   * قائمةُ رؤية.
   */
  private async totalsForMany(tx: Prisma.TransactionClient, shifts: { id: string; openingFloat: number | Prisma.Decimal }[]): Promise<Map<string, ShiftTotalsNumeric>> {
    const ids = shifts.map((s) => s.id);
    const [payments, counts] = ids.length
      ? await Promise.all([
          tx.posPayment.findMany({
            where: { invoice: { posShiftId: { in: ids } } },
            select: { method: true, amount: true, invoice: { select: { posShiftId: true } } },
          }),
          tx.invoice.groupBy({ by: ['posShiftId'], where: { posShiftId: { in: ids } }, _count: { _all: true } }),
        ])
      : [[], []];

    const cash = new Map<string, number>();
    const card = new Map<string, number>();
    for (const p of payments) {
      const shiftId = p.invoice.posShiftId!;
      const bucket = p.method === 'CASH' ? cash : card;
      bucket.set(shiftId, (bucket.get(shiftId) ?? 0) + Number(p.amount));
    }
    const salesCount = new Map(counts.map((c) => [c.posShiftId!, c._count._all]));

    const totals = new Map<string, ShiftTotalsNumeric>();
    for (const s of shifts) {
      const cashTotal = cash.get(s.id) ?? 0;
      totals.set(s.id, {
        salesCount: salesCount.get(s.id) ?? 0,
        cashTotal: round2(cashTotal),
        cardTotal: round2(card.get(s.id) ?? 0),
        expectedCash: round2(Number(s.openingFloat) + cashTotal),
      });
    }
    return totals;
  }

  /**
   * عميلُ المرور **طبيعيٌّ بالبناء** (②A1): بيعُ الكاشير بلا مشترٍ مسمّىً بيعٌ لمستهلك — مبسّطةٌ بحكم م٥٣(٧). فالصفُّ
   * الذي تُنشئه هذه الدالّة يُعلَن `NATURAL` عند إنشائه؛ والقائمُ منه قبل البناء (`LEGACY_UNDECLARED`) تُعلنه هي
   * نفسُها هنا — لأنها هي التي تعرفه بهويّته (هذا الاسمُ في الشيفرة) لا الهجرةُ من نصٍّ حرّ (ق-٨٩٨).
   */
  private async walkInCustomerId(tx: Prisma.TransactionClient): Promise<string> {
    const existing = await tx.customer.findFirst({ where: { name: WALK_IN_CUSTOMER }, select: { id: true, kind: true } });
    if (existing) {
      if (existing.kind === 'LEGACY_UNDECLARED') await tx.customer.update({ where: { id: existing.id }, data: { kind: 'NATURAL' } });
      return existing.id;
    }
    const created = await tx.customer.create({ data: { name: WALK_IN_CUSTOMER, kind: 'NATURAL' } as unknown as Prisma.CustomerUncheckedCreateInput });
    return created.id;
  }

  /** اسمُ الفاعل لحظةَ الفعل — يُخزَّن مع المناوبة ومع الحسم اليدويّ لمحاولة الدفع (`ق-١٣٩٩`: «ويُسجَّل»). */
  async actorName(tx: Prisma.TransactionClient, tenant: TenantContext): Promise<string> {
    if (tenant.actorType === 'COMPANY_USER') {
      const user = await tx.companyUser.findUnique({ where: { id: tenant.profileId }, select: { name: true } });
      if (user) return user.name;
    }
    const company = await tx.company.findUnique({ where: { id: tenant.companyId }, select: { orgName: true } });
    return company ? `مالك ${company.orgName}` : 'المالك';
  }
}
