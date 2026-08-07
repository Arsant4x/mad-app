/** Canonical screen ids gated by @RequiresScreen across the app (matches the
 * mockup's SCREEN_LABELS keys, trimmed to the screens actually built here). */
export const ALLOWED_SCREENS = [
  'dashboard',
  'accounts',
  'journal',
  'fiscal',
  'branches',
  'settings',
  'invoice',
  'customers',
  'suppliers',
  'products',
  'inventory',
  'properties',
  'contracts',
  'maintenance',
  'employees',
  'banks',
  'transactions',
  'obligations',
  'reports',
  'scripts',
  'audit',
  'pos',
] as const;

/**
 * Actions a permission may grant on a screen. The owner assigns any combination
 * per screen (e.g. contracts: view + add, invoices: view only). Enforcement is
 * **opt-in per endpoint** via @RequiresAction — an endpoint with no action
 * declared is still gated only by its screen, so nothing regresses.
 *
 * - view/add/edit/delete map to the obvious CRUD operations.
 * - record  = posting/committing a transaction (a journal entry, a payment).
 * - review  = approving/verifying (approve a leave, post a document).
 * - audit   = reading the audit trail (who did what).
 */
export const SCREEN_ACTIONS = ['view', 'add', 'edit', 'delete', 'record', 'review', 'audit'] as const;
export type ScreenAction = (typeof SCREEN_ACTIONS)[number];

/** A screen listed in `allowedScreens` with no explicit action set means "all
 * actions" — this keeps templates made before actions existed fully working. */
export type ScreenActionMap = Record<string, ScreenAction[]>;

/** True if the caller may perform `action` on `screen`, given a template. */
export function isActionAllowed(
  isAllScreens: boolean,
  allowedScreens: string[],
  screenActions: ScreenActionMap | null | undefined,
  screen: string,
  action: ScreenAction,
): boolean {
  if (isAllScreens) return true;
  if (!allowedScreens.includes(screen)) return false;
  const granted = screenActions?.[screen];
  // No per-screen action detail ⇒ full CRUD on a screen the user can reach.
  if (!granted) return true;
  return granted.includes(action);
}
