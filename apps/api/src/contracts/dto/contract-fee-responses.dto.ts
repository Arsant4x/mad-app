/**
 * ⚖️ **ردودُ بنود الرسوم على العقد** (السؤالان ٤٩ و٤١٣ · `ق-١٦٠٠` · `ق-١٤٣٨`) بأصنافٍ مسمّاة — البندُ كما يُخرجه
 * `presentFee()`: المالُ نصٌّ بخانتين، والأيامُ `YYYY-MM-DD`. والعقدُ بعد الإضافة أو الإنهاء يُقرأ من `GET /contracts/:id`.
 */

/** بندُ رسمٍ على العقد — لكلِّ قسطٍ صافياً بعملة العقد، والضريبةُ فوقه على مطالبته. */
export class ContractFeeResponse {
  id!: string;
  contractId!: string;
  label!: string;
  amount!: string;
  /** أوّلُ يومٍ يُطالَب فيه. */
  effectiveFrom!: string;
  /** آخرُ يومٍ يُطالَب فيه — وفارغٌ ما دام سارياً. */
  endedAt!: string | null;
}

/** `POST /contracts/:id/fees` — وعددُ المطالبات التي رُفعت في اللحظة نفسِها لما حلّ من أقساطه منذ سريانه. */
export class CreatedContractFeeResponse extends ContractFeeResponse {
  raisedClaims!: number;
}
