import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { CustomerKind, InvoiceDocType, InvoiceStatus, PosCardVerification, PosPaymentAttemptStatus, PosPaymentResolution, PosShiftStatus, TaxCategory } from '@mad-app/db';
// ⚖️ الحدُّ الوحيد بين النواة والوحدة في ردود الكاشير (`§3.8` · `ق-١٣٥٠`) — دَينٌ معلَنٌ بحجّته في `docs/country-literals-debt.json`.
import { PosClearanceResponse } from './zatca-receipt-response.dto';

/**
 * ⚖️ **ردودُ الكاشير بأصنافٍ مسمّاة** (`ق-١٤٣٨` · خطّةُ الأنواع ④ · أوّلُ وحدةٍ الكاشير).
 *
 * كلُّ مسارٍ في `pos.controller.ts` يعلن ردَّه صنفاً من هنا، والمُلحَقُ يصف خاصيّاتِه من أنواعها (`nest-cli.json` — يقرأ `.dto.ts` وحدَها).
 * **والحقولُ كما تُرسَل لا كما تُخزَّن**: المالُ والكمّيةُ (`Decimal`) نصٌّ على السلك (`"12.50"`)، والتاريخُ (`Date`) نصُّ `ISO` — فلا
 * `Decimal` ولا `Date` هنا. **والإلزاميُّ ما يحمله كلُّ ردٍّ من المسار**، والفراغُ معلَنٌ حيث يقع (`x: string | null`)، وما يغيب في
 * بعض مسارات الردّ اختياريّ (`x?`).
 *
 * ⚠️ **وحدُّه معلَن**: الصنفُ حدٌّ أدنى لا حصر — **الحقلُ الزائد غيرُ المعلَن مسموح**، وما لا تقرؤه الواجهةُ من أعمدة الجدول لم يُعلَن كلُّه.
 * **وحارسُ الصدق الحيّ** (`scripts/response-truth.ts`) يطابق ردوداً حقيقيةً على التطبيق المبنيّ بهذه الأصناف: الإلزاميُّ والنوعُ والفراغُ
 * والتعداد.
 *
 * **و`@ApiProperty` حيث لا يصف المُلحَقُ النوعَ وحدَه فقط**: التعدادُ (تعدادُ `Prisma` اتّحادُ نصوص فيقرؤه المُلحَقُ `Object`) · المنطقيُّ
 * الحرفيّ · والاتّحادُ بين صنفين.
 */

// ───────────────────────────── المناوبة ─────────────────────────────

/**
 * المناوبةُ كما يعيدها `posShift.create` — أعمدتُها بلا مجاميع (`POST /pos/shifts`).
 * و`variance` لا يُعلَن هنا: عمودٌ فارغٌ حتى الإقفال، ويُعلَن في ردّ الإقفال وحدَه نصّاً غيرَ فارغ (وإعلانُه هنا يجعل الوارثَ فارغاً).
 */
export class PosShiftResponse {
  id!: string;
  branchId!: string | null;
  drawerId!: string | null;
  openedById!: string;
  openedByName!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: PosShiftStatus })
  status!: PosShiftStatus;
  openedAt!: string;
  closedAt!: string | null;
  openingFloat!: string;
  declaredClosing!: string | null;
  notes!: string | null;
}

/** المناوبةُ بمجاميع درجها المشتقّة — مالٌ نصّاً بخانتين والعدُّ رقم (`totalsText` · `ق-١٢٣٥`). */
export class PosShiftWithTotalsResponse extends PosShiftResponse {
  salesCount!: number;
  cashTotal!: string;
  cardTotal!: string;
  expectedCash!: string;
}

/**
 * ⚖️ **المناوبةُ الحالية مغلَّفةً صراحةً** (`ق-١٤٤٩`): `{ shift: null }` بلا مناوبةٍ مفتوحة — لا جسماً فارغاً يقرؤه قارئٌ `null`
 * وآخرُ `""` أو `{}` (`Nest` يرسل `null` جسماً فارغاً — `ExpressAdapter.reply`). والمفتاحُ حاضرٌ دائماً، والفراغُ في قيمته.
 */
