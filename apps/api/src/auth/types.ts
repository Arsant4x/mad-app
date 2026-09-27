import { ActorType } from '@mad-app/db';

/** Claims carried inside the signed access token. */
export interface JwtPayload {
  /** LoginIdentity.id */
  sub: string;
  actorType: ActorType;
  /** Company.id — the tenant. Null for PLATFORM_ADMIN. */
  companyId: string | null;
  /** PlatformAdmin.id | Company.id | CompanyUser.id — the profile row id. */
  profileId: string;
  username: string;
}

/** Resolved, freshly-checked request-scoped tenant context (set by TenantGuard). */
export interface TenantContext {
  companyId: string;
  actorType: ActorType;
  profileId: string;
  allowedScreens: string[] | 'all';
  /**
   * Which branches this actor may see. `'all'` for the company owner, and for
   * an employee whose `allBranches` flag is set (`ق-١٤٦٨`) — an employee with no
   * assignment and no flag gets `[]`: company-wide rows only.
   *
   * Unlike `companyId` — an absolute boundary enforced by RLS — this is a
   * *permission* filter applied in queries. Keep the two distinct: a bug here
   * shows one branch's data to a colleague in the same company; a bug in
   * companyId scoping leaks another company's data entirely.
   */
  allowedBranchIds: string[] | 'all';
}

declare module 'express' {
  interface Request {
    tenant?: TenantContext;
  }
}
