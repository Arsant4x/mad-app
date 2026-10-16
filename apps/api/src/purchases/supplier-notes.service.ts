import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { assertBranchAllowed } from '../branches/branch-scope.util';
import { STANDARD_VAT_RATE } from '../common/vat/standard-rate';
import {
  assertAdjustableTarget,
  assertReturnLinesBelong,
  assertWithinRemaining,
  linesFromOriginal,
  type NoteKinds,
  type NoteSide,
} from '../common/adjustment/adjustment-note.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { MSG } from '../common/i18n/messages';
import { unitCodeOf, unitCodesFor } from '../common/units/product-unit-codes.util';
import { roundTo } from '../common/money/rounding';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { lockDocumentRow } from '../common/settlement/settlement.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postSupplierNoteEntry } from '../journal/auto-posting.util';
import { CreateSupplierNoteDto, SupplierNoteLineDto } from './dto/create-supplier-note.dto';
import { applySupplierNoteToStock } from './purchase-return.util';
import { recordCostShares } from './layer-cost-allocation.util';
import { reconcileNonDeductibleVat } from './non-deductible-vat.util';
import { recomputePurchaseStatus } from './purchase-settlement.util';
import { assertPurchaseReferences } from './purchase-references.util';
import { computePurchaseTax, purchaseBaseTotals } from './purchases.service';

/** أنواعُ مستند الشراء — الأساسُ وإشعاراه، كما للفاتورة `INVOICE`/`CREDIT_NOTE`/`DEBIT_NOTE`. */
export const PURCHASE_NOTE_KINDS: NoteKinds<'PURCHASE' | 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE'> = {
  base: 'PURCHASE',
  credit: 'SUPPLIER_CREDIT_NOTE',
  debit: 'SUPPLIER_DEBIT_NOTE',
};

/** البنودُ الحيّة وحدَها — المتجاوَزُ بتعديلٍ قبل الاستهلاك (`supersededAt`) لا يُشار إليه بإشعار. */
const NOTE_INCLUDE = { supplier: true, lines: { where: { supersededAt: null } } } as const;

/**
 * ⚖️ **إشعارُ المورّد — مستندُه يُسجَّل، وقيدُه قيدُنا** (`ق-١٠٠٠` · `ق-١٠٠٦`).
 *
 * بنمط إشعار البيع فيما يشتركان فيه (المصدرُ الواحد `common/adjustment/adjustment-note.util`):
 * أصلٌ يُفحص، وبنودٌ من الأصل، ومرتجعٌ يُتحقَّق منه، وسقفٌ من الأصل، وإشارةٌ في الإقرار، ومتبقٍّ
 * يُخفَّض. **وما يسقط يسقط لسببٍ واحد — أنه مستندُ المورّد لا مستندُنا**: لا رقمَ منّا يُصدَر (رقمُنا
 * مرجعٌ داخليّ `SCN-`/`SDN-` ورقمُه مرجعٌ خارجيّ `supplierRef`)، ولا ختمَ ولا سلسلةَ ولا أنبوبَ هيئة
 * ولا مهلةَ إصدار ولا حدثَ طابور. **وما ينقلب**: الاتجاهُ الدفتريّ (`2100` ⇄ `1300`/الفئة/`1250`)،
 * والرفُّ يخرج من طبقة الاستلام الأصلية لا يعود إليها، والضريبةُ مدخلاتٌ بإشارتها، والذمّةُ ذمّةُ المورّد.
 *
 * والإشعارُ حدثٌ محاسبيٌّ مرحَّل (`ق-١٠٠٦`/②): **يُعكس ولا يُحذف ولا يُعدَّل** — والعكسُ بإشعارٍ مقابل
 * (دائنٌ على مدينٍ زائد وعكسُه)، كما في البيع. والحرّاسُ في `PurchasesService.update/remove`.
 */
