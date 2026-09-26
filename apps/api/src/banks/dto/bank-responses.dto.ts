import { ApiProperty } from '@nestjs/swagger';
import { BankKind } from '@prisma/client';

/**
 * ⚖️ **ردُّ نقل صفّ البنك بين الفروع** (`ق-١٤٣١`) بأصنافٍ مسمّاة — مسارٌ دخل `main` (`#611`) بعد أن بُني مِسنَنُ الردود
 * (`ق-١٤٣٨`)، **والمِسنَنُ لا يزيد**: فكان إعلانُ ردِّه شرطَ دمج `#614` لا إضافتَه إلى القائمة بيد.
 *
 * **والحقولُ كما تُرسَل** (نمطُ `pos-responses.dto.ts`): المالُ (`Decimal`) نصٌّ على السلك، والتاريخُ نصُّ `ISO`. **والصنفُ حدٌّ أدنى**:
 * صفُّ البنك يُرسَل بأعمدته كلِّها، والمعلَنُ هنا ما يحمله كلُّ ردٍّ ويقرؤه القارئ. ⚠️ **ووحدةُ البنوك كلُّها هي التاليةُ لحارس
 * الصدق الحيّ** (`ق-١٤٥٠`) — فهذا الصنفُ يُطابَق حيّاً حين تُضاف، لا قبلها.
 */
export class BankRowResponse {
  id!: string;
  name!: string;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: BankKind })
  kind!: BankKind;
  branchId!: string | null;
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
