import { IsUUID, ValidateIf } from 'class-validator';

/**
 * ⚖️ **نقلُ الموظّف للقادم** (`ق-١٤١٥` · التوجيه ٢٦٣ §٤).
 *
 * **الفرعُ السابق يُذكر في الطلب نفسِه** (`fromBranchId`) — شرطاً وأثراً: يُرفض النقلُ إن تغيّر فرعُ الموظّف منذ قُرئ
 * (نقلان متسابقان)، ويبقى في سجلّ التدقيق مع الجديد — **فالسجلُّ يحفظ جسمَ الطلب لا القيمةَ السابقة** (مقيسٌ في الموجز §٤)،
 * وبلا ذكره يضيع الفرعُ السابق مع أوّل نقل.
 */
export class TransferEmployeeDto {
  /** الفرعُ الذي قُرئ عليه الموظّف — `null` لموظّفٍ للمنشأة كلِّها؛ **ولا يُترك** (غيابُه ليس `null`). */
  @ValidateIf((o: TransferEmployeeDto) => o.fromBranchId !== null)
  @IsUUID()
  fromBranchId!: string | null;

  /** الفرعُ الذي يُنقل إليه من هذا الطلب. */
  @IsUUID()
  toBranchId!: string;
}
