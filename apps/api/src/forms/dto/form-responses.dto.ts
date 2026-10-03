import { ApiProperty } from '@nestjs/swagger';
import { FormItemType, FormTemplateStatus } from '@mad-app/db';

/**
 * ⚖️ **ردودُ محرّك النماذج بأصنافٍ مسمّاة** (توجيه ٢٧٨ · `ق-١٦٣٤` · `ق-١٤٣٨`) — كما يُخرجها `presentTemplate()`:
 * النطاقُ (`Decimal`) نصٌّ على السلك، والأوقاتُ نصُّ `ISO`.
 */

/** نوعُ نموذجٍ في كتالوج المنصّة. */
export class FormTypeResponse {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
  /** نشاطُ المنشأة الذي يخصّه، وفارغٌ = لكلِّ الأنشطة. */
  sector!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

/** بندٌ في إصدار القالب. */
export class FormTemplateItemResponse {
  id!: string;
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
}

/** إصدارُ قالبٍ ببنوده. */
export class FormTemplateResponse {
  id!: string;
  /** فارغٌ لقالب المنصّة، ومعرّفُ المنشأة لنسختها. */
  companyId!: string | null;
  formTypeId!: string;
  formType!: FormTypeResponse;
  familyId!: string;
  version!: number;
  @ApiProperty({ enum: FormTemplateStatus })
  status!: FormTemplateStatus;
  name!: string;
  description!: string | null;
  /** للنسخة: الإصدارُ العامُّ الذي نُسخت منه. */
  sourceTemplateId!: string | null;
  publishedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  items!: FormTemplateItemResponse[];
}

/** صفُّ إصدارٍ في القائمة — بلا بنوده، وبعددها. */
export class FormTemplateRowResponse {
  id!: string;
  companyId!: string | null;
  formTypeId!: string;
  formType!: FormTypeResponse;
  familyId!: string;
  version!: number;
  @ApiProperty({ enum: FormTemplateStatus })
  status!: FormTemplateStatus;
  name!: string;
  description!: string | null;
  sourceTemplateId!: string | null;
  publishedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  itemCount!: number;
  /** للنسخة: آخرُ إصدارٍ منشورٍ من القالب العامّ الذي نُسخت منه («أحدثُ من أصل نسختك»)؛ وفارغٌ لغيرها. */
  sourceLatestVersion!: number | null;
}
