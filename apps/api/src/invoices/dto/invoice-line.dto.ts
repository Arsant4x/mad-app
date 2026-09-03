import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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

  /**
   * **لسطر الإشعار الدائن وحده** (`SPEC 30.2` · `30.4`): سطرُ الفاتورة الأصلية الذي يُردّ.
   * به تُعرف حركةُ البيع الأصلية فتُعاد طبقاتها، ويُحسب ما أُرجع منه سابقاً كي لا يُرجَع
   * أكثر ممّا بِيع. سطرٌ بلا هذا الرابط إشعارٌ محاسبيّ (خصم · تصحيح) **لا يمسّ المخزون**.
   */
  @IsOptional()
  @IsUUID()
  returnsLineId?: string;

  /**
   * حالة البضاعة المرتجعة (`SPEC 30.4–30.6`). `GOOD` تعود إلى المخزون المتاح وتُعكس
   * تكلفتها. **`DAMAGED` و`REPAIRABLE` تُحفظ حالةً ولا تمسّ المخزون في موجة أ** — معالجتهما
   * (حساب التلف `5800` · مستودع الفحص) معلَّقةٌ على بحث ضريبة القيمة المضافة للبضاعة التالفة
   * (قرار المالك 2026-09-03).
   */
  @IsOptional()
  @IsIn(['GOOD', 'DAMAGED', 'REPAIRABLE'])
  returnCondition?: 'GOOD' | 'DAMAGED' | 'REPAIRABLE';
}