@ApiExtraModels(PosShiftWithTotalsResponse)
export class PosCurrentShiftResponse {
  @ApiProperty({ allOf: [{ $ref: getSchemaPath(PosShiftWithTotalsResponse) }], nullable: true })
  shift!: PosShiftWithTotalsResponse | null;
}

/** المغلَّفُ المرقَّم لقائمة المناوبات (`?page=` — `pagedFindMany`). */
export class PagedPosShiftResponse {
  items!: PosShiftWithTotalsResponse[];
  total!: number;
  page!: number;
  pageSize!: number;
}

/** محاولةُ بطاقةٍ لم تُحسم مسمّاةً في ردّ الإقفال (`ق-١٤١٨`) — والاستعلامُ يقصرها على الثلاث. */
export class PosPendingAttemptResponse {
  id!: string;
  // مجموعةٌ جزئية من التعداد — شرطُ الاستعلام في `closeShift`.
  @ApiProperty({ enum: ['CHARGING', 'UNKNOWN', 'APPROVED'] })
  status!: 'CHARGING' | 'UNKNOWN' | 'APPROVED';
  cardAmount!: string;
  clientSaleId!: string;
  createdAt!: string;
}

/** ردُّ الإقفال — الفرقُ نصّاً بإشارته (`"-30.00"`) وما لم يُحسم من البطاقة مسمّىً. */
export class PosClosedShiftResponse extends PosShiftWithTotalsResponse {
  variance!: string;
  pendingAttempts!: PosPendingAttemptResponse[];
}

// ───────────────────────────── وقائعُ الانقطاع ─────────────────────────────

export class PosIncidentItemResponse {
  id!: string;
  startedAt!: string;
  endedAt!: string;
  firstSyncedAt!: string;
  gapMinutes!: number;
  durationMinutes!: number;
  salesCount!: number;
}

export class PosIncidentsResponse {
  // منطقيٌّ حرفيّ (`true as const`): `enum` في المزخرف يجعل النوعَ عدداً (`getEnumType`) — فيُلفّ التعدادُ في `allOf`.
  @ApiProperty({ type: Boolean, allOf: [{ type: 'boolean', enum: [true] }] })
  inferred!: true;
  gapMinutes!: number;
  items!: PosIncidentItemResponse[];
}

// ───────────────────────────── البيع ─────────────────────────────

/** سطرُ الفاتورة كما يُقرأ مع البيع (`LINE_ORDER` — كلُّ أعمدته). */
export class PosSaleLineResponse {
  id!: string;
  lineNo!: number;
  description!: string;
  productId!: string | null;
  quantity!: string;
  unitCode!: string | null;
  unitPrice!: string;
  discount!: string;
  taxRate!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: TaxCategory })
  taxCategory!: TaxCategory;
  taxExemptionReasonCode!: string | null;
  taxExemptionReason!: string | null;
}

/** المشتري — علاقةٌ إلزاميةٌ على الفاتورة (`customerId` غيرُ فارغ)، فلا فراغ. */
export class PosSaleCustomerResponse {
  id!: string;
  name!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: CustomerKind })
  kind!: CustomerKind;
  vatNumber!: string | null;
  phone!: string | null;
  otherIdScheme!: string | null;
  // ⚖️ ولا رقمَ للمعرّف البديل (توجيه ٢٨٦): مشفَّرٌ في القاعدة، ولا يُقرأ مع البيع (`CUSTOMER_PUBLIC_SELECT`).
  country!: string;
}

