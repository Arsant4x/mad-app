import { ApiProperty } from '@nestjs/swagger';
import { FormInstanceStatus, FormItemType } from '@mad-app/db';

/**
 * ⚖️ **ردودُ السجلّ المعبّأ** (توجيه ٢٧٨ · `ق-١٦٣٦` · `ق-١٤٣٨`) كما يُخرجها `presentInstance()`: الرقمُ (`Decimal`) نصٌّ، والأوقاتُ `ISO`،
 * والتاريخُ `YYYY-MM-DD`، والانحرافُ (`outOfRange`) محسوبٌ لا مخزَّن.
 */

export class FormInstanceTypeRefResponse {
  id!: string;
  code!: string;
  name!: string;
}

export class FormInstanceTemplateRefResponse {
  id!: string;
  familyId!: string;
  version!: number;
  name!: string;
  formType!: FormInstanceTypeRefResponse;
}

/** بندُ القالب وقيمتُه في السجلّ. */
export class FormInstanceItemResponse {
  itemId!: string;
  lineNo!: number;
  label!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: FormItemType })
  itemType!: FormItemType;
  required!: boolean;
  minValue!: string | null;
  maxValue!: string | null;
  isBlocking!: boolean;
  unit!: string | null;
  helpText!: string | null;
  text!: string | null;
  number!: string | null;
  bool!: boolean | null;
  note!: string | null;
  /** قيمةٌ رقميةٌ خارج نطاق بندها — تُحسب ولا تُكتب. */
  outOfRange!: boolean;
}

/** السجلُّ المعبّأ ببنوده، وحقولُ ختمه (`FormSeal`) فارغةٌ للمسوّدة. */
export class FormInstanceResponse {
  id!: string;
  /** إصدارُ القالب الذي عُبّئ عليه (القاعدةُ ١ من §٦.٢). */
  templateVersionId!: string;
  template!: FormInstanceTemplateRefResponse;
  /** الكيانُ المرتبط كما كتبه النشاطُ الطالب (`contract`). */
  linkedEntityType!: string;
  linkedEntityId!: string;
  formDate!: string;
  @ApiProperty({ enum: FormInstanceStatus })
  status!: FormInstanceStatus;
  /** `FRM-<السنة>-<التسلسل>` عند الختم. */
  no!: string | null;
  /** موضعُه في سلسلة أختام المنشأة. */
  sealSeq!: number | null;
  /** بصمةُ السجلّ كلِّه `SHA-256`. */
  contentHash!: string | null;
  /** بصمةُ الختم السابق في المنشأة، وفارغةٌ لأوّلها. */
  prevHash!: string | null;
  filledByName!: string;
  sealedByName!: string | null;
  sealedAt!: string | null;
  createdAt!: string;
  items!: FormInstanceItemResponse[];
}

/** حكمُ التحقّق من المختوم: البصمةُ معادةً من الصفوف، وصلتُه بسابقه في السلسلة. */
export class FormVerificationResponse {
  no!: string;
  contentHash!: string;
  recomputedHash!: string;
  contentIntact!: boolean;
  chainLinked!: boolean;
  valid!: boolean;
}
