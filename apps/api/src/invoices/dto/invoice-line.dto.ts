import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class InvoiceLineDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  /**
   * الصنف المُباع — **الرابط الذي يحتاجه قيد تكلفة المبيعات ولم يكن موجوداً**.
   *
   * اختياريٌّ هنا لأن **السطر الخدمي لا صنف له**: إيجارٌ شهري، أو ساعة
   * استشارة، أو بلاغ صيانة. وإلزامه على كل سطر يكسر أول فاتورة إيجار.
   *
   * ⚠️ **والأثر معلَن**: سطرٌ بلا صنف **لا يُحسب له COGS** — لا طبقة تكلفة
   * يُستهلك منها. فمن باع بضاعةً وتركه فارغاً يقرأ إيرادَه بلا تكلفته.
   */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate!: number;
}
