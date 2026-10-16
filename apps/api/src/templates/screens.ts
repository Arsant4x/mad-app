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
  'payments',
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
  'quotes',
  // ⚖️ `ق-١٦٤١`/٢: قوالبُ المنشأة يعدّلها المالكُ ومن يمنحه شاشةَ «النماذج» في قالب صلاحياته (بُني بترتيب `ق-١٦٤٥`/٣).
  'forms',
] as const;

/**
 * Actions a permission may grant on a screen. The owner assigns any combination
 * per screen (e.g. contracts: view + add, invoices: view only). Each endpoint
 * names its action via @RequiresAction; a write under a screen without one is
 * refused by TenantGuard unless marked @OwnerOnly or @TenantWide.
 *
 * - view/add/edit/delete map to the obvious CRUD operations.
 * - record  = posting/committing a transaction (a journal entry, a payment).
 * - review  = approving/verifying (approve a leave, post a document).
 * - audit   = reading the audit trail (who did what).
 */
export const SCREEN_ACTIONS = ['view', 'add', 'edit', 'delete', 'record', 'review', 'audit'] as const;

/**
 * Actions that exist on one screen only, on top of the general ones.
 *
 * - salaries = read and set an employee's base salary (employees screen).
 */
export const SCREEN_ONLY_ACTIONS = {
  employees: ['salaries'],
} as const satisfies Partial<Record<(typeof ALLOWED_SCREENS)[number], readonly string[]>>;

type ScreenOnlyAction = (typeof SCREEN_ONLY_ACTIONS)[keyof typeof SCREEN_ONLY_ACTIONS][number];
export type ScreenAction = (typeof SCREEN_ACTIONS)[number] | ScreenOnlyAction;

/** Every action name: the general ones first, then the screen-only ones. */
export const ALL_ACTIONS: readonly ScreenAction[] = [...SCREEN_ACTIONS, ...new Set(Object.values(SCREEN_ONLY_ACTIONS).flat())];

/** The actions that exist on a screen, in order. */
export function actionsFor(screen: string): readonly ScreenAction[] {
  const only = (SCREEN_ONLY_ACTIONS as Partial<Record<string, readonly ScreenAction[]>>)[screen] ?? [];
  return [...SCREEN_ACTIONS, ...only];
}

/**
 * Actions the company owner holds on a screen whatever the company template lists, so a template
 * written before the action existed cannot take it from the owner.
 */
export const OWNER_HELD_ACTIONS: Readonly<Record<string, readonly ScreenAction[]>> = {
  employees: ['salaries'],
};

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
  // A screen-only action does not exist on any other screen, not even for an all-screens template.
  if (!actionsFor(screen).includes(action)) return false;
  if (isAllScreens) return true;
  if (!allowedScreens.includes(screen)) return false;
  const granted = screenActions?.[screen];
  // No per-screen action detail ⇒ full CRUD on a screen the user can reach.
  if (!granted) return true;
  return granted.includes(action);
}
