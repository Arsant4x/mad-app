import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /**
   * **العاملُ الثاني** (`ق-١٣١٨` · ⑨A1) — رمزُ تطبيق المصادقة أو رمزُ استرداد.
   *
   * **اختياريٌّ في العقد وإلزاميٌّ بالحال**: من لم يُسجّل لا يُطالَب به، ومن سجّل يُردّ
   * بلا رمزٍ بـ`401` **حاملاً `mfaRequired`** — فتسأله الشاشةُ عنه ثم تُعيد الإرسال.
   * **وطلبةٌ واحدة لا طلبتان**: لا رمزَ وسيطاً يُصدَر بين الخطوتين فيُسرَق.
   */
  @IsOptional()
  @IsString()
  code?: string;
}