/** صفُّ دفعٍ لكل طريقة — نقدٌ أو بطاقةٌ بمبلغه، وبمَ ثبتت البطاقة (`ق-١٣٩٧`). */
export class PosPaymentRowResponse {
  id!: string;
  // العمودُ نصٌّ حرّ، والكاتبُ الوحيد (`completeSaleWithinTx`) يكتب طريقةَ الجزء: نقدٌ أو بطاقة.
  @ApiProperty({ enum: ['CASH', 'CARD'] })
  method!: 'CASH' | 'CARD';
  amount!: string;
  // تعدادُ Prisma فارغٌ لصفّ النقد.
  @ApiProperty({ enum: PosCardVerification, nullable: true })
  verification!: PosCardVerification | null;
  providerRef!: string | null;
  deviceReference!: string | null;
  approvalCode!: string | null;
  attemptId!: string | null;
  createdAt!: string;
}

/**
 * **إيصالُ البيع — ما يحمله كلُّ مسارٍ يعيد بيعاً** (`withReceiptQr`): الفاتورةُ بسطورها ومشتريها وصفوفِ دفعها، ورمزُ الإيصال.
 * هو ردُّ الإعادة في المزامنة وإيصالُ محاولة الدفع المكتملة. (ولا `relatedInvoice` ولا `outstanding` ولا ما يشبههما: لا يُرسَل هنا.)
 */
export class PosSaleReceiptResponse {
  /**
   * ⚖️ **رمزُ الإيصال باسمٍ محايدٍ على السلك** (`ق-١٤٤٨`): حمولتُه (TLV بـbase64) — `null` حين يغيب الاسمُ القانونيّ أو الرقمُ
   * الضريبيّ فلا رمزَ يصحّ، أو حين تُحجب الكاملةُ حتى إجازتها. **اسمُه وظيفتُه لا اسمُ الجهة** — فلا علامةَ سعوديةً على السلك.
   */
  receiptQr!: string | null;
  /** خُتم المستندُ (التوقيعُ والرمزُ التساعيّ) — `false` بلا ختمٍ بعد. */
  stamped!: boolean;
  id!: string;
  no!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: InvoiceDocType })
  docType!: InvoiceDocType;
  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;
  customerId!: string;
  branchId!: string | null;
  issueDate!: string;
  dueDate!: string;
  issuedAt!: string | null;
  issuedOffsetMin!: number | null;
  subtotal!: string;
  taxTotal!: string;
  total!: string;
  notes!: string | null;
  currency!: string;
  exchangeRate!: string;
  posShiftId!: string | null;
  // العمودُ نصٌّ حرّ يكتبه الكاشيرُ وحدَه بطريقة البيع (`@IsIn` في `CreatePosSaleDto`)، وفارغٌ في المخطَّط.
  @ApiProperty({ enum: ['CASH', 'CARD', 'SPLIT'], nullable: true })
  paymentMethod!: 'CASH' | 'CARD' | 'SPLIT' | null;
  clientSaleId!: string | null;
  offlineRef!: string | null;
  createdAt!: string;
  lines!: PosSaleLineResponse[];
  customer!: PosSaleCustomerResponse;
  posPayments!: PosPaymentRowResponse[];
}

/** بندٌ هبط رصيدُه تحت الصفر — الكمّيةُ نصّاً بثلاث خانات (`ق-١٢٣٥`). */
export class PosStockBelowZeroResponse {
  productId!: string;
  resultingQty!: string;
}

/** (`ق-١٤٦٩`) صنفٌ خرج مؤقّتاً **بتكلفة صفر** — بكمّيته نصّاً ومصدر تكلفته؛ و`NONE` صفرٌ بلا مصدر. */
export class PosZeroCostProvisionalResponse {
  productId!: string;
  qty!: string;
  @ApiProperty({ enum: ['WAREHOUSE_LAYER', 'PRODUCT_LAYER', 'PRODUCT_CARD', 'NONE'] })
  costSource!: 'WAREHOUSE_LAYER' | 'PRODUCT_LAYER' | 'PRODUCT_CARD' | 'NONE';
}

