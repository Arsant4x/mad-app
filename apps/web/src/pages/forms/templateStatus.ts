import type { FormTemplateRow } from '../../api/forms';
import i18n from '../../i18n';

const entry = (code: FormTemplateRow['status'], badgeClass: string) => ({
  badgeClass,
  get label() {
    return i18n.t(`forms.template_status.${code.toLowerCase()}`);
  },
});

/** Template version state: a draft is edited, a published one is filled in, an archived one was superseded by a newer publication. */
export const TEMPLATE_STATUS_META: Record<FormTemplateRow['status'], { label: string; badgeClass: string }> = {
  DRAFT: entry('DRAFT', 'due'),
  PUBLISHED: entry('PUBLISHED', 'paid'),
  ARCHIVED: entry('ARCHIVED', 'draft'),
};

/** Versions grouped by template, newest version first, so each template reads in sequence. */
export function sortTemplateRows(rows: readonly FormTemplateRow[]): FormTemplateRow[] {
  return [...rows].sort((a, b) => (a.familyId === b.familyId ? b.version - a.version : a.name.localeCompare(b.name, 'ar') || a.familyId.localeCompare(b.familyId)));
}
