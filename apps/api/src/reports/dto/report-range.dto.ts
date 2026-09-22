import { IsBooleanString, IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** ميزان المراجعة (10.4): فترة + فرع اختياري — «أو مجمَّع» عند غيابه. */
export class TrialBalanceDto extends ReportRangeDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}

/**
 * أعمار الذمم (4.6): تاريخ التقرير + فرع اختياري (أو مجمَّع) + عميل بعينه.
 *
 * `reconcile` يطلب مقارنة المجموع برصيد 1200 — مسحُ الدفتر أثقل من
 * التقرير نفسه، فلا يُدفع ثمنه إلا حين يطلبه المحاسب.
 */
export class AgingDto {
  /** تاريخ التقرير — الافتراض اليوم. الأعمار تُقاس إليه لا إلى اليوم دائماً. */
  @IsOptional()
  @IsDateString()
  asOf?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsBooleanString()
  reconcile?: string;
}

/**
 * الأستاذُ العام (`ق-١٢٦١` ج): حسابٌ واحد على مدىً وفرعٍ اختياريين — أو بُعدٌ (عقارٌ · وحدة)
 * بدل الحساب؛ واحدٌ منها على الأقلّ وإلا `400` — دفترٌ بلا مرشِّح ميزانٌ لا أستاذ.
 */
export class LedgerDto extends TrialBalanceDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;
}

/** كشفُ حساب طرف (`SPEC 4.2`): عميلٌ أو مورّد — واحدٌ منهما لا كلاهما. */
export class StatementDto extends TrialBalanceDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}
