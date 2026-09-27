import { ApiProperty } from '@nestjs/swagger';
import { CashDepositStatus } from '@mad-app/db';
import { BanksRefResponse } from './bank-responses.dto';

/**
 * ⚖️ **ردودُ إيداع الدرج عبر «نقدٍ في الطريق»** (`ق-١٤٥٠` · ⑦A3 — `cash-deposits.service.ts`) بأصنافٍ مسمّاة.
 *
 * **والفراغُ من المخطَّط لا ممّا رُئي**: `journalEntryId` عمودٌ `String?` (الهجرة `20260921220000_cash_deposits` بلا `NOT NULL`) — والكاتبُ
 * الوحيدُ اليوم يملؤه دائماً فلم يُرَ فارغاً حيّاً، **لكن الصنفَ يعلن ما تقبله القاعدة لا ما صادفه القياس**. وكان نوعُ الواجهة المكتوبُ
 * بيدٍ يقول `string` (قِيس قبل البناء — تقريرُ `ق-١٤٥٠`).
 */

/**
 * **أعمدةُ الإيداع** — ما يعيده الإلغاءُ (`cashDeposit.update` **بلا ضمّ الدرج والبنك**). المبلغُ نصٌّ بخانتين، واليومُ `YYYY-MM-DD`.
 * ⚠️ وكان نوعُ الواجهة يعلن للإلغاء `drawer` و`bank` — **ولا يُرسَلان فيه** (قِيس حيّاً قبل البناء).
 */
export class CashDepositRowResponse {
  id!: string;
  no!: string;
  /** يومُ الإيداع `YYYY-MM-DD`. */
  date!: string;
  amount!: string;
  memo!: string | null;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: CashDepositStatus })
  status!: CashDepositStatus;
  drawerId!: string;
  bankId!: string;
  branchId!: string | null;
  journalEntryId!: string | null;
  voidJournalEntryId!: string | null;
  confirmedTransactionId!: string | null;
  confirmedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

/** الإيداعُ في القائمة وعند إنشائه — بالدرج والبنك مسمّيَين (`include: { drawer, bank }`). */
export class CashDepositResponse extends CashDepositRowResponse {
  drawer!: BanksRefResponse;
  bank!: BanksRefResponse;
}

/** `POST /banks/cash-deposits` — ورقمُ قيد الإيداع. */
export class CreatedCashDepositResponse extends CashDepositResponse {
  entryNo!: string;
}

/** `POST /banks/cash-deposits/:depositId/void` — أعمدةُ المستند ورقمُ قيد العكس (بلا الدرج والبنك). */
export class VoidedCashDepositResponse extends CashDepositRowResponse {
  voidEntryNo!: string;
}

/** رصيدُ `1190` بالدفتر مقابل مجموع المستندات المفتوحة — والفرقُ يُعلَن لا يُصحَّح. */
export class CashInTransitResponse {
  ledger!: string;
  documents!: string;
  matched!: boolean;
}

/** `GET /banks/cash-deposits` — الإيداعاتُ ومجموعُ الطريق. */
export class CashDepositListResponse {
  items!: CashDepositResponse[];
  inTransit!: CashInTransitResponse;
}
