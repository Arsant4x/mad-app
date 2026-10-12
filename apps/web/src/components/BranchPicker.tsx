import { useTranslation } from 'react-i18next';
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
  label,
}: {
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  if (branches.length === 0) return null;

  return (
    <div className="field">
      <label>{label ?? t('common.branch_picker.label')}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('common.branch_picker.company_wide')}</option>
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
 * The branch, read only, for a record whose branch is set on create and cannot be changed by the server
 * on update (bank accounts, employees). Showing the picker there sent the branch and the whole save was
 * answered `400`, so the screen states the fact instead of offering a choice that is refused.
 * Hidden for a company without branches, like the picker.
 */
export function BranchReadOnly({ branches, branchId, label }: { branches: Branch[]; branchId: string | null; label?: string }) {
  const { t } = useTranslation();
  if (branches.length === 0) return null;
  const name = branchId ? (branches.find((b) => b.id === branchId)?.name ?? '—') : t('common.branch_picker.company_wide');
  return (
    <div className="field">
      <label>{label ?? t('common.branch_picker.label')}</label>
      <p className="hint">{t('common.branch_picker.fixed_at_creation', { name })}</p>
    </div>
  );
}
