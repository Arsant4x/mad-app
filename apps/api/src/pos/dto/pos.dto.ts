import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

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
   * When the sale was rung (ISO) and the device's offset from UTC in minutes. The offset gives the invoice day as the
   * merchant reads it; the time is kept only for a synced offline sale, between its shift's opening and now, while a
   * live sale is timed by the server. An offset without a time is refused.
   */
  @ValidateIf((o: CreatePosSaleDto) => o.ringAt !== undefined || o.ringOffsetMin !== undefined)
  @IsDateString()
  ringAt?: string;

  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  ringOffsetMin?: number;

  /**
   * ⚖️ **رقمُ مرجع الجهاز من إيصاله** (`ق-١٣٩٧`/١ · `ق-١٤١٩`) — **إلزاميٌّ لجزء البطاقة إن لم يمرّ بمحاولة دفع**: بيعٌ دون اتصالٍ
   * والربطُ فعّال، **أو جهازٌ مستقلٌّ بلا ربط** («فالحكمُ واحد» بنصّ المالك) — **لا «أكّده الكاشير» وحدَه**. يُعلَّم غيرَ متحقَّقٍ
   * حتى تطالب به تسويةُ الشبكة. (ومحاولةُ الدفع ترث الحقلَ ولا تقرؤه: مرجعُها جوابُ المزوّد.)
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cardDeviceReference?: string;
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

/**
 * ⭐ **محاولةُ دفع البطاقة** (`ق-١٤٠١`): البيعُ نفسُه بهويّة الطرفية — يُتحقَّق منه ويُحفظ لقطةً **بلا فاتورةٍ ولا شحن**،
 * ثم يُشحن بمسارٍ مستقلّ خارج كلِّ معاملة. وإعادةُ الطلب بالمعرّف نفسِه تعيد المحاولةَ نفسَها.
 */
export class CreatePosPaymentAttemptDto extends CreatePosSaleDto {
  @IsString()
  clientSaleId!: string;

  @IsOptional()
  @IsString()
  offlineRef?: string;
}

/** مرشِّحُ دفعات البطاقة غير المتحقَّقة (`ق-١٣٩٧`): المفتوحُ افتراضاً · ما تجاوز المهلة · ما طابقته تسوية · الكلّ. */
export class CardVerificationsQueryDto {
  @IsOptional()
  @IsIn(['open', 'overdue', 'matched', 'all'])
  state?: 'open' | 'overdue' | 'matched' | 'all';
}

/**
 * ⚖️ **الحسمُ اليدويّ للمعلّق — بدليلٍ لا بقول** (`ق-١٣٩٩`): إيصالُ الجهاز (مرجعُه) ورمزُ الموافقة، لصاحب صلاحية المراجعة،
 * **بعد أن يُسأل المزوّد فلا يُجيب**؛ ولا يُعدّ نهائياً حتى تطابقه التسوية.
 */
export class ResolvePaymentAttemptWithEvidenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  deviceReference!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  approvalCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
