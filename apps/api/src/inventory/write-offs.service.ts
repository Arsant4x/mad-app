import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertBranchAllowed, branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { documentYear } from '../common/document-year.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { SELF_REVIEW_ACTION, SELF_REVIEW_ENTITY } from '../common/self-review';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { taxPathOf, writeOffReason } from '../common/writeoff-reasons';
import { postWriteOffEntry } from '../journal/auto-posting.util';
import { events } from '../shared/events/event-bus';
import { INVENTORY_WRITTEN_OFF, type InventoryWrittenOffPayload } from '../shared/events/domain-events';
import { consumeFifo } from './costing.util';
import { CreateWriteOffDto } from './dto/create-write-off.dto';
import { RejectWriteOffDto } from './dto/reject-write-off.dto';

/**
 * 📌 **فعلُ الاعتماد الذاتي انتقل إلى `common/self-review.ts`** (`ق-١٤٣` · `ق-٦٢١`).
 *
 * كان يُعرَّف هنا **لأن الشطب كان مساره الوحيد**. ولمّا لزم مسارَ الإجازات صار
 * أمامنا بابان: أن تستورد `leaves` من `inventory` — **وهو خرقُ اتجاه** (النواةُ
 * لا تستورد من المحرّك) — أو **أن تُكتب السلسلةُ مرّتين فتفترقا**.
 *
 * ⛔ **ولا يُترك تصديرٌ ناسخٌ هنا**: مسارانِ لاسمٍ واحدٍ هما **بنيةٌ ثانية** لا
 * يُعرف أيُّها الأصل — وهي عينُ العلّة التي بُني لها حارسُ المسارات المنقولة.
 */


/** ما يحتاجه سجل التدقيق عن المُعتمِد — **اسمه وقت الفعل لا معرّفه وحده**. */
export interface Approver {
  id: string;
  actorType: string;
  name: string;
}

/** الحالات الثلاث — **نصّاً واحداً يُقرأ منه المرشّح والرسالة**. */
const WRITE_OFF_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const satisfies readonly string[] as readonly string[];

const WRITE_OFF_INCLUDE = {
  product: { select: { id: true, name: true, sku: true } },
  warehouse: { select: { id: true, name: true } },
} as const;

/**
 * ⭐ **واقعة الشطب — تُسجَّل بيدٍ وتُعتمد بأخرى** (`SPEC 30.5` · `30.7`).
 *
 * ## القسمة التي تحكم هذا الملف
 *
 * **التسجيل ليس حدثاً محاسبياً.** من يستقبل البضاعة يسجّل ما رآه (`record`)،
 * **ولا يخرج شيءٌ من المخزون ولا يُرحَّل قيد**. والاعتماد (`review`) هو الذي
 * يُخرج ويُرحّل — فبدون هذه القسمة يصير التلف **باباً لتسريب المخزون بلا أثر**.
 *
 * ## ⚠️ وحدُّها معلَن: الاعتماد الذاتي غير ممنوع
 *
 * من يملك `review` **يستطيع اعتماد ما سجّله بنفسه**. ومنعُه كان سيجعل الميزة
 * **معطَّلةً على متجرٍ صاحبُه وحده** — وهو أكثر عملائنا. فالقسمة **بالصلاحية**
 * لا بالشخص، والحقلان `recordedById` و`reviewedById` يُخزَّنان دائماً **فيظهر
 * التطابق في التقرير لمن أراد أن يقرأه**. وتشديدُه إلى شخصين قرارُ سياسة
 * يُتَّخذ بعلمٍ لا بسهو.
 */
