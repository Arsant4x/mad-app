import { ApiProperty } from '@nestjs/swagger';
import { BankKind } from '@mad-app/db';

/**
 * ⚖️ **ردودُ البنوك بأصنافٍ مسمّاة** (`ق-١٤٥٠`: «الوحدةُ التالية البنوكُ ثم الموافقات» · خطّةُ الأنواع ④ — الوحدةُ الثانية بعد الكاشير).
 * صفُّ البنك ونطاقُ رموزه وقائمتُه هنا، ونقلُه بين الفروع (`ق-١٤٣١`)؛ والتسويةُ البنكيةُ والإيداعاتُ وتسوياتُ الشبكة في ملفّاتها.
 * ونقلُ الصفّ دخل `main` (`#611`) بعد أن بُني مِسنَنُ الردود (`ق-١٤٣٨`)، **والمِسنَنُ لا يزيد**: فكان إعلانُ ردِّه شرطَ دمج `#614`.
 *
 * **والحقولُ كما تُرسَل** (نمطُ `pos-responses.dto.ts`): المالُ (`Decimal`) نصٌّ على السلك، والتاريخُ نصُّ `ISO`. **والصنفُ حدٌّ أدنى**:
 * صفُّ البنك يُرسَل بأعمدته كلِّها، والمعلَنُ هنا ما يحمله كلُّ ردٍّ ويقرؤه القارئ — **وفراغُه من المخطَّط لا من ردٍّ رُئي** (`String?`
 * فارغٌ هنا وإن لم يُرَ فارغاً). **وحارسُ الصدق الحيّ** (`scripts/response-truth.ts`) يطابق كلَّ مسارٍ في الوحدة بردٍّ حقيقيّ.
 */
export class BankRowResponse {
  id!: string;
  name!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: BankKind })
  kind!: BankKind;
  branchId!: string | null;
  // الآيبانُ اختياريٌّ عند الإنشاء ويُكتب فراغاً حين يُترك (`dto.iban || null`) — وتقرؤه الشاشةُ في القائمة والبحث.
  iban!: string | null;
  accountId!: string;
  currency!: string;
  balance!: string;
  openingBalance!: string;
  openingDate!: string;
  archived!: boolean;
  transferredToId!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

/** المغلَّفُ المرقَّم لقائمة البنوك (`?page=` — `pagedFindMany`)؛ وبلا `?page` مصفوفةٌ من الصفّ نفسِه. */
export class PagedBankRowResponse {
  items!: BankRowResponse[];
  total!: number;
  page!: number;
  pageSize!: number;
}

/**
 * **حالُ نطاق رموز الحسابات** (`bandStatus` — `accounts/code-bands.ts` · `ق-٢٩٥`): يُنذر قبل الاصطدام لا عنده.
 * الاسمُ عامٌّ لا بنكيّ عمداً — فالشكلُ نفسُه لنطاق الأدراج (`GET /cash-drawers/code-band`) حين تُعلَن وحدتُه.
 */
export class CodeBandStatusResponse {
  key!: string;
  name!: string;
  capacity!: number;
  remaining!: number;
  /** الرمزُ التالي — فارغٌ حين امتلأ النطاق. */
  next!: string | null;
  warnThreshold!: number;
  warn!: boolean;
}

/** مرجعٌ مسمّى (`{ id, name }`) — الدرجُ والبنكُ كما يُضمّان إلى مستندات الوحدة (`select: { id, name }`). */
export class BanksRefResponse {
  id!: string;
  name!: string;
}

/** الحسابُ البنكيّ — للقادم وحدَه: يتغيّر فرعُه ولا عدَّ ولا قيد. */
export class BankAccountTransferResponse {
  @ApiProperty({ enum: ['BANK_ACCOUNT'] })
  kind!: 'BANK_ACCOUNT';
  fromBranchId!: string | null;
  toBranchId!: string | null;
  bank!: BankRowResponse;
}

/** أرقامُ القيود الثلاثة — كلٌّ فارغٌ حين لا يقع (لا فرقَ · لا معدود). */
export class BankTransferEntriesResponse {
  variance!: string | null;
  out!: string | null;
  in!: string | null;
}

/** الصندوقُ النقديّ — إغلاقٌ وفتح: القديمُ مؤرشفٌ برابط خلفه، والعدُّ والفرقُ نصّاً بخانتين. */
export class CashBoxTransferResponse {
  @ApiProperty({ enum: ['CASH_BOX'] })
  kind!: 'CASH_BOX';
  from!: BankRowResponse;
  to!: BankRowResponse;
  bookBalance!: string;
  countedAmount!: string;
  variance!: string;
  entries!: BankTransferEntriesResponse;
}
