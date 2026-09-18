import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/**
 * بند شراء — **الصفّ الذي لم يكن**.
 *
 * كان الشراء رأساً بلا بنود، فلا شيء يقول *ماذا* اشترى التاجر. ولهذا لم يكن
 * لطبقات التكلفة مصدرٌ تُبنى منه، ولا لقيد تكلفة المبيعات ما يُطلقه.
 *
 * ⚠️ **ولا يتغيّر الترحيل المحاسبي بهذه الموجة**: القيد يقرأ رأس المستند كما
 * كان. البنود تُخزَّن ليقرأها ما بعدها.
 */
export class PurchaseLineDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  /**
   * الصنف المشترى.
   *
   * **وجودُه هو ما يفصل البند المخزني عن الخدمي** — لا علَمٌ منفصل. لأن علَماً
   * يستطيع أن يخالف الصنف، فيلزم عندئذٍ من يحكم أيّهما يكذب.
   *
   * ⚠️ وبندٌ بلا صنف **لا تُنشأ له طبقة تكلفة ولا يُحسب له COGS**.
   */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  /**
   * ٥+٦ الدفعةُ والانتهاءُ على سطر الاستلام (`ق-١٠٨٦`) — يصنع منهما الاستلامُ كيانَ الدفعة ويربط طبقتَه به.
   * لصنفٍ معلَنٍ تتبّعُه غيابُهما يُردّ مسمًّى (والحكمُ في قبوله بلا دفعة ينتظر المالك — الموجز `§٤/٤`)؛ ورقمٌ بلا
   * انتهاءٍ يُردّ: الدفعةُ تُعلَن بانتهائها.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