/** خُصم المخزون — فرعُ `deducted: true` من `StockDeductionReport`. */
export class PosStockDeductedResponse {
  // منطقيٌّ حرفيٌّ يميّز الفرعين: `enum` في المزخرف يجعل النوعَ عدداً (`getEnumType`) — فيُلفّ التعدادُ في `allOf`.
  @ApiProperty({ type: Boolean, allOf: [{ type: 'boolean', enum: [true] }] })
  deducted!: true;
  warehouseId!: string;
  movements!: number;
  belowZero!: PosStockBelowZeroResponse[];
  /** ما خرج بلا طبقة — نصّاً بثلاث خانات. */
  provisionalQty!: string;
  zeroCostProvisional!: PosZeroCostProvisionalResponse[];
}

/** تُخطّي الخصم صراحةً — فرعُ `deducted: false`. */
export class PosStockSkippedResponse {
  @ApiProperty({ type: Boolean, allOf: [{ type: 'boolean', enum: [false] }] })
  deducted!: false;
  @ApiProperty({ enum: ['NO_BRANCH_WAREHOUSE', 'NO_TRACKED_PRODUCTS'] })
  reason!: 'NO_BRANCH_WAREHOUSE' | 'NO_TRACKED_PRODUCTS';
}

/**
 * تقريرُ الخصم **اتّحادٌ مميَّزٌ بـ`deducted`** — صنفان في `oneOf` لا صنفٌ بحقولٍ اختيارية، كي يبقى النوعُ المولَّد للواجهة
 * `Deducted | Skipped` تُضيّقه `deducted` كما يفعل نوعُ الخادم (`deduction.deducted && deduction.belowZero`).
 */
const STOCK_DEDUCTION = { oneOf: [{ $ref: getSchemaPath(PosStockDeductedResponse) }, { $ref: getSchemaPath(PosStockSkippedResponse) }] };

/** **بيعٌ أُتمّ الآن** (`finishReceipt`) — `POST /pos/sales` لا يعرف الإعادة (لا `clientSaleId` في جسمه)، فالثلاثةُ حاضرةٌ دائماً. */
@ApiExtraModels(PosStockDeductedResponse, PosStockSkippedResponse)
export class PosSaleResponse extends PosSaleReceiptResponse {
  // اتّحادُ صنفين — المُلحَقُ يقرؤه Object.
  @ApiProperty({ type: Object, ...STOCK_DEDUCTION })
  stockDeduction!: PosStockDeductedResponse | PosStockSkippedResponse;
  stampError!: string | null;
  clearance!: PosClearanceResponse;
}

/**
 * **المزامنة** — أوّلُها يُتمّ البيعَ (`finishReceipt`: الثلاثةُ حاضرة)، **وإعادتُها بالمعرّف نفسِه تعيد الإيصالَ وحدَه**
 * (`withReceiptQr`: لا خصمَ ولا ختمَ ولا إجازة) — فالثلاثةُ اختيارية.
 */
@ApiExtraModels(PosStockDeductedResponse, PosStockSkippedResponse)
export class PosSyncedSaleResponse extends PosSaleReceiptResponse {
  // اتّحادُ صنفين — المُلحَقُ يقرؤه Object.
  @ApiProperty({ type: Object, required: false, ...STOCK_DEDUCTION })
  stockDeduction?: PosStockDeductedResponse | PosStockSkippedResponse;
  stampError?: string | null;
  clearance?: PosClearanceResponse;
}

// ───────────────────────────── بوابةُ الدفع ومحاولاتُها ─────────────────────────────

/** `{ active: false }` بلا ربط، أو المزوّدُ ومهلةُ جهازه بالمللي ثانية (`ق-١٣٩٨`). */
export class PosPaymentModeResponse {
  active!: boolean;
  provider?: string;
  deadlineMs?: number;
}

/** دليلُ الحسم اليدويّ (`ق-١٣٩٩`) — حاضرٌ حين حُسمت بالدليل وحدَه. */
export class PosAttemptEvidenceResponse {
  deviceReference!: string | null;
  approvalCode!: string | null;
  note!: string | null;
}

