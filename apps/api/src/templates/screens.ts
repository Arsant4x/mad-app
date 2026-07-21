/** Canonical screen ids gated by @RequiresScreen across the app (matches the
 * mockup's SCREEN_LABELS keys, trimmed to the screens actually built here). */
export const ALLOWED_SCREENS = [
  'dashboard',
  'accounts',
  'journal',
  'invoice',
  'customers',
  'suppliers',
  'products',
  'inventory',
  'properties',
  'contracts',
  'employees',
  'banks',
  'transactions',
  'obligations',
  'reports',
  'scripts',
] as const;
