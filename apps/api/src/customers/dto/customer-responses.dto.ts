import { ApiProperty } from '@nestjs/swagger';
import { CustomerKind } from '@mad-app/db';

/**
 * ⚖️ **ردُّ تفصيل العميل** (`GET /customers/:id` · توجيه ٢٨٦) بصنفٍ مسمّى — مسارٌ جديد بعد مِسنَن الردود (`ق-١٤٣٨`)، والمِسنَنُ لا يزيد.
 *
 * **والحقولُ كما تُرسَل**: العميلُ بلا نصِّ معرّفه البديل المشفَّر ولا بصمته (`publicCustomer`)، ومعه **الرقمُ مفكوكاً** لنافذة
 * التعديل — وهذا الردُّ وحدَه يحمله. **والصنفُ حدٌّ أدنى**: المعلَنُ ما يحمله كلُّ ردٍّ ويقرؤه القارئ.
 */
export class CustomerDetailResponse {
  id!: string;
  name!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: CustomerKind })
  kind!: CustomerKind;
  vatNumber!: string | null;
  phone!: string | null;
  creditLimit!: string;
  otherIdScheme!: string | null;
  /** أمسجَّلٌ معرّفٌ بديل — علامةٌ لا قيمة، كما في القائمة. */
  otherIdOnFile!: boolean;
  /** الرقمُ مفكوكاً — في هذا الردّ وحدَه. */
  otherId!: string | null;
  country!: string;
  street!: string | null;
  buildingNumber!: string | null;
  district!: string | null;
  city!: string | null;
  postalCode!: string | null;
  archived!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