/** المحاولةُ كما تخرج (`present`) — المالُ نصّاً، ولا لقطةَ البيع كاملةً. */
export class PosPaymentAttemptResponse {
  id!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: PosPaymentAttemptStatus })
  status!: PosPaymentAttemptStatus;
  clientSaleId!: string;
  shiftId!: string;
  cardAmount!: string;
  // لا فراغ: لقطةُ البيع (`sale Json`) إلزاميةٌ في المخطَّط، وغيابُ مجموعها يرمي `500` لا `null` (مراجعةُ الصنف).
  total!: string;
  // من لقطة البيع — طريقةُ `CreatePosSaleDto`.
  @ApiProperty({ enum: ['CASH', 'CARD', 'SPLIT'], nullable: true })
  paymentMethod!: 'CASH' | 'CARD' | 'SPLIT' | null;
  currency!: string;
  provider!: string;
  providerRef!: string | null;
  approvalCode!: string | null;
  declineReason!: string | null;
  detail!: string | null;
  invoiceId!: string | null;
  chargeStartedAt!: string | null;
  resolvedAt!: string | null;
  @ApiProperty({ enum: PosPaymentResolution, nullable: true })
  resolution!: PosPaymentResolution | null;
  resolvedByName!: string | null;
  evidence!: PosAttemptEvidenceResponse | null;
  createdAt!: string;
}

/** المحاولةُ بإيصال بيعها (`view`) — `null` ما لم تكتمل. ردُّ القراءة والشحن والحسمين والإلغاء. */
export class PosPaymentAttemptWithSaleResponse extends PosPaymentAttemptResponse {
  sale!: PosSaleReceiptResponse | null;
}

/** المحاولةُ المفتوحة في القائمة — باسم كاشير مناوبتها. */
export class PosOpenPaymentAttemptResponse extends PosPaymentAttemptResponse {
  cashierName!: string;
}

// ───────────────────────────── مطابقةُ البطاقة ─────────────────────────────

/** دفعةُ بطاقةٍ لم تمرّ بالمزوّد (`ق-١٣٩٧`) — بحال المطابقة والمهلة. */
export class PosCardVerificationRowResponse {
  posPaymentId!: string;
  invoiceId!: string;
  invoiceNo!: string;
  /** يومُ الفاتورة `YYYY-MM-DD`. */
  issueDate!: string;
  amount!: string;
  // مجموعةٌ جزئية من التعداد — شرطُ الاستعلام في `rows()`.
  @ApiProperty({ enum: ['DEVICE_REFERENCE', 'MANUAL_EVIDENCE'] })
  verification!: 'DEVICE_REFERENCE' | 'MANUAL_EVIDENCE';
  deviceReference!: string | null;
  approvalCode!: string | null;
  resolvedByName!: string | null;
  cashierName!: string | null;
  receiptNo!: string | null;
  settlementNo!: string | null;
  matched!: boolean;
  ageDays!: number;
  overdue!: boolean;
}

/** معلّقٌ من مناوبةٍ مقفلة (`ق-١٤١٨`) — حتى يحسمه جوابُ المزوّد أو الدليل. */
export class PosUnresolvedAttemptRowResponse {
  attemptId!: string;
  // مجموعةٌ جزئية من التعداد — شرطُ الاستعلام في `unresolvedAttempts()`.
  @ApiProperty({ enum: ['CHARGING', 'UNKNOWN', 'APPROVED'] })
  status!: 'CHARGING' | 'UNKNOWN' | 'APPROVED';
  amount!: string;
  provider!: string;
  createdAt!: string;
  detail!: string | null;
  /** اسمُ من فتح المناوبة — عمودٌ غيرُ فارغ. */
  cashierName!: string;
  shiftClosedAt!: string | null;
}

export class PosCardVerificationListResponse {
  settlementDays!: number;
  items!: PosCardVerificationRowResponse[];
  unresolvedAttempts!: PosUnresolvedAttemptRowResponse[];
}
