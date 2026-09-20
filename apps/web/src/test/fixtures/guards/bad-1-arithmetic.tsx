// كسرٌ مقصود للقاعدة ① — كما قد يكتبه مطوّرٌ فعلاً (§8.8 الوجه الثاني: صياغةٌ محتملة لا مصطنعة).
// بطاقةُ عميلٍ تجمع الفواتير بنفسها بدل أن تقرأ `outstanding` من الخادم.
import type { Money } from '../../../api/wire';
import type { ContractRow } from '../../../hooks/contracts';

export function BadArithmetic({ rows, total, days }: { rows: ContractRow[]; total: Money; days: { n: number }[] }) {
  const billed = rows.reduce((s, r) => s + Number(r.value), 0);
  const withVat = Number(total) * 1.15;
  const label = total + ' ريال';
  const leave = days.reduce((s, d) => s + d.n, 0);
  return (
    <div>
      {billed} {withVat} {label} {leave}
    </div>
  );
}
