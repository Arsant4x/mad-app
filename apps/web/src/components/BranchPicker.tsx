import type { Branch } from '../api/branches';

/**
 * The branch field shared by every document form.
 *
 * Renders **nothing** when the company has no branches — a single-location
 * business should never be asked to pick one, and every record simply stays
 * company-wide. The empty option means exactly that, and is the default.
 *
 * `branches` should come straight from `listBranches()`, which already returns
 * only what the signed-in user may write to, so no extra filtering is needed.
 */
export function BranchPicker({
  branches,
  value,
  onChange,
  label = 'الفرع',
}: {
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
  label?: string;
}) {
  if (branches.length === 0) return null;

  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— على مستوى الشركة —</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * الفرعُ **قراءةً** — لسجلٍّ يُحدَّد فرعُه عند الإنشاء ولا يقبل خادمُه تغييرَه في التعديل (`ق-١٣٨٤`: الحسابُ البنكيّ · الموظّف).
 * كان المُنتقي يُعرض في التعديل فيُرسَل الفرعُ ويُردّ الحفظُ كلُّه `400` — **فالشاشةُ تقول الحقيقة بدل أن تعرض اختياراً يُردّ**.
 * ولا يظهر لمنشأةٍ بلا فروع، كالمُنتقي نفسِه.
 */
export function BranchReadOnly({ branches, branchId, label = 'الفرع' }: { branches: Branch[]; branchId: string | null; label?: string }) {
  if (branches.length === 0) return null;
  const name = branchId ? (branches.find((b) => b.id === branchId)?.name ?? '—') : '— على مستوى الشركة —';
  return (
    <div className="field">
      <label>{label}</label>
      <p className="hint">{name} · يُحدَّد عند الإنشاء ولا يُغيَّر</p>
    </div>
  );
}
