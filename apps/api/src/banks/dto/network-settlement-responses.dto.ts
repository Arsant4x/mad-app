import { ApiProperty } from '@nestjs/swagger';
import { NetworkSettlementStatus } from '@mad-app/db';
import { BanksRefResponse } from './bank-responses.dto';

/**
 * ⚖️ **ردودُ تسوية الشبكة `1251`** (`ق-١٤٥٠` · ⑦A2 — `network-settlements.service.ts`) بأصنافٍ مسمّاة.
 * التسويةُ كما يُخرجها `present()`: المالُ نصٌّ بخانتين، والأيامُ `YYYY-MM-DD`، وعددُ السندات المطالَب بها رقم.
 */

/** التسويةُ في القائمة — بنكُها مسمّىً، وقيدُها وقيدُ عكسها (فارغان حيث لم يقعا — العمودان `String?`). */
export class NetworkSettlementResponse {
  id!: string;
  no!: string;
  /** يومُ دخول التحصيل إلى البنك. */
  date!: string;
  periodFrom!: string;
  periodTo!: string;
  grossAmount!: string;
  feeAmount!: string;
  feeVatAmount!: string;
  netAmount!: string;
  memo!: string | null;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: NetworkSettlementStatus })
  status!: NetworkSettlementStatus;
  branchId!: string | null;
  bankId!: string;
  bank!: BanksRefResponse;
  journalEntryId!: string | null;
  voidJournalEntryId!: string | null;
  receiptCount!: number;
}

/** `POST /banks/network-settlements` — ورقمُ قيد التسوية. */
export class CreatedNetworkSettlementResponse extends NetworkSettlementResponse {
  entryNo!: string;
}

/** `POST /banks/network-settlements/:settlementId/void` — ورقمُ قيد العكس. */
export class VoidedNetworkSettlementResponse extends NetworkSettlementResponse {
  voidEntryNo!: string;
}

/** رصيدُ `1251` بالدفتر مقابل مجموع السندات المفتوحة — والفرقُ يُعلَن لا يُصحَّح. */
export class NetworkTransitSummaryResponse {
  ledger!: string;
  open!: string;
  openCount!: number;
  matched!: boolean;
}

/** `GET /banks/network-settlements` — التسوياتُ وملخّصُ `1251`. */
export class NetworkSettlementListResponse {
  items!: NetworkSettlementResponse[];
  summary!: NetworkTransitSummaryResponse;
}

/** سندُ قبضٍ مفتوحٌ على الشبكة — ومبلغُه ما رحّله على `1251` نصّاً بإشارته (العكسُ والردُّ سالبان). */
export class OpenNetworkReceiptResponse {
  id!: string;
  no!: string;
  /** يومُ السند `YYYY-MM-DD`. */
  date!: string;
  branchId!: string | null;
  customerName!: string;
  signed!: string;
}

/** `GET /banks/network-settlements/open` — ما ستطالب به تسويةٌ للمدى، وإجماليُّه، وملخّصُ `1251`. */
export class OpenNetworkReceiptsResponse {
  receipts!: OpenNetworkReceiptResponse[];
  gross!: string;
  summary!: NetworkTransitSummaryResponse;
}
