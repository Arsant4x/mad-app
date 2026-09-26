/**
 * ⚖️ **ردُّ إغلاق الفرع وإعادة فتحه** (`ق-١٤٥٣`) بصنفٍ مسمّى — مساران جديدان بعد مِسنَن الردود (`ق-١٤٣٨`)، **والمِسنَنُ لا يزيد**.
 *
 * **والحقولُ كما تُرسَل** (نمطُ `pos-responses.dto.ts`): التاريخُ نصُّ `ISO`. **والصنفُ حدٌّ أدنى**: الفرعُ يُرسَل بما يضمّه (النشاطُ
 * والعقارُ والمستودع) — والمعلَنُ هنا أعمدتُه التي يحملها كلُّ ردٍّ، ومنها `closedAt` الذي بُني له المساران.
 */
export class BranchResponse {
  id!: string;
  name!: string;
  type!: string | null;
  activityId!: string | null;
  propertyId!: string | null;
  warehouseId!: string | null;
  hours!: string | null;
  /** `null` ⟸ مفتوح · تاريخُ الإغلاق ⟸ مغلقٌ لا مستندَ جديدٌ فيه (`ق-١٤٥٣`). */
  closedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}