@Injectable()
export class WriteOffsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', status?: string) {
    // ⚠️ **مرشّحٌ مجهول يُرَدّ ولا يُتجاهَل**: تجاهلُه يُظهر القائمة كاملةً
    // لمن ظنّ أنه يرى المنتظِرة وحدها — **وهو أسوأ من خطأ**. وتمريرُه خاماً إلى
    // Prisma يُنتج `500` بدل رسالةٍ تُقرأ.
    if (status !== undefined && !WRITE_OFF_STATUSES.includes(status)) {
      throw new BadRequestException(formatMessage(MSG.writeoff_status_unknown, { status, allowed: WRITE_OFF_STATUSES.join(' · ') }));
    }

    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.inventoryWriteOff.findMany({
        where: { ...branchFilter(allowedBranchIds), ...(status ? { status: status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' } : {}) },
        include: WRITE_OFF_INCLUDE,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  }

  /**
   * تسجيل الواقعة — **والسبب يُتحقَّق منه من مصدره الواحد**.
   *
   * ورمزٌ مساره `DEEMED_SUPPLY` **يُرَدّ عند الباب** لا عند الاعتماد: من يسجّل
   * واقعةً ثم يُمنع من اعتمادها بعد يومين **يكتشف الحدّ في أسوأ لحظة**.
   */
  create(companyId: string, allowedBranchIds: string[] | 'all', actorId: string, dto: CreateWriteOffDto) {
    const reason = writeOffReason(dto.reasonCode);
    if (!reason) throw new BadRequestException(formatMessage(MSG.writeoff_reason_unknown, { code: dto.reasonCode }));
    if (taxPathOf(reason.code) !== 'NO_ADJUSTMENT') {
      throw new BadRequestException(formatMessage(MSG.writeoff_deemed_supply_not_built, { reason: reason.label }));
    }

    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
        assertBranchAllowed(allowedBranchIds, branchId);

        const product = await tx.product.findUnique({ where: { id: dto.productId }, select: { id: true } });
        if (!product) throw new NotFoundException(MSG.product_not_found);
        const warehouse = await tx.warehouse.findUnique({ where: { id: dto.warehouseId }, select: { id: true } });
        if (!warehouse) throw new NotFoundException(MSG.warehouse_not_found);

        const occurredAt = new Date(dto.occurredAt);
        return tx.inventoryWriteOff.create({
          data: {
            companyId,
            branchId,
            productId: dto.productId,
            warehouseId: dto.warehouseId,
            no: await this.nextWriteOffNumber(tx, companyId, occurredAt),
            qty: new Prisma.Decimal(dto.qty),
            reasonCode: reason.code,
            note: dto.note ?? null,
            occurredAt,
            recordedById: actorId,
          } as unknown as Prisma.InventoryWriteOffUncheckedCreateInput,
          include: WRITE_OFF_INCLUDE,
        });
      }),
    );
  }

  /**
   * ⭐ **الاعتماد — الحدث المحاسبي بأثرَيه في معاملةٍ واحدة.**
   *
   * الحركة ثم استهلاك الطبقات ثم القيد: **ثلاثتها أو لا شيء**. ولو وقعت الحركة
   * بلا قيد لبقيت بضاعةٌ خرجت من الرفّ **ولا يعرف الدفتر أين ذهبت** — وهو
   * بالضبط العطل الذي عالجه `م١` في مسار البيع.
   *
   * ⚠️ **والتكلفة من الطبقات لا من بطاقة الصنف**: `consumeFifo` تعيد ما خرج
   * فعلاً. وصفرٌ منها **ليس خطأً يُخفى** — يعني ألّا طبقةَ لها تكلفة، فتُعتمد
   * الواقعة بحركتها **بلا قيد**، ويظلّ `baseCost = 0` معلناً ذلك في التقرير.
   */
  async approve(companyId: string, allowedBranchIds: string[] | 'all', actor: Approver, id: string) {
    const actorId = actor.id;
    const result = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const row = await this.pendingOrThrow(tx, allowedBranchIds, id);
      const reason = writeOffReason(row.reasonCode);
      // رمزٌ صار مجهولاً بعد التسجيل (حُذف من القائمة مثلاً) لا يُرحَّل بالظنّ.
      if (!reason) throw new BadRequestException(formatMessage(MSG.writeoff_reason_unknown, { code: row.reasonCode }));

      /**
       * ⚖️ **الاعتماد الذاتي: مسموحٌ افتراضياً، ممنوعٌ بإعداد** (`ق-١٤٣`).
       *
       * `Company` جدولُ هوية المستأجر — يُقرأ بالمعرّف من السياق المُتحقَّق منه،
       * كما يفعل مسار الفاتورة حين يقرأ اسم المنشأة لرمز ZATCA.
       */
      const selfApproved = row.recordedById === actorId;
      if (selfApproved) {
        const company = await tx.company.findUnique({ where: { id: companyId }, select: { writeOffRequiresTwoPersons: true } });
        if (company?.writeOffRequiresTwoPersons) {
          throw new ForbiddenException(formatMessage(MSG.writeoff_two_persons_required, { no: row.no }));
        }
      }

      const qty = Number(row.qty);
      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          branchId: row.branchId,
          productId: row.productId,
          warehouseId: row.warehouseId,
          type: 'OUT',
          origin: 'WRITEOFF',
          qty: row.qty,
          date: row.occurredAt,
          reason: `شطب ${row.no} — ${reason.label}`,
        } as unknown as Prisma.StockMovementUncheckedCreateInput,
        select: { id: true },
      });

      const consumed = await consumeFifo(tx, companyId, {
        productId: row.productId,
        warehouseId: row.warehouseId,
        qty,
        movementId: movement.id,
      });

      const entry = await postWriteOffEntry(tx, companyId, {
        branchId: row.branchId,
        ref: row.no,
        date: row.occurredAt,
        baseCost: consumed.totalCost,
        reasonCode: row.reasonCode,
      });

      const saved = await tx.inventoryWriteOff.update({
        where: { id: row.id },
        data: {
          status: 'APPROVED',
          reviewedById: actorId,
          reviewedAt: new Date(),
          baseCost: new Prisma.Decimal(consumed.totalCost),
          movementId: movement.id,
          journalEntryId: entry?.id ?? null,
        },
        include: WRITE_OFF_INCLUDE,
      });

      /**
       * الحدث **تشغيليّ لا امتثاليّ** (`ق-٣٩`): لا جهةَ تنتظر بلاغَ شطب —
       * فالتلف **لا يوجب تعديلاً ضريبياً** (`ق-٩٥`). ومستمعٌ يفشل يجب ألّا
       * يُلغي اعتماداً وقع فعلاً. **ولو ظهر يوماً بلاغٌ نظاميّ للمُعدَم انتقل
       * إلى الامتثاليّ** — والفرق سطرٌ واحد هنا لا إعادة بناء.
       */
      events.emitOperational({
        type: INVENTORY_WRITTEN_OFF,
        companyId,
        payload: {
          writeOffId: saved.id,
          no: saved.no,
          reasonCode: saved.reasonCode,
          baseCost: consumed.totalCost,
        } satisfies InventoryWrittenOffPayload,
      });

      /**
       * ⚖️ **والاعتماد الذاتي يُكتب حدثاً مميَّزاً — بمعاملته** (`ق-١٤٣` · `ق-١٤٧`).
       *
       * المعترض يكتب `action: 'review'` كأي اعتماد — **فمن يدقّق كان عليه أن
       * يقارن حقلين يدوياً في كل واقعة**. وفعلٌ باسمه (`self-review`) يجعلها
       * **تُوجَد بحثاً**: `GET /audit-log?action=self-review`.
       *
       * ⚠️ **وداخل المعاملة بـ`tx` — وفشلُه يُسقط الاعتماد** (حكم المالك
       * 2026-09-04): كتبتُها أولاً خارجها بحجّة «شهادةٌ على فعلٍ لم يُحفَظ أسوأ
       * من غيابها»، **والعكس أخطر**: **فعلٌ حُفظ بلا شهادة هو الثغرة النظامية
       * بعينها**. فتُعامَل معاملةَ حدث الامتثال (`ق-٣٩`): تقع الثلاثة معاً —
       * الحركة والقيد والشهادة — أو لا يقع شيء.
       *
       * **ولا مانعَ تقنيّ كان يمنعها**: `AuditLog` منطاقٌ بالمستأجر،
       * و`app.company_id` مضبوطٌ على هذه المعاملة، فـ`RLS` تمرّ كما تمرّ خارجها.
       */
      if (selfApproved) {
        await this.audit.recordWithinTx(tx, {
          companyId,
          actorType: actor.actorType,
          actorId,
          actorName: actor.name,
          screen: 'inventory',
          action: SELF_REVIEW_ACTION,
          entity: SELF_REVIEW_ENTITY.writeOff,
          entityId: saved.id,
          method: 'POST',
          path: `/inventory/write-offs/${saved.id}/approve`,
          details: { no: saved.no, reasonCode: saved.reasonCode, baseCost: consumed.totalCost, recordedById: row.recordedById },
          ip: null,
        });
      }

      return { saved, selfApproved, provisionalQty: consumed.provisionalQty };
    });

    return { ...result.saved, selfApproved: result.selfApproved, provisionalQty: result.provisionalQty };
  }

  reject(companyId: string, allowedBranchIds: string[] | 'all', actorId: string, id: string, dto: RejectWriteOffDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const row = await this.pendingOrThrow(tx, allowedBranchIds, id);
      return tx.inventoryWriteOff.update({
        where: { id: row.id },
        data: { status: 'REJECTED', reviewedById: actorId, reviewedAt: new Date(), rejectionReason: dto.reason },
        include: WRITE_OFF_INCLUDE,
      });
    });
  }

  /** واقعةٌ قائمةٌ في هذا الفرع وما تزال منتظرة — وإلا فالسبب معلَن. */
  private async pendingOrThrow(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', id: string) {
    const row = await tx.inventoryWriteOff.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(MSG.writeoff_not_found);
    assertBranchAllowed(allowedBranchIds, row.branchId);
    // ⚠️ حالةٌ محسومة لا تُحسم مرّتين: اعتمادٌ ثانٍ كان سيُخرج البضاعة مرّتين.
    if (row.status !== 'PENDING_REVIEW') throw new ConflictException(MSG.writeoff_already_decided);
    return row;
  }

  /** سلسلةٌ مستقلة `WO-YYYY-NNNN` — بسنة **وقوع** التلف لا ساعة الخادم. */
  private async nextWriteOffNumber(tx: Prisma.TransactionClient, companyId: string, occurredAt: Date): Promise<string> {
    // عدّادٌ ذرّيّ لا مسحُ سنة (ق-٣٢٨) — بسنة **وقوع** التلف كما كان.
    return nextDocumentNumber(tx, companyId, occurredAt, { kind: 'WO', pad: 4 }, (prefix) =>
      highestSequenceOf(tx.inventoryWriteOff, prefix),
    );
  }
}