@Injectable()
export class SupplierNotesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  issueCreditNote(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string, dto: CreateSupplierNoteDto) {
    return this.issue(companyId, allowedBranchIds, purchaseId, dto, 'credit');
  }

  issueDebitNote(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string, dto: CreateSupplierNoteDto) {
    return this.issue(companyId, allowedBranchIds, purchaseId, dto, 'debit');
  }

  /**
   * الجذعُ المشترك للدائن والمدين — كلُّ ما يختلف بينهما يصل مقرَّراً في `side`.
   *
   * **على مستوى المنشأة بحقّها**: سقفُ الإشعارات (`ق-١٠٠٦`/⑤) يُحسب من كلّ إشعارات الأصل — وإشعارٌ في فرعٍ
   * محجوبٍ عن القارئ يبقى مخصوماً من السقف، وإلا جاز أن يُقبل من المورّد أكثرُ مما فُوتر؛ والأصلُ نفسُه يُقاس
   * على فروع القارئ بـ`assertBranchAllowed` قبل أيّ كتابة.
   */
  private issue(companyId: string, allowedBranchIds: string[] | 'all', purchaseId: string, dto: CreateSupplierNoteDto, side: NoteSide) {
    const docType = side === 'credit' ? PURCHASE_NOTE_KINDS.credit : PURCHASE_NOTE_KINDS.debit;
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const original = await tx.purchase.findUnique({ where: { id: purchaseId }, include: NOTE_INCLUDE });
        if (!original) throw new NotFoundException(MSG.purchase_not_found);
        const { correctsOpposite } = assertAdjustableTarget(
          // ① الأصلُ شراءٌ أو إشعارٌ مقابل — والمُلغى بقيد عكسٍ مُغلَقٌ (`ق-٩٩٧`/②) كالمردودة في البيع.
          { docType: original.docType, closed: original.voidedAt !== null },
          side,
          PURCHASE_NOTE_KINDS,
          { invalid: MSG.supplier_note_target_invalid, closed: MSG.supplier_note_target_voided },
        );
        assertBranchAllowed(allowedBranchIds, original.branchId);

        // ② الإشعارُ الكامل من الأصل: في الدائن تُعاد البضاعةُ المخزنيةُ كلُّها؛ وعلى إشعارٍ مقابل لا رفَّ ولا إشارة.
        const byOriginalLine = new Map(original.lines.map((l) => [l.id, l]));
        const lines: SupplierNoteLineDto[] = (
          dto.lines ??
          linesFromOriginal(original.lines, (l) =>
            correctsOpposite ? {} : { returnsPurchaseLineId: l.id, goodsReturned: side === 'credit' && l.productId !== null },
          )
        ).map((l) => ({
          ...l,
          // الصنفُ يُنقل مع السطر من أصله إن أُغفل — فسطرٌ يشير إلى استلامٍ ولا يعرف صنفَه يرفضه مُشغِّل الحركة.
          productId: l.productId ?? (l.returnsPurchaseLineId ? (byOriginalLine.get(l.returnsPurchaseLineId)?.productId ?? undefined) : undefined),
        }));
        if (correctsOpposite && lines.some((l) => l.returnsPurchaseLineId)) throw new BadRequestException(MSG.supplier_return_line_not_original);
        // الإشعارُ المدين من المورّد فوترةٌ إضافية — لا بضاعةَ تُعاد فيه.
        if (side === 'debit' && lines.some((l) => l.goodsReturned)) throw new BadRequestException(MSG.supplier_note_debit_no_goods);
        // ③ سطرُ الإعادة من الأصل نفسِه وبصنفه وبحدّ ما استُلم.
        assertReturnLinesBelong(
          lines.map((l) => ({ returnsId: l.returnsPurchaseLineId, productId: l.productId, quantity: l.quantity })),
          original.lines,
          { notOriginal: MSG.supplier_return_line_not_original, exceeds: MSG.supplier_return_exceeds_received },
        );

        // Purchase totals: the lines summed, then the tax by the exemption inherited from the original.
        const { subtotal, tax: taxAmount, total: noteTotal } = computePurchaseTax(
          roundTo(
            lines.reduce((t, l) => t + l.quantity * l.unitPrice, 0),
            'LINE_AMOUNT',
          ),
          original.exempt,
        );

        // ④ السقفُ من الأصل (`ق-١٠٠٦`/⑤): الدائنُ على الشراء، والمدينُ على دائنٍ زائد — لا يتجاوزان ما تبقّى.
        if (side === 'credit' || correctsOpposite) {
          // بعد قفل الأصل: إشعاران متزامنان كانا يقرآن السابقَ نفسَه فيتجاوزان السقفَ معاً، نظيرُ الردّ المزدوج
          // في المبيعات (البند 18 من مراجعة 3.3 · `ق-١٥٧٥`).
          await lockDocumentRow(tx, 'purchases', original.id);
          const prior = await tx.purchase.aggregate({ where: { relatedPurchaseId: original.id, docType }, _sum: { total: true } });
          assertWithinRemaining(noteTotal, Number(original.total), Number(prior._sum.total ?? 0), MSG.supplier_note_exceeds_remaining);
        }

        // `ق-١٤٦٥` صنفُ سطرٍ من منشأةٍ أخرى يُردّ مسمّىً قبل الترقيم (والمورّدُ من الأصل فلا يُرسَل).
        await assertPurchaseReferences(tx, { productIds: lines.map((l) => l.productId) });

        const rate = Number(original.exchangeRate);
        const date = dto.date ? new Date(dto.date) : new Date();
        // رقمُنا مرجعٌ داخليّ من العدّاد الذرّيّ (ق-٣٢٨)، عمريٌّ كرقم الشراء — ورقمُ المورّد في `supplierRef`.
        const no = await nextDocumentNumber(tx, companyId, date, { kind: side === 'credit' ? 'SCN' : 'SDN', pad: 3, perYear: false }, (prefix) =>
          highestSequenceOf(tx.purchase, prefix),
        );

        // ① وحدةُ كلِّ سطرٍ تُنسخ من صنفه لحظةَ الكتابة — لا تُخمَّن لصنفٍ لم يُعلنها.
        const unitCodes = await unitCodesFor(tx, lines);
        const created = await tx.purchase.create({
          data: {
            companyId,
            no,
            docType,
            relatedPurchaseId: original.id,
            adjustmentReason: dto.reason,
            supplierRef: dto.supplierRef?.trim() || null,
            branchId: original.branchId,
            supplierId: original.supplierId,
            date,
            dueDate: date,
            category: original.category,
            categoryCode: original.categoryCode,
            subtotal,
            taxAmount,
            exempt: original.exempt,
            excludeFromVat: original.excludeFromVat,
            /**
             * ⑥A1 (`ق-١٣٢٥`) — **الإشعارُ يرث إسنادَ الشراء الذي يصحّحه**: هو عكسٌ لجزءٍ منه،
             * فمدخلُه يخصّ التوريدَ نفسَه. **و`LEGACY_UNASSIGNED` تُحوَّل إلى `MIXED`** —
             * معاملتُها واحدة، **والقيمةُ القديمة محبوسةٌ على ما سبق** بقيد `CHECK` فلا تُكتب
             * لصفٍّ جديد (وهو الذي أمسك هذا المسار قبل الدفع، فكان يسقط `500`).
             */
            inputVatUse: original.inputVatUse === 'LEGACY_UNASSIGNED' ? 'MIXED' : original.inputVatUse,
            // ⚖️ `ق-١٣٤٢` ويرث تتبّعَ أصله: إشعارٌ جديد على أصلٍ لم يُرحَّل غيرُ قابله للخصم لا يُرحّل عكسَ ما لم يُرحَّل.
            nonDeductibleTracked: original.nonDeductibleTracked,
            total: noteTotal,
            currency: original.currency,
            exchangeRate: rate,
            ...purchaseBaseTotals(taxAmount, noteTotal, rate),
            // الدائنُ لا يُسدَّد فلا يدخل المتبقّي؛ والمدينُ مستحقٌّ يُسدَّد بسند صرفٍ كالشراء.
            status: side === 'credit' ? 'PAID' : 'DUE',
            lines: {
              create: lines.map((l) => ({
                companyId,
                description: l.description,
                productId: l.productId ?? null,
                unitCode: unitCodeOf(unitCodes, l.productId),
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                taxRate: l.taxRate ?? STANDARD_VAT_RATE,
                returnsPurchaseLineId: l.returnsPurchaseLineId ?? null,
                goodsReturned: side === 'credit' ? (l.goodsReturned ?? false) : false,
              })),
            },
          } as unknown as Prisma.PurchaseUncheckedCreateInput,
          include: NOTE_INCLUDE,
        });

        // الرفُّ أولاً ثم القيد — كالإنشاء: رفضٌ في الرفّ يُسقط المعاملةَ قبل أن يُكتب قيد.
        const stock = await applySupplierNoteToStock(tx, {
          companyId,
          branchId: created.branchId,
          date: created.date,
          documentNo: created.no,
          side,
          exchangeRate: rate,
          lines: created.lines,
        });
        // ⚖️ ق-١٣٦٤ أين ذهب فرقُ السعر: الرفوفُ ومخارجُها — مسجَّلاً بحدث الإشعار (مادّةُ الحارس الثاني).
        await recordCostShares(tx, companyId, { event: 'PRICE_NOTE', purchaseId: created.id }, stock.shares);

        const entry = await postSupplierNoteEntry(tx, companyId, {
          side,
          supplierId: created.supplierId,
          branchId: created.branchId,
          no: created.no,
          date: created.date,
          supplierName: created.supplier.name,
          categoryCode: created.categoryCode,
          baseSubtotal: Number(created.baseSubtotal),
          baseTaxAmount: Number(created.baseTaxAmount),
          baseTotal: Number(created.baseTotal),
          baseInventory: stock.baseInventory,
          baseCogs: stock.baseCogs,
          baseWriteOff: stock.baseWriteOff,
          baseVariance: stock.baseVariance,
        });
        // ⑥ الدائنُ يخفّض متبقّي أصله فتُشتقّ حالتُه من جديد في المعاملة نفسِها (`ق-٨٧٢`).
        if (side === 'credit') await recomputePurchaseStatus(tx, original.id);

        if (!entry) return created;
        const posted = await tx.purchase.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: NOTE_INCLUDE });
        // ⚖️ `ق-١٣٤٢` ضريبةُ الإشعار على مستندٍ منسوبٍ إلى المعفى لا تُستردّ كذلك: حصّتُها تتبع أثرَ صافيه — فرقُ السعر
        // على طبقة الأصل بقاعدة الانتشار، والمُعادةُ إلى `5100`، والخدميُّ إلى حساب الفئة.
        await reconcileNonDeductibleVat(tx, companyId, created.id, { date: created.date, trigger: 'SUPPLIER_NOTE' });
        return posted;
      }),
    );
  }
}
