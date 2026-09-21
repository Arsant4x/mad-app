import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateIf, ValidateNested } from 'class-validator';

export class OpenShiftDto {
  /** العهدة الافتتاحية — what the drawer starts with. Zero is a valid float. */
  @IsNumber()
  @Min(0)
  openingFloat!: number;

  @IsOptional()
  @IsString()
  branchId?: string;

  /**
   * الدرجُ الذي تُفتح عليه المناوبة (`ق-٢١٨`). يُترك فارغاً فيُؤخذ **الدرجُ
   * الافتراضيُّ لفرعها** — فالكاشيرُ لا يختار حساباً، والتفصيلُ يبقى قائماً.
   */
  @IsOptional()
  @IsString()
  drawerId?: string;
}

export class CloseShiftDto {
  /** What the cashier actually counted; the variance against the expected
   * drawer is computed server-side, never typed in. */
  @IsNumber()
  @Min(0)
  declaredClosing!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * **انحرافُ الطرفية عن `UTC` بالدقائق** لحظةَ الإقفال — كما يُرسَل مع البيع (`ringOffsetMin`) — فيُؤرَّخ
   * قيدُ التسوية **بيوم الكاشير** لا بيوم الخادم (`ق-٧٣٦`): بين منتصف الليل والثالثة فجراً بتوقيت
   * المملكة كان يقع في اليوم السابق. طرفيةٌ أقدم لا تُرسله تُعامَل بيوم `UTC` كما كانت — حدٌّ معلَن.
   */
  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  closedOffsetMin?: number;
}

export class PosPaymentPartDto {
  @IsIn(['CASH', 'CARD'])
  method!: 'CASH' | 'CARD';

  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class PosSaleLineDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  /** ④B1 — خصمٌ على سطر الكاشير مبلغاً (≥ 0 ولا يفوق الكمية × السعر). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class CreatePosSaleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PosSaleLineDto)
  lines!: PosSaleLineDto[];

  /** SPLIT = نقدي + بطاقة معاً؛ التفصيل في payments. */
  @IsIn(['CASH', 'CARD', 'SPLIT'])
  paymentMethod!: 'CASH' | 'CARD' | 'SPLIT';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosPaymentPartDto)
  payments?: PosPaymentPartDto[];

  /** Optional named customer; omitted = the walk-in «عميل نقدي». */
  @IsOptional()
  @IsString()
  customerId?: string;

  /**
   * متى رُنّ البيع فعلاً (ISO) **وانحرافُ الجهاز عن UTC بالدقائق** (`ق-١٨٥`) —
   * للبيع الحيّ والمزامَن سواء: منهما يُشتقّ يومُ الفاتورة **ووقتُها** كما يقرؤهما
   * التاجر، لا تاريخُ UTC ولا منتصفُ الليل. **انحرافٌ بلا لحظةٍ يُرفَض** — لا معنى له
   * وحده؛ ولحظةٌ بلا انحراف تُقبَل (طرفيةٌ أقدم) وتُعامَل بيوم UTC كما كانت.
   */
  @ValidateIf((o: CreatePosSaleDto) => o.ringAt !== undefined || o.ringOffsetMin !== undefined)
  @IsDateString()
  ringAt?: string;

  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  ringOffsetMin?: number;
}

/** مزامنة بيع أوفلاين: نفس البيع + هوية الطرفية التي تجعل الإرسال آمن التكرار. */
export class SyncPosSaleDto extends CreatePosSaleDto {
  /** Terminal-generated UUID — the idempotency key. */
  @IsString()
  clientSaleId!: string;

  /** المرجع المؤقت المطبوع على الإيصال قبل وجود رقم حقيقي. */
  @IsOptional()
  @IsString()
  offlineRef?: string;
}
