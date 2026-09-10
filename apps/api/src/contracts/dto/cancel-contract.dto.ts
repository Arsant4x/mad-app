import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';

const SETTLEMENT_BASES = ['none', 'amount', 'installments', 'all'] as const;

/** بند من تفصيل التسوية: «شهر إشعار: 3000» · «خصم صيانة: -450». */
export class SettlementLineDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  /** موجب = على المستأجر، سالب = له — والمجموع يجب أن يساوي مبلغ التسوية. */
  @IsNumber()
  amount!: number;
}

export class CancelContractDto {
  @IsString()
  @IsNotEmpty()
  cancelDate!: string;

  @IsString()
  @IsNotEmpty()
  cancelReason!: string;

  /** 'keep' leaves not-yet-due installments owed as-is; 'cancel' voids every
   * unpaid installment due on/after the cancel date — matches the mockup's
   * cancel-contract dialog. */
  @IsIn(['keep', 'cancel'])
  installmentDisposition!: 'keep' | 'cancel';

  /**
   * How the early-termination settlement is worked out:
   *
   * - `none` — the parties agreed on nothing, so nothing is posted;
   * - `amount` — an explicitly negotiated figure;
   * - `installments` — the next N unpaid installments' worth;
   * - `all` — everything still unpaid from the cancel date onwards.
   *
   * The last two are conveniences that compute an amount; only the number they
   * arrive at is stored, because the installments themselves may be voided in
   * the same call.
   */
  @IsOptional()
  @IsIn(SETTLEMENT_BASES)
  settlementBasis?: (typeof SETTLEMENT_BASES)[number];

  @ValidateIf((o) => o.settlementBasis === 'amount')
  @IsNumber()
  @IsPositive()
  settlementAmount?: number;

  /** تفصيل التسوية بنوداً (§16) — اختياري؛ عند وجوده يُدقَّق مجموعه ضد
   * المبلغ المحسوب ويُخزَّن سطراً سطراً. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementLineDto)
  settlementLines?: SettlementLineDto[];

  @ValidateIf((o) => o.settlementBasis === 'installments')
  @IsInt()
  @Min(1)
  settlementInstallments?: number;

  /**
   * ⚖️ **وجهةُ المقبوض عن مدّةٍ لم تُقدَّم — ولا قيمةَ افتراضية** (`ق-٤٧٢`).
   *
   * - `refund` — **يُردّ للمستأجر**: نقدٌ يخرج مقابلَ الالتزام.
   * - `income` — **يُحتجَز بشرط العقد**: دخلٌ آخر (`4300`).
   *
   * **⛔ ولا يذهب إلى `4200` بحال**: إيرادُ الإيجار يُكتسب بتأجير العقارِ مدّةً،
   * **وهذه مدّةٌ لا يشغلها المستأجر** — وهي حجّةُ `4300` المنصوصةُ في
   * `auto-posting.util.ts` منذ تسوية الإلغاء.
   *
   * ⚠️ **وصمتُه يمنع الإلغاء** حين يوجد التزامٌ فعليّ — **فكلا الخيارين يكذب
   * على نصف الحالات، ولا افتراضَ آمن** (حكمُ المالك). **ولا يُطلَب حين لا
   * التزام**، فسؤالٌ بلا موضوعٍ يُضغَط بلا قراءة.
   *
   * 📌 **ولماذا حقلٌ مستقلٌّ لا `settlementBasis`**: ذاك يحسب **ما على
   * المستأجر**، وهذا يقرّر **وجهةَ ما قُبض منه** — كمّيتان مختلفتان. **وحقلٌ
   * يُستعمل في غير ما وُضع له يُنتج رقماً يُقرأ صحيحاً وهو كاذب** (`ق-٤٦١`).
   */
  @IsOptional()
  @IsIn(['refund', 'income'])
  unearnedDisposition?: 'refund' | 'income';
}
