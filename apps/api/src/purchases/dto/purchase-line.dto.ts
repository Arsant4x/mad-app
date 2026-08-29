import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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
}
