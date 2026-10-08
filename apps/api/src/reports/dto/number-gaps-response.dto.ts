/**
 * ⚖️ ردُّ تقرير الأرقام المأخوذة غير المستعملة (`ق-٣٤٥`، بُني في توجيه ٢٨٦): لكلِّ سلسلةٍ ما أُخذ منها منذ بدأ التسجيل،
 * و«أُخذ ولم يُستعمل» لما ارتدّت معاملتُه، و«قيد المعالجة» لما أُخذ في الدقائق العشر الأخيرة.
 */

/** رقمٌ أُخذ من العدّاد: اسمُه كما يُعرض، وعددُه، ووقتُ أخذه. */
export class TakenNumberResponse {
  no!: string;
  number!: number;
  allocatedAt!: string;
}

/** سلسلةٌ واحدة (نوعٌ وسنة، والسنةُ صفرٌ لما لا يبدأ كلَّ سنة). */
export class NumberGapSeriesResponse {
  kind!: string;
  year!: number;
  taken!: number;
  /** أوّلُ رقمٍ سُجّل في السلسلة — وما قبله صدر قبل بناء السجلّ. */
  firstRecorded!: number | null;
  lastRecorded!: number | null;
  recordedSince!: string | null;
  unused!: TakenNumberResponse[];
  pending!: TakenNumberResponse[];
}

export class NumberGapsResponse {
  asOf!: string;
  series!: NumberGapSeriesResponse[];
}
